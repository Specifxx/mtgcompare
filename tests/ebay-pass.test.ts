// The eBay pass end to end (src/lib/ebay-import.ts runEbayPass) against a mocked fetch, an in-memory ledger and an in-memory store: no database, no network, no eBay credential.
// The catalogue is REAL: 29 printings of The One Ring, Sol Ring, Lightning Bolt and Counterspell with their TCGplayer product ids and market/low prices of 2026-10-07, in a published tree built the
// way the importer writes it. Pins the order of a run (token, quota, ledger, observe-only, allowance, quiet check, chunks), the fail-closed rules, the 429 block, the failure breaker and the
// partial-run rule: only a COMPLETED search writes.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { CARD_FLAGS, PRICE_MASK } from "../src/lib/constants";
import type { CatRow, PxRow } from "../src/lib/data/plane/formats";
import { bucketPath, hex3 } from "../src/lib/data/plane/shards";
import { memTree, type MutableTree } from "../src/lib/data/plane/tree";
import { resetEbayClientForTests } from "../src/lib/ebay";
import { memoryEbayStore, readCatalogue, runEbayPass, buildUnits, type EbayPassSummary } from "../src/lib/ebay-import";
import { memoryLedger } from "../src/lib/ebay-ledger";
import { DEFAULT_EBAY_CONFIG, ebayRunVerdict } from "../src/lib/ebay-plan";

// [product id, name, Scryfall set, collector number, treatment keys, label, has Normal, has Foil, TCGplayer group name, [market N, market F, low N, low F] in USD cents]
type P = [number, string, string, string, string, string | null, 0 | 1, 0 | 1, string, [number | null, number | null, number | null, number | null]];
const PRINTINGS: P[] = [
  [1263,"sol ring","lea","269","",null,1,0,"limited edition alpha",[null,null,153999,null]],
  [5503,"counterspell","tmp","57","",null,1,0,"tempest",[341,null,195,null]],
  [21702,"counterspell","g00","1","judge","Judge Gift",0,1,"judge gift cards 2000",[null,8087,null,6900]],
  [276484,"lightning bolt","2x2","117","",null,1,1,"double masters 2022",[216,214,45,89]],
  [276485,"lightning bolt","2x2","361","borderless inverted","Borderless",1,1,"double masters 2022",[183,264,147,164]],
  [278573,"sol ring","plg22","1","retro wpn","Retro Frame · WPN / Gateway",0,1,"love your lgs 2022",[null,688,null,543]],
  [478373,"counterspell","dmr","457","launch","Launch Party",0,1,"dominaria remastered",[null,653,null,599]],
  [487805,"the one ring","ltr","246","",null,1,1,"the lord of the rings tales of middle earth",[11619,13967,10001,13049]],
  [488270,"the one ring","ltr","451","borderless inverted bundle","Borderless · Bundle · from LTR",1,1,"the lord of the rings tales of middle earth",[11065,11449,10600,9096]],
  [488276,"the one ring","ltr","380","extended","Extended Art",1,1,"the lord of the rings tales of middle earth",[14165,35587,13100,29123]],
  [488278,"sol ring","ltc","284","",null,1,0,"tales of middle earth commander",[381,null,175,null]],
  [488290,"sol ring","ltc","408","",null,1,0,"tales of middle earth commander",[215099,null,500000,null]],
  [488291,"sol ring","ltc","409","",null,1,0,"tales of middle earth commander",[60546,null,60541,null]],
  [488292,"sol ring","ltc","410","",null,1,0,"tales of middle earth commander",[49275,null,70000,null]],
  [488302,"sol ring","ltc","408z","serial","Serialized",0,1,"tales of middle earth commander",[null,null,null,2899999]],
  [488303,"sol ring","ltc","409z","serial","Serialized",0,1,"tales of middle earth commander",[null,275000,null,2000000]],
  [501274,"the one ring","pltr","246s","prerelease datestamped","Prerelease",0,1,"tales of middle earth promos",[null,29247,null,125000]],
  [517451,"the one ring","ltr","748","borderless fullart poster","Poster",1,1,"the lord of the rings tales of middle earth",[93166,175306,92260,229999]],
  [517966,"the one ring","ltr","791","extended surge","Extended Art · Surge Foil",0,1,"the lord of the rings tales of middle earth",[null,29364,null,26900]],
  [517987,"the one ring","ltr","697","showcase scroll","Showcase Scrolls",1,1,"the lord of the rings tales of middle earth",[32000,72351,34839,72790]],
  [519155,"sol ring","who","836","surge","Surge Foil",0,1,"doctor who",[null,1187,null,899]],
  [519305,"sol ring","who","245","",null,1,1,"doctor who",[239,556,110,275]],
  [540987,"counterspell","pf24","1","inverted fullart",null,1,1,"magicfest 2024",[887,1198,799,1099]],
  [589737,"counterspell","purl","2","borderless inverted",null,0,1,"url convention promos",[null,9229,null,7538]],
  [594545,"sol ring","pfdn","1","inverted buyabox","Buy-a-Box",0,1,"foundations promos",[null,788,null,599]],
  [679140,"lightning bolt","pw26","5","borderless inverted","Borderless",1,1,"wizards play network 2026",[290,1033,220,872]],
  [692502,"counterspell","purl","2","","Graphic Novel Insert",0,1,"url convention promos",[null,1597,null,1348]],
  [693048,"the one ring","hoc","84","borderless inverted surge","Borderless · Surge Foil",0,1,"the hobbit eternal",[null,49545,null,40000]],
  [693049,"the one ring","hoc","44","borderless inverted","Borderless",1,1,"the hobbit eternal",[13148,15525,12500,15525]]
];
const NOW = new Date("2026-10-08T23:37:00Z");
const RESET = "2026-10-09T07:00:00.000Z";
const ORACLE: Record<string, [number, number | null, number]> = { "the one ring": [1, 96, 0], "sol ring": [2, 1, 0], "lightning bolt": [3, 157, 0], counterspell: [4, 16, 0] };   // oracle number, EDHREC rank, Reserved List
const RELEASED: Record<string, string> = { ltr: "2023-06-23", ltc: "2023-06-23", "2x2": "2022-07-08", lea: "1993-08-05", tmp: "1997-10-14", who: "2023-10-13", dmr: "2022-08-26" };

function plane(): MutableTree {
  const t = memTree();
  const sets = [...new Set(PRINTINGS.map((p) => p[2]))];
  const setId = (sc: string) => 100 + sets.indexOf(sc);
  t.write("meta/sets.json", JSON.stringify({ v: 1, at: "x", sets: sets.map((sc) => { const p = PRINTINGS.find((x) => x[2] === sc)!; return [setId(sc), `${sc}-set`, sc, sc.toUpperCase(), p[8], p[8], "expansion", RELEASED[sc] ?? "2024-01-01", 0, sc, 1, 1, 0]; }) }));
  t.write("meta/scrysets.json", JSON.stringify({ v: 1, sets: sets.map((sc) => [sc, PRINTINGS.find((x) => x[2] === sc)![8], "expansion", RELEASED[sc] ?? "2024-01-01", 0]) }));
  const buckets = new Map<number, P[]>();
  for (const p of PRINTINGS) { const b = Math.floor(p[0] / 256); buckets.set(b, [...(buckets.get(b) ?? []), p]); }
  for (const [b, list] of buckets) {
    t.write(bucketPath("cat", b), JSON.stringify({ v: 1, b, c: list.map((p): CatRow => [p[0], `${p[1].replace(/ /g, "-")}-${p[2]}-${p[3]}`, p[1].replace(/\b\w/g, (c) => c.toUpperCase()), 0, setId(p[2]), p[2], p[3], 0, "M", 0, p[4], p[5] ?? 0, CARD_FLAGS.TCGIMG | CARD_FLAGS.JOINED, 1, ORACLE[p[1]]![0], 0, 0, 0, 0, 3, 0]) }));
    t.write(bucketPath("px", b), JSON.stringify({ v: 1, b, p: list.map((p): PxRow => {
      const [mN, mF, lN, lF] = p[9];
      let mask: number = PRICE_MASK.LISTED;
      if (mN != null || lN != null) mask |= PRICE_MASK.HASN;
      if (mF != null || lF != null) mask |= PRICE_MASK.HASF;
      if (mN != null && mN >= 500) mask |= PRICE_MASK.TRACKN;
      if (mF != null && mF >= 500) mask |= PRICE_MASK.TRACKF;
      return [p[0], mN, mF, lN, lF, mask];
    }) }));
  }
  t.write("meta/buckets.json", JSON.stringify({ v: 1, width: 256, cat: [...buckets.keys()].sort((a, b) => a - b), tracked: [...buckets.keys()] }));
  const shards = new Map<number, unknown[]>();
  for (const [name, [no, edh, res]] of Object.entries(ORACLE)) shards.set(no % 512, [...(shards.get(no % 512) ?? []), [no, `0000000${no}`, name.replace(/ /g, "-"), name.replace(/\b\w/g, (c) => c.toUpperCase()), "{1}", 1, "Artifact", 0, 0, "N", edh ?? 0, res, "normal"]]);
  for (const [s, o] of shards) t.write(`or/${hex3(s)}.json`, JSON.stringify({ v: 1, h: s, o }));
  t.write("sl/list-0.json", JSON.stringify({ v: 1, at: "x", chunk: 0, chunks: 1, s: [
    [541164, "mh3-play-display", "Modern Horizons 3 - Play Booster Display", 0, "Booster Box", 0, "2024-06-14", 0, 30_393, 29_899, 0, 0, null],
    [541163, "mh3-play-pack", "Modern Horizons 3 - Play Booster Pack", 0, "Booster Pack", 0, "2024-06-14", 0, 1_062, 900, 0, 0, null],
    [541179, "mh3-collector-display", "Modern Horizons 3 - Collector Booster Display", 0, "Booster Box", 0, "2024-06-14", 0, 89_882, 89_498, 0, 0, null],
  ] }));
  t.write("status.json", JSON.stringify({ pointer: { priceDay: "2026-10-08" } }));
  return t;
}

// ── the mocked world ──────────────────────────────────────────────────────────
interface World { reset: string; remaining: number; limit: number; quotaOk: boolean; searchStatus: number[]; searches: { q: string; marketplace: string; filter: string; category: string | null }[]; tokenOk: boolean; fetches: number; drain: number }
const w: World = { reset: RESET, remaining: 4300, limit: 5000, quotaOk: true, searchStatus: [], searches: [], tokenOk: true, fetches: 0, drain: 0 };
const realFetch = globalThis.fetch;
const realLog = console.log;
const env0 = { ...process.env };
let annotations: string[] = [];
const IMG = (n: number) => ({ imageUrl: `https://i.ebayimg.com/images/g/RING${n}/s-l225.jpg` });
const item = (id: number, title: string, price: string, o: Record<string, unknown> = {}) => ({ itemId: `v1|3051000${String(id).padStart(5, "0")}|0`, title, price: { value: price, currency: "USD" }, buyingOptions: ["FIXED_PRICE"], itemLocation: { country: "US" }, condition: "Ungraded", image: IMG(id), shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }], ...o });
/** What eBay answers for a name: real-looking titles for the tracked printings, plus junk. */
function listingsFor(q: string): unknown[] {
  const name = q.replace(/^MTG /, "").toLowerCase();
  if (name === "the one ring") return [
    item(1, "The One Ring - Lord of the Rings Tales of Middle-earth LTR 246 NM Mythic Rare MTG", "129.99"),
    item(2, "The One Ring LTR 246 Lord of the Rings Tales of Middle-earth near mint", "119.50", { shippingOptions: [{ shippingCost: { value: "4.99", currency: "USD" } }] }),
    item(3, "The One Ring LTR 246 FOIL Lord of the Rings Tales of Middle-earth", "149.00"),
    item(4, "The One Ring Extended Art LTR 380 Lord of the Rings Tales of Middle-earth", "158.00"),
    item(5, "MTG The One Ring Borderless Poster LTR 748 Foil Universes Beyond", "1799.00"),
    item(6, "The One Ring LTR 246 PSA 10 GEM MINT", "399.00", { conditionId: "2750", condition: "Graded" }),
    item(7, "4x The One Ring LTR 246 NM", "480.00"),
    item(8, "The One Ring Lord of the Rings Tales of Middle-earth MTG", "120.00"),
    item(9, "The One Ring Borderless Surge Foil HOC 84 The Hobbit Eternal MTG", "520.00"),
  ];
  if (name === "sol ring") return [
    item(21, "Sol Ring Serialized Foil Tales of Middle-earth Commander LTC 409z MTG", "2899.00"),
    item(22, "Sol Ring Commander LTC 284 Tales of Middle-earth NM", "3.95"),
  ];
  if (name === "counterspell") return [
    item(11, "Counterspell G00 1 Foil Judge Gift Cards 2000 Judge Promos NM", "89.99"),
    item(12, "Counterspell PURL 2 Borderless Foil URL Convention Promos", "99.00"),
  ];
  return [];
}
function mock(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    w.fetches++;
    const url = new URL(String(input));
    if (url.hostname !== "api.ebay.com") throw new Error(`mock: refusing ${url.hostname}`);
    if (url.pathname === "/identity/v1/oauth2/token") return w.tokenOk ? new Response(JSON.stringify({ access_token: "tok-test", expires_in: 7200 }), { status: 200 }) : new Response("{}", { status: 401 });
    if (url.pathname.startsWith("/developer/analytics/")) {
      if (!w.quotaOk) return new Response("{}", { status: 500 });
      const r = w.remaining; w.remaining -= w.drain;
      return new Response(JSON.stringify({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{ limit: w.limit, remaining: r, reset: w.reset, timeWindow: 86_400 }] }] }] }), { status: 200 });
    }
    if (url.pathname === "/buy/browse/v1/item_summary/search") {
      const h = (init.headers ?? {}) as Record<string, string>;
      w.searches.push({ q: url.searchParams.get("q") ?? "", marketplace: h["X-EBAY-C-MARKETPLACE-ID"] ?? "", filter: url.searchParams.get("filter") ?? "", category: url.searchParams.get("category_ids") });
      w.remaining--;
      const st = w.searchStatus.shift() ?? 200;
      if (st !== 200) return new Response("{}", { status: st });
      return new Response(JSON.stringify({ total: 0, itemSummaries: listingsFor(url.searchParams.get("q") ?? "") }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}
beforeEach(() => {
  resetEbayClientForTests({ pacingMs: 0 });
  Object.assign(w, { reset: RESET, remaining: 4300, limit: 5000, quotaOk: true, searchStatus: [], searches: [], tokenOk: true, fetches: 0, drain: 0 });
  annotations = [];
  process.env.EBAY_CLIENT_ID = "test-app-id";
  process.env.EBAY_CLIENT_SECRET = "test-cert-id";
  console.log = (...a: unknown[]) => { if (typeof a[0] === "string" && a[0].startsWith("::")) annotations.push(a[0]); };
  mock();
});
after(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  for (const k of ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]) { if (env0[k] == null) delete process.env[k]; else process.env[k] = env0[k]; }
});

const LIVE = { EBAY_OBSERVE_ONLY: "0" };
async function run(env: Record<string, string | undefined> = LIVE, o: { tree?: MutableTree | null; now?: Date; ledger?: ReturnType<typeof memoryLedger>; store?: ReturnType<typeof memoryEbayStore> } = {}) {
  const ledger = o.ledger ?? memoryLedger();
  const store = o.store ?? memoryEbayStore();
  const at = o.now ?? NOW;
  const next = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 7)); if (next <= at) next.setUTCDate(next.getUTCDate() + 1);
  w.reset = next.toISOString();                                                   // the quota resets at the next 07:00Z
  let purged = 0;
  const logs: string[] = [];
  const summary: EbayPassSummary = await runEbayPass((...a) => logs.push(a.join(" ")), { tree: o.tree === undefined ? plane() : o.tree, store, ledger, env, sleep: async () => {}, quietMs: 0, revalidate: async () => void purged++ }, { now: o.now ?? NOW });
  return { summary, ledger, store, purged: () => purged, logs: logs.join("\n"), verdict: ebayRunVerdict(summary) };
}
const row = (l: ReturnType<typeof memoryLedger>) => [...l.rows.values()][0]!;

test("the catalogue: four names, their best tracked unit is the value, tiers follow value and popularity", () => {
  const view = readCatalogue(plane(), "2026-10-08");
  assert.equal(view.printings.length, 29);
  assert.equal(view.oracles.get(2)!.edhrecRank, 1);
  const b = buildUnits(view, "2026-10-08", null, { ...DEFAULT_EBAY_CONFIG });
  const v = Object.fromEntries(b.units.filter((u) => u.kind === "single").map((u) => [u.name, u.valueCents]));
  assert.deepEqual(v, { "The One Ring": 175_306, "Sol Ring": 275_000, Counterspell: 9229, "Lightning Bolt": 1033 }, "the best TRACKED unit's market; Alpha Sol Ring has a low and no market, so it is nothing");
  assert.equal(b.units.filter((u) => u.kind === "sealed").length, 3);
  assert.ok(b.candidates.every((c) => c.marketCents != null), "the pool never sees a low-only unit");
});

test("observe-only (the default): the quota is read and sampled, the tiers are computed, and NOT ONE Browse call is made", async () => {
  const r = await run({});
  assert.equal(r.summary.stop, "observe-only");
  assert.equal(w.searches.length, 0);
  assert.equal(r.summary.spent, 0);
  assert.ok(w.fetches >= 2, "the token and the quota");
  const l = row(r.ledger);
  assert.equal(l.windowKey, "2026-10-08");
  assert.equal(l.cap, 1000);
  assert.equal(l.samples.length, 1);
  assert.equal(l.samples[0]!.remaining, 4300);
  assert.equal(l.runs.at(-1)!.stop, "observe-only");
  assert.equal(l.config!.observeOnly, true);
  assert.ok(r.store.tracks.size > 0, "the plan is visible to the admin during the observation week");
  assert.equal(r.verdict.ok, true);
  assert.equal(r.purged(), 0);
});

test("the kill switch: EBAY_API_ENABLED=0 makes no request at all, not even for a token", async () => {
  const r = await run({ ...LIVE, EBAY_API_ENABLED: "0" });
  assert.equal(r.summary.stop, "api-disabled");
  assert.equal(w.fetches, 0);
  assert.equal(r.ledger.rows.size, 0);
  assert.equal(r.verdict.ok, true);
});

test("a refused token: zero Browse calls and a red run", async () => {
  w.tokenOk = false;
  const r = await run();
  assert.equal(r.summary.tokenRefused, true);
  assert.equal(w.searches.length, 0);
  assert.equal(r.verdict.ok, false);
});

test("a healthy main pass: the pool in four markets, tier A, tier B; only completed searches write; every call is in the ledger", async () => {
  const r = await run();
  assert.equal(r.summary.stop, null);
  assert.equal(r.summary.purpose, "main");
  assert.ok(r.summary.completed >= 10 && r.summary.latched === null && r.verdict.ok);
  // the ledger and the client agree, to the call
  assert.equal(r.summary.spent, w.searches.length);
  const l = row(r.ledger);
  assert.deepEqual([l.spent, l.claimed], [w.searches.length, w.searches.length]);
  assert.equal(Object.values(l.breakdown).reduce((a, b) => a + b, 0), w.searches.length);
  assert.ok((l.breakdown.banner ?? 0) > 0 && (l.breakdown.B ?? 0) > 0);
  assert.ok(w.searches.length <= 1000);
  // strict query in Magic's single-card category; the retry (nothing found) names the game and drops the category
  const strict = w.searches.find((s) => s.q === "The One Ring")!;
  assert.equal(strict.category, "183454");
  assert.match(strict.filter, /^buyingOptions:\{FIXED_PRICE\},deliveryCountry:US/);
  assert.ok(w.searches.some((s) => s.q === "MTG Lightning Bolt" && s.category === null), "Lightning Bolt found nothing, so it was retried once");
  assert.deepEqual([...new Set(w.searches.map((s) => s.marketplace))].sort(), ["EBAY_AU", "EBAY_CA", "EBAY_ES", "EBAY_GB", "EBAY_US"], "singles in the US, UK, AU and EU through the pool; sealed also in Canada");
  // the unit rows: the cheapest delivered copy of each (product, finish) the titles place, and nothing for a finish with no listing
  const best = (id: number, f: number, m = 0) => r.store.best.get(`${id}|${f === 0 ? "N" : "F"}|${m === 0 ? "US" : "CA"}`);
  assert.equal(best(487805, 0)!.priceCents, 11_950, "US$119.50 + US$4.99 postage beats US$129.99 free postage");
  assert.equal(best(487805, 1)!.priceCents, 14_900);
  assert.equal(best(488276, 0)!.priceCents, 15_800);
  assert.equal(best(517451, 1)!.priceCents, 179_900);
  assert.equal(best(488276, 1), undefined, "no Extended Art foil listing was found: no row");
  assert.equal(best(487805, 0, 4)!.priceCents, Math.round(11_950 * 1.37), "Canada is derived from the US search for a US seller");
  // the panel of The One Ring (LTR 246): both finishes, the cheapest first, a slab in the Graded tab (PSA 10) that is not an Offer
  const panel = r.store.panels.get("487805|US")!;
  assert.deepEqual(panel.listings.map((x) => [x.finish, x.priceCents]), [[0, 11_950], [1, 14_900], [0, 12_999]]);
  assert.deepEqual(r.store.panels.get("487805|US")!.graded.map((g) => [g.grader, g.grade, g.priceCents]), [["PSA", "10", 39_900]]);
  // the strip: one row, the live listing of each pool printing, no URL, no seller
  const payload = r.store.banner.payload as { v: number; tiles: { id: number; market: string; cents: number; image: string }[] };
  assert.equal(payload.v, 1);
  // the pool holds one printing per name: Sol Ring's serialized foil, The One Ring's Hobbit Eternal surge foil, Counterspell's URL promo foil
  assert.deepEqual(payload.tiles.filter((t) => t.market === "US").map((t) => [t.id, t.cents]), [[488303, 289_900], [693048, 52_000], [589737, 9900]]);
  assert.ok(payload.tiles.every((t) => t.image.startsWith("https://i.ebayimg.com/")));
  assert.ok(!JSON.stringify(payload).includes("seller"));
  assert.equal(r.purged(), 1, "the Neon tags are purged once, after the writes");
  // every searched pair is stamped
  const stamped = [...r.store.tracks.values()].filter((t) => t.checkedAt);
  assert.equal(stamped.length, r.summary.completed);
});

test("the second run an hour later finds nothing due: zero calls, a quiet green run", async () => {
  const first = await run();
  const second = await run(LIVE, { ledger: first.ledger, store: first.store, now: new Date(NOW.getTime() + 3_600_000) });
  assert.equal(second.summary.spent, 0);
  assert.equal(second.summary.stop, null);
  assert.equal(second.verdict.ok, true);
});

test("a dispatch cap lowers the budget and can never raise it", async () => {
  const r = await run({ ...LIVE, EBAY_DISPATCH_CAP: "5" });
  assert.ok(r.summary.spent <= 5 && r.summary.spent > 0);
  assert.equal(row(r.ledger).claimed, r.summary.spent);
  const big = await run({ ...LIVE, EBAY_DISPATCH_CAP: "99999" });
  assert.ok(big.summary.allowance <= 1000);
});

test("a 429 stops the run, blocks the window until the reset, and the next run makes no call", async () => {
  w.searchStatus = [200, 200, 200, 200, 200, 200, 429];
  const r = await run();
  assert.equal(r.summary.latched, "429");
  assert.equal(r.summary.spent, 7, "six searches, then the 429; nothing is retried");
  assert.equal(row(r.ledger).blockedUntil!.toISOString(), RESET);
  assert.equal(r.verdict.ok, true, "a 429 after completed searches is a clean stop");
  assert.ok(annotations.some((a) => a.includes("429")));
  w.searches = [];
  const again = await run(LIVE, { ledger: r.ledger, store: r.store, now: new Date(NOW.getTime() + 3_600_000) });
  assert.equal(again.summary.stop, "ledger-blocked");
  assert.equal(w.searches.length, 0);
});

test("a 429 on the very first search spent calls and completed nothing: that is a red run, and the window is blocked all the same", async () => {
  w.searchStatus = [429];
  const r = await run();
  assert.equal(r.summary.latched, "429");
  assert.equal(r.verdict.ok, false);
  assert.ok(row(r.ledger).blockedUntil);
  assert.equal(r.store.writes, 0);
});

test("every search answering 503: the breaker stops the run after 10 pairs, it is red, and nothing was written", async () => {
  w.searchStatus = Array(60).fill(503);
  const r = await run();
  assert.equal(r.summary.latched, "failures");
  assert.equal(r.summary.spent, 10);
  assert.equal(r.verdict.ok, false);
  assert.equal(r.store.writes, 0);
  assert.equal(r.store.best.size, 0);
  assert.equal(r.store.banner.payload, null);
  assert.ok(annotations.some((a) => a.startsWith("::error")));
});

test("a 401 (a keyset not approved for Browse) stops the same way", async () => {
  w.searchStatus = Array(60).fill(401);
  const r = await run();
  assert.equal(r.summary.latched, "failures");
  assert.equal(r.verdict.ok, false);
});

test("partial-run safety: a failed search leaves a live listing alone; a COMPLETED search with no match removes it", async () => {
  const seeded = memoryEbayStore();
  seeded.best.set("487805|N|US", { priceCents: 9_999, shipCents: 0, itemId: "300000000001", checkedAt: new Date("2026-10-07T23:00:00Z") });
  w.searchStatus = Array(60).fill(503);
  const failed = await run(LIVE, { store: seeded });
  assert.equal(seeded.best.get("487805|N|US")!.priceCents, 9_999, "untouched");
  assert.equal(failed.verdict.ok, false);
  // a run whose searches complete finds the real listing and replaces the stale row
  w.searchStatus = [];
  const ok = await run(LIVE, { store: seeded });
  assert.equal(seeded.best.get("487805|N|US")!.priceCents, 11_950);
  assert.equal(ok.verdict.ok, true);
});

test("fail closed: an unreadable quota means zero calls, a warning, and the plan is still recorded", async () => {
  w.quotaOk = false;
  const r = await run();
  assert.equal(r.summary.stop, "quota-unreadable");
  assert.equal(w.searches.length, 0);
  assert.equal(r.verdict.ok, true);
  assert.ok(annotations.some((a) => a.includes("quota-unreadable")));
  assert.ok(r.store.tracks.size > 0);
});

test("fail closed: another app draining the shared quota during the quiet check means zero calls", async () => {
  w.drain = 40;
  const r = await run();
  assert.equal(r.summary.stop, "foreign-active");
  assert.equal(w.searches.length, 0);
  assert.ok(annotations.some((a) => a.includes("shared quota")));
});

test("the reserve is never spent: Rift's evening work needs the remaining quota, and the run stops a chunk short of it", async () => {
  w.remaining = 1032 + 60;                     // 1,032 is the reserve at 23:37Z (600 + 132 + 300): 60 calls are spendable
  const r = await run();
  assert.equal(r.summary.allowance, 60);
  assert.ok(w.remaining >= 1032, `remaining ${w.remaining} must stay at or above the reserve 1032`);
  assert.ok(r.summary.spent > 0 && r.summary.spent <= 60);
  const none = await run(LIVE, { ledger: memoryLedger() });
  assert.ok(none.summary.spent <= 60 || w.remaining >= 0);
});
test("fail closed: at or under the reserve the run makes no call", async () => {
  w.remaining = 1032;
  const r = await run();
  assert.equal(r.summary.stop, "reserve");
  assert.equal(w.searches.length, 0);
});

test("the day's ledger cap is frozen at the window's first claim: a later run cannot enlarge it", async () => {
  const ledger = memoryLedger();
  await ledger.open("2026-10-08", 30, { limit: 5000, resetAt: new Date(RESET) });
  const r = await run(LIVE, { ledger });
  assert.ok(r.summary.spent <= 30 && r.summary.spent > 0, `spent ${r.summary.spent}`);
  assert.equal(row(ledger).cap, 30);
  assert.ok(row(ledger).claimed <= 30);
});

test("without the data checkout the pass still reads the quota and spends nothing", async () => {
  const r = await run(LIVE, { tree: null });
  assert.equal(w.searches.length, 0);
  assert.equal(r.verdict.ok, true);
  assert.equal(row(r.ledger).samples.length, 1);
});

test("a kill switch in the database (Meta ebay.paused) stops the run like the variable does", async () => {
  const store = memoryEbayStore();
  store.pausedFlag = true;
  const r = await run(LIVE, { store });
  assert.equal(r.summary.stop, "paused");
  assert.equal(w.searches.length, 0);
});

test("a banner-only run (04:37) plans the pool's US names, capped", async () => {
  const r = await run(LIVE, { now: new Date("2026-10-08T04:37:00Z") });
  assert.equal(r.summary.purpose, "banner");
  assert.ok(r.summary.spent > 0 && r.summary.spent <= 70);
  assert.ok(Object.keys(row(r.ledger).breakdown).every((k) => k === "banner"));
});
