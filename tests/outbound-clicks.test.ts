// The outbound click log (contract 10.32, REQUIREMENTS 9 and 11): restored, batched, sampled and switchable. It replaces OP's tests/no-outbound-click-tracking.test.ts, whose reason (a database write per click)
// the shape here answers: a click is a 204 and a buffered row; the buffer is written in ONE insert inside the first minute of a wall-clock half hour, shared with the card-view counter, so views and clicks together wake
// the database at most 48 times a day. Owner WP15.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ClickBatcher, CLICK_DEFAULTS, ViewBatcher, BEACON_DEFAULTS } from "../src/lib/data/plane/view-beacon";
import {
  CLICK_BODY_MAX_BYTES, CLICK_RETENTION_DAYS, clickConfig, clickLogOn, countryOfRequest, flushClicks, getClickBatcher, pageOfReferer, parseClickBody, recordClick, resetClickBatcherForTests, sameOrigin, type ClickDb,
} from "../src/lib/click-event";
import { buyClickProps } from "../src/lib/buy-click";
import { POST } from "../src/app/api/click/route";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const T0 = Date.UTC(2026, 9, 8, 12, 0, 0);                        // 12:00:00 UTC: the start of a half hour
const MIN = 60_000, HALF = 30 * MIN, DAY = 86_400_000;
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

/** A fake database that counts statements; `fail` makes the insert throw. */
function fakeDb(opts: { fail?: boolean } = {}): ClickDb & { inserts: { data: { retailer: string; createdAt: Date; country: string; userId: string | null }[] }[]; sweeps: { where: { createdAt: { lt: Date } } }[] } {
  const inserts: { data: { retailer: string; createdAt: Date; country: string; userId: string | null }[] }[] = [], sweeps: { where: { createdAt: { lt: Date } } }[] = [];
  return {
    inserts, sweeps,
    clickEvent: {
      createMany: async (args) => { if (opts.fail) throw new Error("connection refused"); inserts.push(args as never); return {}; },
      deleteMany: async (args) => { sweeps.push(args); return {}; },
    },
  };
}
const batcherAt = (clock: { t: number }, cfg = CLICK_DEFAULTS) => new ClickBatcher(() => clock.t, () => 0, cfg);

// ── what a click is ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("a beacon body becomes a row: retailer, page, card slug, the entry bucket and the SERVER's market; no user id, ever", () => {
  const row = parseClickBody({ retailer: "Store:CardKingdom", page: "card", card: "counterspell-mh2-267", entry: "reddit", userId: "u-1", country: "AU", ip: "1.2.3.4" }, "UK");
  assert.deepEqual(row, { retailer: "store:cardkingdom", page: "card", slug: "counterspell-mh2-267", country: "UK", userId: null, entry: "reddit" });
  assert.equal(parseClickBody({ retailer: "ebay_chase", page: "home" }, "US")!.slug, null);
  assert.equal(parseClickBody({ retailer: "tcgplayer", card: "sol-ring-c21-263" }, "US", "price-guide")!.page, "price-guide", "no data-page: the referring page type");
  assert.equal(parseClickBody({ retailer: "tcgplayer", page: "Not a page!" }, "US")!.page, "home");
  assert.equal(parseClickBody({ retailer: "tcgplayer", entry: "somewhere-else" }, "US")!.entry, null, "only the entry buckets of entry-source.ts");
  assert.equal(parseClickBody({ retailer: "tcgplayer", card: "Sol Ring/../x" }, "US")!.slug, null);
  for (const bad of [null, undefined, 5, "retailer", [], {}, { retailer: "" }, { retailer: "x".repeat(61) }, { retailer: "a b" }, { retailer: "https://evil.example" }, { retailer: 7 }]) assert.equal(parseClickBody(bad, "US"), null, JSON.stringify(bad));
});

test("the browser builds its body from the same pure helper as the Vercel buy_click event, so the two never disagree about what a retailer is", () => {
  const props = buyClickProps({ retailer: "store:cardkingdom", page: "card", card: "counterspell-mh2-267", surface: "price-row" }, "/card/counterspell-mh2-267");
  assert.deepEqual(props, { retailer: "store:cardkingdom", network: "store", page: "card", surface: "price-row", card: "counterspell-mh2-267" });
  assert.deepEqual(parseClickBody({ retailer: props!.retailer, page: props!.page, card: props!.card }, "US"), { retailer: "store:cardkingdom", page: "card", slug: "counterspell-mh2-267", country: "US", userId: null, entry: null });
  for (const r of ["store:cardkingdom", "tcgplayer", "ebay", "ebay_search", "ebay_chase", "ebay_chase_search", "buy_list", "store:mythicstore"]) assert.ok(parseClickBody({ retailer: r }, "US"), r);
});

test("the market is the visitor's: their country cookie, else Vercel's geo header, else the default", () => {
  assert.equal(countryOfRequest("theme=dark; country=AU; mc_auth=1", "US"), "AU");
  assert.equal(countryOfRequest("country=gb", null), "UK");
  assert.equal(countryOfRequest("country=%45U", null), "EU");
  assert.equal(countryOfRequest(null, "DE"), "EU", "a German visitor with no cookie shops in the EU market");
  assert.equal(countryOfRequest("theme=dark", "SG"), "SG");
  assert.equal(countryOfRequest(null, null), "US");
  assert.equal(countryOfRequest("country=%E0%A4%A", "CA"), "CA", "a malformed cookie falls through to the header");
});

test("only a page of this site may post: Origin, else Referer, must be the host; the page type comes from the Referer", () => {
  assert.ok(sameOrigin("https://mtgcompare.app", null, "mtgcompare.app"));
  assert.ok(sameOrigin(null, "https://mtgcompare.app/card/x", "mtgcompare.app"), "no Origin: the Referer decides");
  assert.ok(!sameOrigin("https://evil.example", "https://mtgcompare.app/", "mtgcompare.app"), "Origin wins over Referer");
  assert.ok(!sameOrigin(null, null, "mtgcompare.app"), "neither header: not a browser beacon");
  assert.ok(!sameOrigin("not a url", null, "mtgcompare.app") && !sameOrigin("https://mtgcompare.app", null, null));
  assert.equal(pageOfReferer("https://mtgcompare.app/card/counterspell-mh2-267", "mtgcompare.app"), "card");
  assert.equal(pageOfReferer("https://mtgcompare.app/", "mtgcompare.app"), "home");
  assert.equal(pageOfReferer("https://other.example/card/x", "mtgcompare.app"), "home");
  assert.equal(pageOfReferer(null, "mtgcompare.app"), "home");
});

// ── the switches ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("CLICK_LOG=0 is off, CLICK_SAMPLE_RATE samples (clamped to 0..1), VIEW_FLUSH_MINUTES is shared with the view counter; bad values fall back to the defaults", () => {
  assert.deepEqual({ ...clickConfig({}) }, { ...CLICK_DEFAULTS }, "on, every click, every 30 minutes by default");
  assert.equal(clickConfig({ log: "0" }).sampleRate, 0);
  assert.equal(clickLogOn({ log: "0" }), false);
  assert.equal(clickLogOn({ log: "1" }), true);
  assert.equal(clickLogOn({ sampleRate: "0" }), false, "a rate of 0 is off too");
  assert.equal(clickConfig({ sampleRate: "0.25" }).sampleRate, 0.25);
  assert.equal(clickConfig({ sampleRate: "7" }).sampleRate, 1);
  assert.equal(clickConfig({ sampleRate: "-3" }).sampleRate, 0);
  assert.equal(clickConfig({ sampleRate: "lots" }).sampleRate, 1);
  assert.equal(clickConfig({ sampleRate: "" }).sampleRate, 1);
  assert.equal(clickConfig({ flushMinutes: "15" }).flushMinutes, 15);
  assert.equal(clickConfig({ flushMinutes: "0" }).flushMinutes, 30);
  assert.equal(clickConfig({ flushMinutes: "x" }).flushMinutes, 30);
  // the names are read where the environment table says: the route, never the library
  assert.doesNotMatch(read("src/lib/click-event.ts"), /\benv\.(CLICK_|VIEW_)/);
  assert.match(read("src/app/api/click/route.ts"), /process\.env\.CLICK_LOG[\s\S]*process\.env\.CLICK_SAMPLE_RATE[\s\S]*process\.env\.VIEW_FLUSH_MINUTES/);
});

test("crawlers, HTTP libraries and an empty user agent never count; a browser does", () => {
  const clock = { t: T0 + 10 * MIN }, b = batcherAt(clock), row = parseClickBody({ retailer: "tcgplayer", page: "card" }, "US")!;
  assert.equal(recordClick(b, row, "Googlebot/2.1 (+http://www.google.com/bot.html)", clock.t), false);
  assert.equal(recordClick(b, row, "python-requests/2.31", clock.t), false);
  assert.equal(recordClick(b, row, "", clock.t), false);
  assert.equal(recordClick(b, row, null, clock.t), false);
  assert.equal(b.size, 0);
  assert.equal(recordClick(b, row, CHROME, clock.t), true);
  assert.equal(b.size, 1);
  assert.equal(recordClick(batcherAt(clock, { ...CLICK_DEFAULTS, sampleRate: 0 }), row, CHROME, clock.t), false, "CLICK_LOG=0 records nothing");
});

// ── the batching: this is the answer to OP's reason for deleting the feature ──────────────────────────────────────────────────────────────────

test("two hundred clicks in a half hour write NOTHING; the first request in the next window writes ONE multi-row insert with every click, each at the time it happened", async () => {
  const clock = { t: T0 + 2 * MIN }, b = batcherAt(clock), db = fakeDb();
  for (let i = 0; i < 200; i++) {
    clock.t = T0 + 2 * MIN + i * 7_000;                                                   // 200 clicks across the next 23 minutes
    assert.equal(recordClick(b, parseClickBody({ retailer: i % 2 ? "tcgplayer" : "store:cardkingdom", page: "card", card: "counterspell-mh2-267" }, "US")!, CHROME, clock.t), true);
    assert.equal(await flushClicks(b, db, clock.t), 0, "mid-window: due() is false, no statement");
  }
  assert.equal(db.inserts.length, 0);
  clock.t = T0 + HALF + 5_000;                                                            // 12:30:05, inside the first minute of the next half hour
  const written = await flushClicks(b, db, clock.t);
  assert.equal(written, 200);
  assert.equal(db.inserts.length, 1, "ONE insert, not one per click");
  assert.equal(db.inserts[0]!.data.length, 200);
  assert.equal(db.inserts[0]!.data[0]!.createdAt.getTime(), T0 + 2 * MIN, "the row keeps the moment of the click, not the moment of the flush");
  assert.equal(db.inserts[0]!.data[199]!.createdAt.getTime(), T0 + 2 * MIN + 199 * 7_000);
  assert.ok(db.inserts[0]!.data.every((r) => r.userId === null), "anonymous");
  assert.equal(b.size, 0);
  assert.equal(await flushClicks(b, db, clock.t + 20_000), 0, "once per period: nothing pending, nothing written");
});

test("the window is the first minute of a wall-clock half hour: outside it nothing is written, however many clicks wait", async () => {
  const clock = { t: T0 + HALF + 90_000 }, b = batcherAt(clock, { ...CLICK_DEFAULTS }), db = fakeDb();
  // the batcher was built at 12:31:30 (period 12:30), so the next due time is 13:00
  recordClick(b, parseClickBody({ retailer: "tcgplayer", page: "home" }, "US")!, CHROME, clock.t);
  for (const t of [T0 + HALF + 120_000, T0 + 2 * HALF - 1_000]) { clock.t = t; assert.equal(await flushClicks(b, db, t), 0, new Date(t).toISOString()); }
  clock.t = T0 + 2 * HALF + 30_000;
  assert.equal(await flushClicks(b, db, clock.t), 1);
  assert.equal(db.inserts.length, 1);
});

test("a whole day of traffic wakes the database at most 48 times, with the card-view counter sharing the same window", async () => {
  const clock = { t: T0 }, clicks = batcherAt(clock), views = new ViewBatcher(() => clock.t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 1 }), db = fakeDb();
  let wakes = 0;
  const row = parseClickBody({ retailer: "tcgplayer", page: "card" }, "US")!;
  for (let t = T0; t < T0 + DAY; t += 20_000) {
    clock.t = t;
    recordClick(clicks, row, CHROME, t); views.record(1042, "view", false);
    let woke = false;
    if (clicks.due()) { await flushClicks(clicks, db, t); woke = true; }
    if (views.due()) { views.drain(); woke = true; }
    if (woke) wakes++;
  }
  assert.ok(wakes <= 48, `${wakes} wake-ups in a day`);
  assert.ok(wakes >= 47, "and it does flush every window");
  assert.ok(db.inserts.length <= 48);
});

test("a database that is down loses the buffered rows and never throws into a request; the sweep is attempted at most once per UTC day", async () => {
  resetClickBatcherForTests();
  const clock = { t: T0 + MIN }, b = batcherAt(clock), down = fakeDb({ fail: true });
  recordClick(b, parseClickBody({ retailer: "tcgplayer", page: "home" }, "US")!, CHROME, clock.t);
  clock.t = T0 + HALF + 1_000;
  assert.equal(await flushClicks(b, down, clock.t), 0, "createMany threw: zero written, no exception");
  assert.equal(b.size, 0, "the rows are gone (an analytics log accepts that)");

  const db = fakeDb(), later = Date.UTC(2026, 9, 9, 3, 0, 5);                             // a new UTC day, inside a window (03:00:05)
  const c = { t: later - 5 * MIN }, b2 = batcherAt(c);
  recordClick(b2, parseClickBody({ retailer: "ebay", page: "home" }, "AU")!, CHROME, c.t);
  c.t = later; assert.equal(await flushClicks(b2, db, later), 1);
  assert.equal(db.sweeps.length, 1, "the first flush of a day sweeps");
  assert.equal(db.sweeps[0]!.where.createdAt.lt.getTime(), later - CLICK_RETENTION_DAYS * DAY, "90 days");
  c.t = later + HALF; recordClick(b2, parseClickBody({ retailer: "ebay", page: "home" }, "AU")!, CHROME, c.t);
  assert.equal(await flushClicks(b2, db, c.t), 1);
  assert.equal(db.sweeps.length, 1, "the second flush of the same day does not");
  assert.equal(CLICK_RETENTION_DAYS, 90);
});

// ── the route ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function post(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request("https://mtgcompare.app/api/click", { method: "POST", body: raw ?? JSON.stringify(body), headers: { origin: "https://mtgcompare.app", host: "mtgcompare.app", "user-agent": CHROME, "content-type": "application/json", cookie: "country=AU", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers } });
}
async function withClock<T>(now: number, run: () => Promise<T>): Promise<T> {
  const real = Date.now; Date.now = () => now;                                              // mid-window: the route never reaches the real database
  resetClickBatcherForTests();
  try { return await run(); } finally { Date.now = real; resetClickBatcherForTests(); }
}

test("POST /api/click answers 204 with no body and buffers the row with the visitor's market; it writes nothing", async () => {
  await withClock(T0 + 10 * MIN, async () => {
    const res = await POST(post({ retailer: "store:cardkingdom", page: "card", card: "counterspell-mh2-267", entry: "search" }));
    assert.equal(res.status, 204); assert.equal(await res.text(), ""); assert.equal(res.headers.get("cache-control"), "no-store");
    const b = getClickBatcher(); assert.equal(b.size, 1);
    const [row] = b.drain();
    assert.deepEqual({ retailer: row!.retailer, page: row!.page, slug: row!.slug, country: row!.country, userId: row!.userId, entry: row!.entry }, { retailer: "store:cardkingdom", page: "card", slug: "counterspell-mh2-267", country: "AU", userId: null, entry: "search" });
  });
});

test("the route ignores, with the same empty 204, what is not a click of ours: other origins, no origin, crawlers, junk, oversized bodies, CLICK_LOG=0", async () => {
  await withClock(T0 + 10 * MIN, async () => {
    const cases: Request[] = [
      post({ retailer: "tcgplayer" }, { origin: "https://evil.example" }),
      post({ retailer: "tcgplayer" }, { origin: "", referer: "" }),
      post({ retailer: "tcgplayer" }, { "user-agent": "Googlebot/2.1" }),
      post({ retailer: "tcgplayer" }, { "user-agent": "" }),
      post(null, {}, "not json"),
      post(null, {}, "[]"),
      post({ retailer: "" }),
      post({ retailer: "tcgplayer", pad: "x".repeat(CLICK_BODY_MAX_BYTES) }),
    ];
    for (const c of cases) { const r = await POST(c); assert.equal(r.status, 204); assert.equal(await r.text(), ""); }
    assert.equal(getClickBatcher().size, 0, "none of them was recorded");
    const was = process.env.CLICK_LOG; process.env.CLICK_LOG = "0"; resetClickBatcherForTests();
    try { assert.equal((await POST(post({ retailer: "tcgplayer" }))).status, 204); assert.equal(getClickBatcher().size, 0, "CLICK_LOG=0 is off"); } finally { if (was === undefined) delete process.env.CLICK_LOG; else process.env.CLICK_LOG = was; }
  });
});

test("one address cannot fill the buffer: past the hourly limit the route still answers 204 and records nothing more", async () => {
  await withClock(T0 + 10 * MIN, async () => {
    const same = { "x-forwarded-for": "203.0.113.77", "x-real-ip": "203.0.113.77" };
    for (let i = 0; i < 125; i++) await POST(post({ retailer: "tcgplayer", page: "card" }, same));
    assert.ok(getClickBatcher().size <= 120, `${getClickBatcher().size} rows from one address`);
  });
});

// ── the sources ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("the route is dynamic, reads no session, imports no database client and the pages' side imports nothing server-side", () => {
  const route = codeOnly(read("src/app/api/click/route.ts"));
  assert.match(read("src/app/api/click/route.ts"), /export const dynamic = "force-dynamic";/);
  assert.doesNotMatch(route, /@\/lib\/db|prisma|getCurrentUser|@\/lib\/auth|cookies\(\)|SESSION_COOKIE|mc_session/, "a click is anonymous and the route is under src/app");
  assert.match(route, /flushClicks\(batcher\)/); assert.match(route, /sameOrigin\(/); assert.match(route, /rateLimit\(/);
  const beacon = read("src/components/OutboundBeacon.tsx"), beaconCode = codeOnly(beacon);
  assert.match(beacon, /^"use client";/);
  assert.doesNotMatch(beaconCode, /click-event|@\/lib\/db|prisma|view-beacon/, "the browser half imports nothing that reaches the database");
  assert.match(beaconCode, /a\[data-retailer\]/); assert.match(beaconCode, /navigator\.sendBeacon\?\.\("\/api\/click"/);
  assert.match(beaconCode, /location\.pathname\.startsWith\("\/admin"\)/, "/admin is never logged");
  assert.match(beaconCode, /addEventListener\("click", report, true\)/); assert.match(beaconCode, /addEventListener\("auxclick", report, true\)/);
  assert.match(beaconCode, /e\.type === "auxclick" && e\.button !== 1/, "a middle-click counts, other aux buttons do not");
  assert.doesNotMatch(beaconCode, /JSON\.stringify\(\{[^}]*(ip|userId|href|url|referrer)/i, "no IP, user id, URL or referrer is sent");
  // the batcher's shape is the frozen one of view-beacon.ts, and click-event.ts is the only writer of ClickEvent in src
  const writers = ["src/lib/click-event.ts"], all = fs.readdirSync(path.join(ROOT, "src"), { recursive: true }).map(String).filter((f) => /\.(ts|tsx)$/.test(f));
  const touching = all.filter((f) => /clickEvent\./.test(codeOnly(read(`src/${f}`)))).map((f) => `src/${f}`);
  for (const f of touching) assert.ok(writers.includes(f) || /^src\/lib\/admin-clicks?\.ts$|^src\/app\/admin\/clicks\//.test(f), `${f} touches ClickEvent and is neither the writer nor an admin reader`);
  assert.ok(touching.includes("src/lib/click-event.ts"));
});

test("the root layout mounts the listener once, GA's and Vercel's buy_click stay as they are, and OP's 'no outbound click' ruling is not what the repository enforces any more", () => {
  const layout = codeOnly(read("src/app/layout.tsx"));
  assert.equal(layout.match(/<OutboundBeacon \/>/g)?.length, 1);
  assert.doesNotMatch(layout, /@\/lib\/click-event/, "the layout imports the client half only");
  assert.match(read("src/components/GoogleAnalytics.tsx"), /gtag\('event','buy_click'/);
  assert.match(read("src/components/ConsentGatedAnalytics.tsx"), /track\("buy_click", props\)/);
  assert.ok(fs.existsSync(path.join(ROOT, "src/app/api/premium/click/route.ts")), "the plan-interest beacon is a separate thing and stays");
  assert.match(read("src/lib/data/plane/view-beacon.ts"), /`\/api\/click` \(WP15\)/, "the frozen batcher names this route");
});
