import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hoursToMs, MAX_FEED_ROWS } from "../src/lib/ebay-context";
import { parseContext } from "../src/lib/ebay-context-parse";
import { cascadeFor, listingsFor, rowIsSafe, rowToItem, type ListingRow, type ReadDeps } from "../src/lib/ebay-read";
import { GOOD, handleListings, SHORT } from "../src/lib/ebay-route";
import { REGION_LIST, type Region } from "../src/lib/regions";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const SECRET = "ROUTE-SECRET-s3cr3t";

const row = (feed: string, rank: number, ageH: number, over: Partial<ListingRow> = {}): ListingRow => ({
  feed,
  rank,
  itemId: `${feed}-${rank}`,
  title: `Title ${feed} ${rank}`,
  imageUrl: `https://i.ebayimg.com/images/g/${rank}/s-l500.jpg`,
  priceValue: "99.50",
  currency: "AUD",
  shipValue: null,
  shipFree: true,
  condition: null,
  url: "https://www.ebay.com.au/itm/1?mkevt=1&campid=5339155912&customid=dex-au-chase",
  fetchedAt: new Date(NOW - ageH * 3600_000),
  ...over,
});
const feedRows = (feed: string, n: number, ageH: number) => Array.from({ length: n }, (_, i) => row(feed, i, ageH));

/** A fake database: the real SQL's contract (first fresh feed in priority order with >= its own minimum of rows, at most MAX_FEED_ROWS rows). */
function fake(all: ListingRow[], env: Record<string, string | undefined> = {}, products: Record<string, { id: string; productType: string }> = {}) {
  const log: { feeds: readonly string[]; cutoff: Date; mins: readonly number[] }[] = [];
  const deps: ReadDeps = {
    env,
    now: () => NOW,
    async product(slug) {
      return products[slug] ?? null;
    },
    async rows(feeds, cutoff, mins) {
      log.push({ feeds, cutoff, mins });
      for (const [i, f] of feeds.entries()) {
        const mine = all.filter((r) => r.feed === f && r.fetchedAt >= cutoff);
        if (mine.length >= mins[i]) return mine.sort((a, b) => a.rank - b.rank).slice(0, 12); // a reader that returns MORE than the route may show: the route cuts
      }
      return [];
    },
  };
  return { deps, log };
}
const call = (deps: ReadDeps, region: string, c?: string) => handleListings(new Request(`http://localhost:3091/api/ebay/${region}${c === undefined ? "" : `?c=${encodeURIComponent(c)}`}`), region, deps);
const ETB = { id: "prod1", productType: "Elite Trainer Box" };

test("cascade: item → type → sealed, set → chase, type → sealed, chase and sealed alone", () => {
  const keys = (c: string, region: Region = "au", p?: typeof ETB | null) => cascadeFor(parseContext(c)!, region, p).map((x) => x.key);
  assert.deepEqual(keys("item:x", "au", ETB), ["EBAY_AU|item:prod1", "EBAY_AU|type:elite-trainer-boxes", "EBAY_AU|sealed"]);
  assert.deepEqual(keys("item:x", "nz", ETB), ["EBAY_AU|item:prod1", "EBAY_AU|type:elite-trainer-boxes", "EBAY_AU|sealed"], "NZ reads the AU marketplace's feeds");
  // the generic sealed feed (boxes, ETBs, UPCs from US$30) stands in only for the types whose own prices are that class
  assert.deepEqual(keys("item:x", "sg", { id: "p2", productType: "Tin" }), ["EBAY_US|item:p2", "EBAY_US|type:tins"], "a tin never falls back to boxes");
  assert.deepEqual(keys("item:x", "au", { id: "p4", productType: "Booster Pack" }), ["EBAY_AU|item:p4", "EBAY_AU|type:booster-packs"]);
  assert.deepEqual(keys("type:tins", "us"), ["EBAY_US|type:tins"]);
  assert.deepEqual(keys("type:booster-bundles", "us"), ["EBAY_US|type:booster-bundles"]);
  assert.deepEqual(keys("set:surging-sparks", "uk"), ["EBAY_GB|set:surging-sparks", "EBAY_GB|chase"]);
  assert.deepEqual(keys("type:booster-boxes", "eu"), ["EBAY_DE|type:booster-boxes", "EBAY_DE|sealed"]);
  assert.deepEqual(keys("chase", "ca"), ["EBAY_CA|chase"]);
  assert.deepEqual(keys("sealed", "us"), ["EBAY_US|sealed"]);
  assert.deepEqual(keys("item:x", "au", { id: "p3", productType: "Unknown Label" }), ["EBAY_AU|item:p3"], "an unknown type gets no mismatched stand-in");
});

test("the cascade answers with the FIRST feed that has rows: a product's own listings from one, any other feed from two", async () => {
  const all = [...feedRows("EBAY_AU|type:elite-trainer-boxes", 8, 3), ...feedRows("EBAY_AU|sealed", 12, 3), ...feedRows("EBAY_AU|item:prod1", 1, 3)];
  const f = fake(all, {}, { "my-etb": ETB });
  let body = await (await call(f.deps, "au", "item:my-etb")).json();
  assert.equal(body.feed, "item", "one listing is still the product's eBay price");
  assert.equal(body.items.length, 1);
  assert.deepEqual(f.log.at(-1)!.mins, [1, 2, 2], "the item feed needs one row, the type and sealed feeds two");
  all.push(row("EBAY_AU|item:prod1", 1, 3));
  body = await (await call(f.deps, "au", "item:my-etb")).json();
  assert.equal(body.feed, "item");
  assert.equal(body.items.length, 2);
  // a TYPE feed with one row does not qualify: the next feed answers
  const lone = fake([...feedRows("EBAY_GB|type:booster-boxes", 1, 3), ...feedRows("EBAY_GB|sealed", 5, 3)]);
  body = await (await call(lone.deps, "uk", "type:booster-boxes")).json();
  assert.equal(body.feed, "sealed");
  // set → chase
  body = await (await call(fake(feedRows("EBAY_US|chase", 12, 1)).deps, "us", "set:surging-sparks")).json();
  assert.equal(body.feed, "chase");
  assert.equal(MAX_FEED_ROWS, 8);
  assert.equal(body.items.length, MAX_FEED_ROWS, "a strip shows six (the browse card the seventh): a response never carries more than 8 rows");
  // type → sealed, for the types whose own prices are that class; a tins page is not answered with boxes
  body = await (await call(fake(feedRows("EBAY_GB|sealed", 5, 1)).deps, "uk", "type:booster-boxes")).json();
  assert.equal(body.feed, "sealed");
  body = await (await call(fake(feedRows("EBAY_GB|sealed", 5, 1)).deps, "uk", "type:tins")).json();
  assert.equal(body.feed, null);
  assert.equal(body.items.length, 0);
});

test("the response: whitelisted fields only, rows in rank order, fetchedAt = the OLDEST row, maxAgeMs", async () => {
  const rows = [row("EBAY_AU|chase", 1, 5, { shipFree: false, shipValue: "12.00", condition: "Used" }), row("EBAY_AU|chase", 0, 9), row("EBAY_AU|chase", 2, 7, { shipFree: null })];
  const res = await call(fake(rows).deps, "au", "chase");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["feed", "fetchedAt", "items", "maxAgeMs"]);
  assert.equal(body.maxAgeMs, hoursToMs(26));
  assert.equal(body.fetchedAt, new Date(NOW - 9 * 3600_000).toISOString());
  assert.deepEqual(body.items.map((i: { id: string }) => i.id), ["EBAY_AU|chase-0", "EBAY_AU|chase-1", "EBAY_AU|chase-2"]);
  for (const it of body.items) assert.deepEqual(Object.keys(it).filter((k) => k !== "ship" && k !== "condition").sort(), ["id", "imageUrl", "price", "title", "url"]);
  assert.deepEqual(body.items[0].ship, { free: true });
  assert.deepEqual(body.items[1].ship, { value: "12.00", currency: "AUD" });
  assert.equal(body.items[1].condition, "Used");
  assert.equal(body.items[2].ship, undefined);
  assert.deepEqual(rowToItem(row("f", 0, 1, { shipFree: null, shipValue: null })).ship, undefined);
  assert.ok(!JSON.stringify(body).includes(SECRET));
});

test("the age bound: never a row older than it, server-side; default 26 h, 5.5 h in compliant mode", async () => {
  const rows = feedRows("EBAY_AU|chase", 6, 20);
  assert.equal((await (await call(fake(rows).deps, "au", "chase")).json()).items.length, 6);
  const strict = fake(rows, { EBAY_LISTING_MAX_AGE_HOURS: "5.5" });
  const body = await (await call(strict.deps, "au", "chase")).json();
  assert.equal(body.items.length, 0);
  assert.equal(body.reason, "empty");
  assert.equal(body.maxAgeMs, 19_800_000);
  assert.equal(strict.log[0].cutoff.getTime(), NOW - 19_800_000);
  assert.equal((await (await call(fake(feedRows("EBAY_AU|chase", 6, 27)).deps, "au", "chase")).json()).items.length, 0, "27 h is over the default");
  // a reader that returns too much is still held to the bound
  const leaky: ReadDeps = { ...fake([]).deps, async rows() { return feedRows("EBAY_AU|chase", 6, 30); } };
  assert.equal((await (await call(leaky, "au", "chase")).json()).items.length, 0);
  // a garbage setting falls back to 26 h
  assert.equal((await (await call(fake(rows, { EBAY_LISTING_MAX_AGE_HOURS: "soon" }).deps, "au", "chase")).json()).maxAgeMs, hoursToMs(26));
});

test("missing tables, database errors, unknown products: empty, no error text", async () => {
  const boom: ReadDeps = { ...fake([]).deps, async rows() { throw new Error(`relation "EbayListing" does not exist ${SECRET}`); }, async product() { throw new Error(SECRET); } };
  for (const c of ["chase", "sealed", "set:surging-sparks", "type:tins", "item:anything"]) {
    const res = await call(boom, "au", c);
    assert.equal(res.status, 200, c);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { feed: null, items: [], fetchedAt: null, maxAgeMs: hoursToMs(26), reason: "empty" }, c);
    assert.ok(!text.includes(SECRET) && !/relation|does not exist/.test(text));
    assert.equal(res.headers.get("cache-control"), SHORT);
  }
  const unknown = await (await call(fake(feedRows("EBAY_AU|sealed", 12, 1)).deps, "au", "item:no-such-product")).json();
  assert.equal(unknown.items.length, 0, "an unknown product does not fall through to someone else's data");
  assert.equal(unknown.reason, "empty");
});

test("bad region or context: 400, no data, no error text, nothing read", async () => {
  const f = fake(feedRows("EBAY_AU|chase", 6, 1));
  for (const [region, c] of [["xx", "chase"], ["AU", "chase"], ["au", "set:not-a-set"], ["au", "home"], ["au", "../../etc/passwd"], ["au", "set:surging-sparks%27;DROP TABLE"], ["au", "item:" + "a".repeat(200)], ["au", ""], ["../au", "chase"]] as const) {
    const res = await call(f.deps, region, c);
    assert.equal(res.status, 400, `${region} ${c}`);
    assert.deepEqual(Object.keys(await res.json()).sort(), ["feed", "fetchedAt", "items", "maxAgeMs", "reason"]);
  }
  assert.equal(f.log.length, 0, "a rejected request never reaches the database");
  // no `c` at all means the generic chase feed
  const none = await (await call(f.deps, "au")).json();
  assert.equal(none.feed, "chase");
});

test("kill switch: EBAY_LISTINGS=off answers empty and reads nothing", async () => {
  const f = fake(feedRows("EBAY_AU|chase", 6, 1), { EBAY_LISTINGS: "off" });
  const body = await (await call(f.deps, "au", "chase")).json();
  assert.equal(body.items.length, 0);
  assert.equal(body.reason, "off");
  assert.equal(f.log.length, 0);
  assert.equal((await (await call(fake(feedRows("EBAY_AU|chase", 6, 1), { EBAY_LISTINGS: "OFF " }).deps, "au", "chase")).json()).reason, "off");
  assert.equal((await (await call(fake(feedRows("EBAY_AU|chase", 6, 1), { EBAY_LISTINGS: "on" }).deps, "au", "chase")).json()).items.length, 6);
});

test("headers: public CDN an hour (then stale-while-revalidate) for an answer, 10 minutes for an empty one, nosniff, JSON", async () => {
  assert.equal(GOOD, "public, max-age=60, s-maxage=3600, stale-while-revalidate=82800");
  assert.equal(SHORT, "public, max-age=30, s-maxage=600");
  assert.doesNotMatch(SHORT, /stale/, "an empty or failed answer is never served stale");
  // the edge never keeps a good answer, stale copies included, past a day: the browser's age bound (26 h) still decides what is shown
  const sec = (h: string, k: string) => Number(new RegExp(`${k}=(\\d+)`).exec(h)?.[1]);
  assert.ok(sec(GOOD, "s-maxage") + sec(GOOD, "stale-while-revalidate") <= 24 * 3600);
  const good = await call(fake(feedRows("EBAY_AU|chase", 6, 1)).deps, "au", "chase");
  assert.equal(good.headers.get("cache-control"), GOOD);
  assert.match(good.headers.get("content-type")!, /application\/json/);
  assert.equal(good.headers.get("x-content-type-options"), "nosniff");
  const empty = await call(fake([]).deps, "au", "chase");
  assert.equal(empty.headers.get("cache-control"), SHORT);
  const bad = await call(fake([]).deps, "zz", "chase");
  assert.equal(bad.headers.get("cache-control"), SHORT);
});

test("every region reads its marketplace's feeds, one query per request", async () => {
  for (const r of REGION_LIST) {
    const f = fake([]);
    await call(f.deps, r.region, "type:booster-boxes");
    assert.equal(f.log.length, 1, "ONE read");
    assert.ok(f.log[0].feeds.every((k) => /^EBAY_(US|AU|GB|CA|DE)\|/.test(k)));
    assert.deepEqual(f.log[0].mins, [2, 2], "a type feed and generic sealed each need two rows");
  }
});

test("listingsFor never throws, whatever the reader does", async () => {
  for (const bad of [null, undefined, "x", [{}], [{ feed: 5 }]]) {
    const d: ReadDeps = { ...fake([]).deps, async rows() { return bad as unknown as ListingRow[]; } };
    const out = await listingsFor(parseContext("chase")!, "au", d);
    assert.deepEqual(out.items, []);
  }
});

test("the route is wired to the database and holds no eBay call or secret", async () => {
  const text = readFileSync(new URL("../src/app/api/ebay/[region]/route.ts", import.meta.url), "utf8");
  const code = text.replace(/\/\/.*$/gm, "");
  assert.ok(!/fetch\(|EBAY_CLIENT|ebay-api|api\.ebay\.com|Authorization/.test(code));
  assert.ok(/export const runtime = "nodejs"/.test(text));
  // the route, with the tables absent (the real client, no database reachable or no such table): empty, 200, no throw.
  // The route is imported AFTER the unreachable URL is set (db.ts builds its client on import), so the test does not depend on
  // whatever DATABASE_URL the shell or .env happens to hold.
  const prevUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=1";
  try {
    const { GET } = await import("../src/app/api/ebay/[region]/route");
    assert.equal(typeof GET, "function");
    const res = await GET(new Request("http://localhost/api/ebay/au?c=chase"), { params: { region: "au" } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reason, "empty");
  } finally {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
  }
});

// ─── URL checks at read time and in the normaliser (review SEC-10) ──────────────

test("a stored row whose link is not one eBay item page with a campaign id, or whose picture is not on eBay's host, is never returned", async () => {
  const good = "https://www.ebay.com/itm/123456789012?mkevt=1&campid=5339155912&customid=dex-au-chase";
  const bad: Partial<ListingRow>[] = [
    { url: "https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&campid=5339155912" },
    { url: "https://www.ebay.com:8443/itm/123456789012?campid=5339155912" },
    { url: "https://www.ebay.com/itm/123456789012?campid=5339155912&campid=1111111111" },
    { url: "https://www.ebay.com/itm/123456789012?mkevt=1" }, // no campaign id at all
    { url: "https://www.ebay.com/itm/123456789012?campid=" },
    { url: "https://www.ebay.com/itm/123456789012?campid=abc" },
    { url: "http://www.ebay.com/itm/123456789012?campid=5339155912" },
    { url: "https://www.ebay.com.evil.example/itm/123456789012?campid=5339155912" },
    { url: "https://www.ebay.com/sch/i.html?_nkw=x&campid=5339155912" },
    { imageUrl: "https://i.ebayimg.com:444/images/g/x/s-l500.jpg" },
    { imageUrl: "https://evil.example/x.jpg" },
    { imageUrl: "http://i.ebayimg.com/x.jpg" },
  ];
  for (const b of bad) assert.equal(rowIsSafe(row("EBAY_US|chase", 0, 1, { url: good, ...b })), false, JSON.stringify(b));
  assert.equal(rowIsSafe(row("EBAY_US|chase", 0, 1, { url: good })), true);
  // the runtime does not compare the campaign id with its own NEXT_PUBLIC_EBAY_CAMPAIGN_ID (the importer enforced the owner's when it wrote the row)
  assert.equal(rowIsSafe(row("EBAY_US|chase", 0, 1, { url: "https://www.ebay.com/itm/123456789012?campid=1111111111" })), true);
  assert.equal(rowIsSafe(row("EBAY_US|chase", 0, 1, { url: "https://www.ebay.com.au/itm/Some-Title-Slug/123456789012?campid=5339155912" })), true, "title-slug form");
  // two safe rows and one unsafe: the feed has 2 live rows and still answers; unsafe ones alone do not
  const f = fake([row("EBAY_US|chase", 0, 1, { url: good }), row("EBAY_US|chase", 1, 1, { url: good }), row("EBAY_US|chase", 2, 1, { url: "https://signin.ebay.com/x?campid=5339155912" })]);
  const out = await listingsFor({ kind: "chase", slug: null } as never, "us", f.deps);
  assert.equal(out.items.length, 2);
});

test("a stored sealed row the importer's rules now refuse (a product's contents, a lot) is not shown; card feeds keep their own filter", async () => {
  const bad = { ...row("EBAY_US|item:prod1", 0, 1), title: "3 Promo Sealed Pokemon 30th Anniversary Energy Packs From Elite Trainer Box" };
  const good = { ...row("EBAY_US|item:prod1", 1, 1), title: "Pokemon TCG 30th Celebration Elite Trainer Box Sealed" };
  assert.equal(rowIsSafe(bad), false);
  assert.equal(rowIsSafe(good), true);
  const body = await (await call(fake([bad, good], {}, { "my-etb": ETB }).deps, "us", "item:my-etb")).json();
  assert.equal(body.feed, "item");
  assert.deepEqual(body.items.map((i: { title: string }) => i.title), [good.title]);
  // a chase card's title is never judged by the sealed rules here
  assert.equal(rowIsSafe({ ...row("EBAY_US|chase", 0, 1), title: "Charizard ex 199/165 Special Illustration Rare from booster box" }), true);
});
