// Store data health rules (lib/store-health.ts): one case per alert that fires
// and a near miss that doesn't, over synthetic appearances.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FAILING_STREAK,
  IMPLAUSIBLE_SHARE,
  LISTINGS_DROP_RATIO,
  MATCH_RATE_DROP_RATIO,
  MAX_APPEARANCES,
  MIN_PRODUCTS_FOR_RATE,
  MIN_TREND_APPEARANCES,
  STALE_ALERT_HOURS,
  STALE_HOURS,
  computeStoreHealth,
  groupAppearances,
  isMildAlert,
  median,
  storeAlerts,
  type OfferStat,
  type StoreAppearance,
} from "../src/lib/store-health";
import { offerStatsOf } from "../src/lib/admin-health";
import { STALE_HOURS as CONSTANT_STALE_HOURS } from "../src/lib/constants";
import { storeByKey, type StoreInfo } from "../src/lib/stores";
import type { StoreRunsFile } from "../src/lib/data/plane/formats";

const NOW = new Date("2026-10-03T12:00:00Z");
const H = 3600 * 1000;
let run = 100;
const app = (p: Partial<StoreAppearance> = {}): StoreAppearance => ({ runId: run--, at: new Date(NOW.getTime() - H), products: 100, cards: 80, sealed: 0, inStock: 60, failed: false, ...p });
const offers = (p: Partial<OfferStat> = {}): OfferStat => ({ listings: 80, inStock: 60, newest: new Date(NOW.getTime() - H), ...p });
const kinds = (h: StoreAppearance[], o = offers()) => storeAlerts(h, o, NOW).map((a) => a.kind);

test("thresholds are what the admin page and the import report promise", () => {
  assert.equal(STALE_ALERT_HOURS, 30);
  assert.equal(STALE_HOURS, 72);
  assert.equal(CONSTANT_STALE_HOURS, STALE_HOURS, "the one constant aggregate() and the offer reader use");
  assert.equal(FAILING_STREAK, 2);
  assert.equal(MIN_TREND_APPEARANCES, 3);
  assert.equal(LISTINGS_DROP_RATIO, 0.7);
  assert.equal(MATCH_RATE_DROP_RATIO, 0.6);
  assert.equal(MIN_PRODUCTS_FOR_RATE, 20);
  assert.equal(IMPLAUSIBLE_SHARE, 0.1);
  assert.equal(MAX_APPEARANCES, 14);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("a healthy store raises nothing", () => {
  assert.deepEqual(kinds([app(), app(), app()]), []);
});

test("no-listings: no Offer rows, unless the store was skipped", () => {
  assert.deepEqual(kinds([app()], offers({ listings: 0, inStock: 0, newest: null })), ["no-listings"]);
  assert.ok(!kinds([app({ skipped: "charges USD, market is AUD", products: 0, cards: 0 })], offers({ listings: 0, newest: null })).includes("no-listings"));
});

test("stale: newest listing older than 30 h", () => {
  assert.deepEqual(kinds([app()], offers({ newest: new Date(NOW.getTime() - 31 * H) })), ["stale"]);
  assert.deepEqual(kinds([app()], offers({ newest: new Date(NOW.getTime() - 29 * H) })), []);
});

test("failing: two failed reads in a row, not one", () => {
  assert.ok(kinds([app({ failed: true }), app({ failed: true }), app()]).includes("failing"));
  assert.ok(!kinds([app({ failed: true }), app(), app()]).includes("failing"));
  const text = storeAlerts([app({ failed: true }), app({ failed: true }), app({ failed: true }), app()], offers(), NOW).find((a) => a.kind === "failing")!.text;
  assert.match(text, /last 3 reads/);
});

test("listings-dropped: below 70% of the earlier median, with ≥ 3 appearances", () => {
  assert.ok(kinds([app({ cards: 50 }), app(), app()]).includes("listings-dropped"), "50 < 0.7 × 80");
  assert.ok(!kinds([app({ cards: 57 }), app(), app()]).includes("listings-dropped"), "57 ≥ 56: a near miss");
  assert.ok(!kinds([app({ cards: 10 }), app()]).includes("listings-dropped"), "fewer than 3 appearances: no trend alerts");
});

test("match-rate-drop: below 60% of the earlier median rate, only with ≥ 20 products", () => {
  // earlier rate 0.8; latest 40/100 = 0.4 < 0.48
  assert.ok(kinds([app({ cards: 40 }), app(), app()]).includes("match-rate-drop"));
  // 50/100 = 0.5 ≥ 0.48: near miss (listings-dropped may still fire)
  assert.ok(!kinds([app({ cards: 50 }), app(), app()]).includes("match-rate-drop"));
  // 19 products: ignored
  assert.ok(!kinds([app({ products: 19, cards: 2 }), app(), app()]).includes("match-rate-drop"));
  assert.ok(!kinds([app({ cards: 10 }), app()]).includes("match-rate-drop"), "fewer than 3 appearances");
});

test("implausible-prices: more than 10% of products refused", () => {
  assert.ok(kinds([app({ misses: { "implausible-price": 11 } })]).includes("implausible-prices"));
  assert.ok(!kinds([app({ misses: { "implausible-price": 10 } })]).includes("implausible-prices"));
});

test("empty-read: 0 products with no failure and no skip", () => {
  assert.ok(kinds([app({ products: 0, cards: 0 })]).includes("empty-read"));
  assert.ok(!kinds([app({ products: 0, cards: 0, failed: true })]).includes("empty-read"));
  assert.ok(!kinds([app({ products: 0, cards: 0, skipped: "x" })]).includes("empty-read"));
});

test("currency-skip: shows the skip reason", () => {
  const a = storeAlerts([app({ skipped: "charges USD, market is AUD", products: 0, cards: 0 })], offers(), NOW);
  assert.deepEqual(a.map((x) => x.kind), ["currency-skip"]);
  assert.match(a[0]!.text, /charges USD, market is AUD/);
});

const STORES: StoreInfo[] = [
  { id: 9001, key: "a", name: "A", base: "https://a.example", country: "US", collections: [], status: "unverified" },
  { id: 9002, key: "b", name: "B", base: "https://b.example", country: "AU", collections: [], status: "unverified" },
];

test("trends run over each store's own appearances; partial and catalogue-only runs add nothing", () => {
  // Run 3 read only store a (a partial run); run 2 was catalogue-only (no
  // stores key, so it has no rows at all); runs 1 and 0 read both.
  const rows = [
    { key: "a", ...app({ runId: 3, cards: 79 }) },
    { key: "a", ...app({ runId: 1 }) },
    { key: "b", ...app({ runId: 1 }) },
    { key: "a", ...app({ runId: 0 }) },
    { key: "b", ...app({ runId: 0 }) },
  ];
  const history = groupAppearances(rows);
  assert.deepEqual(history.get("b")!.map((x) => x.runId), [1, 0], "b's latest is its own last read, not run 3");
  const h = computeStoreHealth(STORES, history, new Map([["a", offers()], ["b", offers()]]), NOW);
  assert.deepEqual(h.find((x) => x.key === "b")!.alerts, [], "a store absent from the newest run gets no listings-dropped");
  assert.deepEqual(h.find((x) => x.key === "a")!.alerts, []);
});

test("a store missing from recent runs is unknown: no alert unless stale", () => {
  const h = computeStoreHealth(STORES, new Map(), new Map([["b", offers({ newest: new Date(NOW.getTime() - 40 * H) })]]), NOW);
  assert.deepEqual(h.find((x) => x.key === "a")!.alerts, []);
  assert.equal(h.find((x) => x.key === "a")!.latest, null);
  assert.deepEqual(h.find((x) => x.key === "b")!.alerts.map((x) => x.kind), ["stale"]);
});

test("appearances are capped per store", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ key: "a", ...app({ runId: 100 - i }) }));
  assert.equal(groupAppearances(rows).get("a")!.length, MAX_APPEARANCES);
});

test("the report step never fails a workflow: its own daily workflow runs it, and the script always exits 0 and opens with the line the workflow parses", () => {
  const wf = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/store-health.yml"), "utf8");
  assert.match(wf, /npx tsx scripts\/store-health\.ts/);
  assert.match(wf, /Store health: \[0-9\]\[0-9\]\* stores/, "the workflow reads the first line of the report");
  const script = fs.readFileSync(path.resolve(__dirname, "../scripts/store-health.ts"), "utf8");
  assert.match(script, /process\.exit\(0\)/);
  assert.match(script, /`Store health: \$\{stores\.length\} stores, \$\{alerting\.length\} alerting, \$\{total\} alerts\.`/);
});

test("non-Shopify stores: the platform is shown and a failed read says why", () => {
  const stores: StoreInfo[] = [{ id: 9003, key: "sp", name: "SP", base: "https://sp.example", country: "US", collections: [], platform: "shadowpos", status: "unverified" }, STORES[0]!];
  const history = new Map([["sp", [app({ failed: true, products: 0, cards: 0, note: "HTTP 503" })]]]);
  const h = computeStoreHealth(stores, history, new Map([["sp", offers()]]), NOW);
  assert.equal(h[0]!.platform, "shadowpos");
  assert.equal(h[1]!.platform, "shopify");
  assert.deepEqual(h[0]!.alerts.map((a) => a.kind), ["last-read-failed"]);
  assert.match(h[0]!.alerts[0]!.text, /HTTP 503/);
  assert.match(storeAlerts([app({ products: 0, cards: 0, note: "robots.txt disallows the search" })], offers(), NOW).find((a) => a.kind === "empty-read")!.text, /robots\.txt disallows the search/);
});

test("not-admitted: an unverified store that did not pass admission is mild, not broken (10.26)", () => {
  const a = storeAlerts([app({ skipped: "not admitted: 3 matched in-stock listings (needs 20)", cards: 0 })], offers({ listings: 0, inStock: 0, newest: null }), NOW);
  assert.deepEqual(a.map((x) => x.kind), ["not-admitted"]);
  assert.ok(isMildAlert("not-admitted") && isMildAlert("last-read-failed") && !isMildAlert("failing"));
});

test("offer stats come from ss/runs.json: rows held, rows in stock, the time of the pair's last completed read; an unknown store id is ignored", () => {
  const goodgames = storeByKey("goodgames")!, lotus = storeByKey("lotusgamesct")!;
  const runs: StoreRunsFile = {
    v: 1, at: "2026-10-08",
    r: [
      [goodgames.id, 1, "2026-10-08T02:10:00.000Z", 1, 4120, 3000, 2950, 50, 700],
      [lotus.id, 0, "2026-10-05T02:10:00.000Z", 0, 310, 0, 0, 0, 0],
      [31999, 0, "2026-10-08T02:10:00.000Z", 1, 5, 5, 5, 0, 1],
      [goodgames.id, 0, "2026-10-08T02:10:00.000Z", 1, 99, 99, 99, 0, 9],
    ],
  };
  const got = offerStatsOf(runs);
  assert.deepEqual([...got.keys()].sort(), ["goodgames", "lotusgamesct"]);
  assert.deepEqual(got.get("goodgames"), { listings: 4120, inStock: 3000, newest: new Date("2026-10-08T02:10:00.000Z") }, "a row for a market the store does not sell in is ignored");
  assert.equal(got.get("lotusgamesct")!.newest!.toISOString(), "2026-10-05T02:10:00.000Z", "a failed read keeps its old time, which is what raises stale");
  const h = computeStoreHealth([goodgames, lotus], new Map(), got, new Date("2026-10-08T12:00:00Z"));
  assert.deepEqual(h.find((x) => x.key === "lotusgamesct")!.alerts.map((a) => a.kind), ["stale"]);
  assert.deepEqual(offerStatsOf(null).size, 0);
});
