import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BREAKER_EMPTY,
  BREAKER_FAILURES,
  DEFAULT_DAILY_CAP,
  DEFAULT_RUN_CAP,
  DEFAULT_SWEEP_CALLS,
  MAX_DAILY_CAP,
  sweepCallsFromEnv,
  freshWindowMs,
  PROGRESS_EVERY,
  startReport,
  BUCKETS,
  buildPlan,
  CHASE_QUERIES,
  capsFromEnv,
  fixedFeeds,
  hotCoverage,
  hotItemKeys,
  itemKeys,
  itemQuery,
  MARKETPLACE_ORDER,
  perProductFeeds,
  purgeCutoff,
  retryAllowance,
  runCap,
  runImport,
  SEALED_QUERIES,
  selectFeedItems,
  setFeedSets,
  setQuery,
  SOLD_OUT_BOOST,
  TYPE_FEEDS,
  type ImportDeps,
} from "../src/lib/ebay-import";
import { ALWAYS_TYPES, GATED_MAX_USD, GATED_TYPES, ITEM_CORE_USD, ITEM_FLOOR_USD, referenceUsd, tierOf } from "../src/lib/ebay-eligibility";
import { budgetDay, DDL } from "../src/lib/ebay-store";
import { capacityReport, runReport } from "../src/lib/ebay-report";
import { hoursToMs, MARKET_WEIGHT, MARKETPLACE_OF_REGION } from "../src/lib/ebay-context";
import type { Region } from "../src/lib/regions";
import { PRODUCT_TYPES, fromRoughUsdCents, type TypeKey } from "../src/lib/sealed-title";
import { SETS } from "../src/lib/sets";
import { hotSweepQueries, SWEEP_PAGE, SWEEP_QUERIES } from "../src/lib/ebay-sweep";
import { HOT_SETS, PRIORITY_MARKETPLACES } from "../src/lib/popular";
import { fakeDb, harness, json, NOW, okToken, planRow, requestedReference, summary, withReference, type FakeDb, type Handler } from "./helpers/ebay-fakes";

const TODAY = "2026-10-07";
const usdCents = (usd: number, market: string) => Math.round(fromRoughUsdCents(usd * 100, market));

// ─── the budget day ─────────────────────────────────────────────────────────────

test("the budget day is the PACIFIC day, across daylight-saving changes", () => {
  assert.equal(budgetDay(Date.parse("2026-10-07T06:37:00Z")), "2026-10-06", "06:37 UTC is still the previous Pacific day: the daily cron is NOT here (it runs after the reset, 08:37 UTC)");
  assert.equal(budgetDay(Date.parse("2026-10-07T06:59:59Z")), "2026-10-06");
  assert.equal(budgetDay(Date.parse("2026-10-07T07:00:00Z")), "2026-10-07", "midnight Pacific in summer is 07:00 UTC");
  // fall back (2026-11-01, 09:00 UTC): midnight Pacific moves to 08:00 UTC
  assert.equal(budgetDay(Date.parse("2026-11-01T06:59:00Z")), "2026-10-31");
  assert.equal(budgetDay(Date.parse("2026-11-01T07:00:00Z")), "2026-11-01");
  assert.equal(budgetDay(Date.parse("2026-11-02T07:59:00Z")), "2026-11-01", "winter: still the 1st at 07:59 UTC");
  assert.equal(budgetDay(Date.parse("2026-11-02T08:00:00Z")), "2026-11-02");
  // spring forward (2026-03-08, 10:00 UTC)
  assert.equal(budgetDay(Date.parse("2026-03-08T07:59:00Z")), "2026-03-07");
  assert.equal(budgetDay(Date.parse("2026-03-08T08:00:00Z")), "2026-03-08");
  assert.equal(budgetDay(Date.parse("2026-03-09T06:59:00Z")), "2026-03-08");
  assert.equal(budgetDay(Date.parse("2026-03-09T07:00:00Z")), "2026-03-09");
  assert.match(budgetDay(NOW), /^\d{4}-\d{2}-\d{2}$/);
});

test("the DDL is what prisma db push makes (so a self-healed table is the table db push expects)", () => {
  const sql = DDL.join("\n");
  for (const col of ['"feed" TEXT NOT NULL', '"rank" INTEGER NOT NULL', '"itemId" TEXT NOT NULL', '"imageUrl" TEXT NOT NULL', '"priceValue" TEXT NOT NULL', '"shipValue" TEXT,', '"shipFree" BOOLEAN,', '"condition" TEXT,', '"fetchedAt" TIMESTAMP(3) NOT NULL', 'PRIMARY KEY ("feed","rank")', '"day" TEXT NOT NULL', '"total" INTEGER NOT NULL']) assert.ok(sql.includes(col), col);
  assert.ok(DDL.every((s) => /IF NOT EXISTS/.test(s)));
  assert.ok(/EbayListing_fetchedAt_idx/.test(sql));
});

// ─── eligibility ────────────────────────────────────────────────────────────────

test("eligibility thresholds: US$50 core for the gated types, US$25 floor for all, never packs", () => {
  assert.equal(ITEM_CORE_USD, 50);
  assert.equal(ITEM_FLOOR_USD, 25);
  for (const t of ALWAYS_TYPES) {
    assert.equal(tierOf(t, 24.99), "no", `${t} under the floor`);
    assert.equal(tierOf(t, 25), "core", t);
    assert.equal(tierOf(t, 400), "core", t);
  }
  for (const t of GATED_TYPES) {
    assert.equal(tierOf(t, 24.99), "no", t);
    assert.equal(tierOf(t, 25), "extension", t);
    assert.equal(tierOf(t, 49.99), "extension", t);
    assert.equal(tierOf(t, 50), "core", t);
  }
  const PACKS: TypeKey[] = ["play-booster", "collector-booster", "draft-booster", "set-booster", "jumpstart-booster"];
  for (const t of PACKS) for (const usd of [10, 25, 50, 500, 5000]) assert.equal(tierOf(t, usd), "no", t);
  assert.equal(tierOf("bundle", null), "no");
  // every type is in exactly one class
  const all = new Set(PRODUCT_TYPES.map((t) => t.key));
  for (const t of all) assert.ok([ALWAYS_TYPES.has(t), GATED_TYPES.has(t), PACKS.includes(t)].filter(Boolean).length === 1, t);
});

test("eligibility edges per currency: US$50 and US$25 in each market's money", () => {
  // thresholds (rough FX table: AU 1.5, NZ 1.65, US 1, UK 0.78, CA 1.37, EU 0.9, SG 1.3)
  const core: Record<string, number> = { AU: 75, NZ: 82.5, US: 50, UK: 39, CA: 68.5, EU: 45, SG: 65 };
  for (const [market, c] of Object.entries(core)) {
    const at = (value: number) => referenceUsd({ market, openCents: Math.round(value * 100), anyCents: null });
    assert.equal(tierOf("collection", at(c + 0.01)), "core", `${market} just over US$50`);
    assert.equal(tierOf("collection", at(c - 0.5)), "extension", `${market} just under US$50`);
    assert.equal(tierOf("collection", at(c / 2 + 0.01)), "extension", `${market} just over US$25`);
    assert.equal(tierOf("collection", at(c / 2 - 0.5)), "no", `${market} under US$25`);
  }
  // best-known = the cheapest OPEN price, else the cheapest listed one (a sold-out product), else unknown
  assert.equal(referenceUsd({ market: "US", openCents: 6000, anyCents: 5000 }), 60);
  assert.equal(referenceUsd({ market: "US", openCents: null, anyCents: 5000 }), 50);
  assert.equal(referenceUsd({ market: "US", openCents: null, anyCents: null }), null);
  assert.equal(referenceUsd({ market: "US", openCents: 0, anyCents: 0 }), null);
});

test("item keys: only regions with a ProductStat row, one key per (marketplace, product), highest reference price of the marketplace's regions", () => {
  const etb = (market: string, usd: number, o = {}) => planRow("bundle", market, usdCents(usd, market), { id: "etb1", name: "Aetherdrift Bundle", ...o });
  // AU and NZ share EBAY_AU: one key; SG and US share EBAY_US: one key; UK a second marketplace; EU none (no row)
  const keys = itemKeys([etb("AU", 60), etb("NZ", 70), etb("US", 55), etb("SG", 50), etb("UK", 60)]);
  assert.equal(keys.length, 3);
  assert.deepEqual(keys.map((k) => k.marketplace).sort(), ["EBAY_AU", "EBAY_GB", "EBAY_US"]);
  assert.equal(keys.find((k) => k.marketplace === "EBAY_AU")!.usd.toFixed(0), "70", "the higher of AU and NZ");
  assert.ok(!keys.some((k) => k.marketplace === "EBAY_DE" || k.marketplace === "EBAY_CA"), "no stat row there, no key");
  // an NZ-only product is an EBAY_AU key; an SG-only one an EBAY_US key
  assert.equal(itemKeys([etb("NZ", 60, { id: "n" })])[0].marketplace, "EBAY_AU");
  assert.equal(itemKeys([etb("SG", 60, { id: "s" })])[0].marketplace, "EBAY_US");
  // packs never; a price under the floor never; unknown price never
  assert.equal(itemKeys([planRow("play-booster", "US", 9999, { id: "bp" }), planRow("collector-booster", "US", 9999, { id: "sb" })]).length, 0);
  assert.equal(itemKeys([etb("US", 24, { id: "cheap" })]).length, 0);
  assert.equal(itemKeys([{ ...etb("US", 60, { id: "x" }), openCents: null, anyCents: null }]).length, 0);
});

test("ranking: core before extension; within a tier reference price x market weight, sold-out x1.5; stable", () => {
  const rows = [
    planRow("collection", "US", usdCents(60, "US"), { id: "c-us60", name: "Alpha Premium Collection" }),
    planRow("collection", "DE" === "DE" ? "EU" : "EU", usdCents(60, "EU"), { id: "c-eu60", name: "Alpha Premium Collection" }),
    planRow("collection", "US", usdCents(40, "US"), { id: "c-us40", name: "Beta Premium Collection" }), // extension
    planRow("commander-deck", "US", usdCents(55, "US"), { id: "t-us55-sold", name: "Gamma Commander Deck", soldOut: true }),
    planRow("commander-deck", "UK", usdCents(80, "UK"), { id: "t-uk80", name: "Delta Commander Deck" }),
    planRow("bundle", "CA", usdCents(100, "CA"), { id: "e-ca100", name: "Aetherdrift Bundle" }),
  ];
  const order = itemKeys(rows).map((k) => `${k.productId}@${k.marketplace}`);
  // values: t-us55-sold = 55x1x1.5 = 82.5, c-us60 = 60, t-uk80 = 80x0.7 = 56, c-eu60 = 60x0.7 = 42, e-ca100 = 100x0.25 = 25; then the extension c-us40
  assert.deepEqual(order, ["t-us55-sold@EBAY_US", "c-us60@EBAY_US", "t-uk80@EBAY_GB", "c-eu60@EBAY_DE", "e-ca100@EBAY_CA", "c-us40@EBAY_US"]);
  assert.equal(SOLD_OUT_BOOST, 1.5);
  // the owner's priority: the US above all, then the UK and the EU, then Australia/NZ and Canada
  assert.deepEqual(MARKET_WEIGHT, { EBAY_US: 1, EBAY_GB: 0.7, EBAY_DE: 0.7, EBAY_AU: 0.35, EBAY_CA: 0.25 });
  // stable: the same input in any order gives the same ranking
  assert.deepEqual(itemKeys([...rows].reverse()).map((k) => `${k.productId}@${k.marketplace}`), order);
  // equal values tie-break by product id
  const tie = itemKeys([planRow("bundle", "US", 6000, { id: "b", name: "Aetherdrift Bundle" }), planRow("bundle", "US", 6000, { id: "a", name: "Tarkir: Dragonstorm Bundle" })]);
  assert.deepEqual(tie.map((k) => k.productId), ["a", "b"]);
  assert.ok(itemKeys(rows).find((k) => k.productId === "t-us55-sold")!.soldOut);
});

// ─── the plan ───────────────────────────────────────────────────────────────────

test("fixed feeds: chase 5x8 + sealed 5x6 + types 5x8 + sets 5x30 = 40 + 30 + 40 + 150 calls, in priority order", () => {
  const feeds = fixedFeeds(TODAY);
  const calls = (b: string) => feeds.filter((f) => f.bucket === b).reduce((a, f) => a + f.searches.length, 0);
  assert.deepEqual([calls("chase"), calls("sealed"), calls("types"), calls("sets")], [40, 30, 40, 150]);
  assert.equal(CHASE_QUERIES.length, 8);
  assert.equal(SEALED_QUERIES.length, 6);
  assert.equal(TYPE_FEEDS.length, 8);
  const order = feeds.map((f) => f.bucket);
  assert.deepEqual([...new Set(order)], ["chase", "sealed", "types", "sets"]);
  assert.equal(order.lastIndexOf("chase") < order.indexOf("sealed"), true);
  // the owner's priority marketplaces first (US, UK, EU), then the rest by weight, so a cap hit drops EBAY_CA before EBAY_US
  assert.deepEqual(MARKETPLACE_ORDER, ["EBAY_US", "EBAY_GB", "EBAY_DE", "EBAY_AU", "EBAY_CA"]);
  assert.deepEqual(MARKETPLACE_ORDER.slice(0, PRIORITY_MARKETPLACES.length), [...PRIORITY_MARKETPLACES]);
  assert.deepEqual(feeds.filter((f) => f.bucket === "chase").map((f) => f.feed), MARKETPLACE_ORDER.map((m) => `${m}|chase`));
  for (const f of feeds) for (const s of f.searches) {
    assert.ok(s.q.length <= 100 && s.q.startsWith("MTG "), s.q);
    assert.ok(!/pokemon/i.test(s.q), s.q);
    assert.equal(s.marketplace, f.marketplace);
  }
  // the chase feed is high-end SEALED, never single cards: no query names a card, a rarity or a grade
  for (const q of CHASE_QUERIES) assert.ok(/collector booster|case|secret lair|commander deck set|set of 4/.test(q) && !/\b(?:psa|rare|card|single|foil\s+card)\b/i.test(q), q);
  assert.ok(feeds.filter((f) => f.bucket === "types").every((f) => f.searches.length === 1));
  // the high-value type feeds
  const slugs = new Set(feeds.filter((f) => f.bucket === "types").map((f) => f.feed.split("type:")[1]));
  assert.deepEqual([...slugs].sort(), ["bundles", "collector-booster-box-cases", "collector-booster-boxes", "commander-decks", "gift-bundles", "play-booster-box-cases", "play-booster-boxes", "secret-lair"]);
});

test("set feeds: the 30 most recently RELEASED sets, never a common-word set or an unreleased one; searched as '<set> sealed'", () => {
  const sets = setFeedSets(TODAY);
  assert.equal(sets.length, 30);
  assert.ok(sets.every((s) => s.releaseDate <= TODAY && !s.generic && !["fdn", "j25"].includes(s.code)));
  assert.ok(!sets.some((s) => s.code === "trk"), "Star Trek is not out yet");
  for (let i = 1; i < sets.length; i++) assert.ok(sets[i - 1].releaseDate >= sets[i].releaseDate, "newest first");
  assert.equal(sets[0].code, "fra");
  assert.equal(setFeedSets("2026-09-01")[0].code, "hob");
  assert.equal(setQuery(SETS.find((s) => s.code === "blb")!), "Bloomburrow sealed");
  assert.equal(setQuery(SETS.find((s) => s.code === "tdm")!), "Tarkir Dragonstorm sealed", "':' dropped");
  assert.equal(setQuery(SETS.find((s) => s.code === "tla")!), "Avatar The Last Airbender sealed");
  const f = fixedFeeds(TODAY).find((x) => x.bucket === "sets" && x.marketplace === "EBAY_US")!;
  assert.equal(f.searches[0].q, "MTG Reality Fracture sealed");
});

test("item queries: MTG + the cleaned product name (no 'sealed': eBay ANDs every keyword), at most 100 characters, store noise removed", () => {
  assert.equal(itemQuery("Aetherdrift Bundle"), "MTG Aetherdrift Bundle");
  assert.equal(itemQuery("Magic: The Gathering Aetherdrift Bundle"), "Magic: The Gathering Aetherdrift Bundle", "a name that says Magic is not prefixed again");
  assert.equal(itemQuery("Æther Revolt Booster Box"), "MTG Æther Revolt Booster Box");
  assert.equal(itemQuery("Bloomburrow Commander Deck - Animated Army [Limit 1 Per Customer] - Local Pickup Only"), "MTG Bloomburrow Commander Deck Animated Army");
  const long = itemQuery("Edge of Eternities Collector Booster Box " + "Extraordinarily Long Product Name ".repeat(6));
  assert.ok(long.length <= 100 && long.startsWith("MTG "));
  assert.ok(!long.endsWith(" "));
  for (const q of [itemQuery("Aetherdrift Bundle"), itemQuery("Bloomburrow Commander Deck - Animated Army"), long]) assert.ok(!/\bsealed\b/i.test(q), q);
});

const MANY = (n: number): ReturnType<typeof planRow>[] =>
  Array.from({ length: n }, (_, i) => planRow("collection", ["US", "AU", "UK", "CA", "EU"][i % 5], usdCents(50 + (i % 500), ["US", "AU", "UK", "CA", "EU"][i % 5]), { id: `c${String(i).padStart(4, "0")}`, name: `Test Commander Collection Number ${i}` }));

test("a placeholder ask (a sold-out prerelease pack at CA$9,999) is not an eligible key, so it cannot eat the day's calls", () => {
  const real = planRow("collection", "US", usdCents(80, "US"), { id: "real", name: "Real Premium Collection" });
  const fake = planRow("prerelease-pack", "CA", usdCents(7299, "CA"), { id: "fake", name: "Placeholder Prerelease Pack", soldOut: true });
  const edge = planRow("commander-deck", "US", usdCents(600, "US"), { id: "edge", name: "Edge Commander Deck" });
  const over = planRow("commander-deck", "US", usdCents(601, "US"), { id: "over", name: "Over Commander Deck" });
  assert.deepEqual(itemKeys([fake, real, edge, over]).map((k) => k.productId).sort(), ["edge", "real"]);
  assert.equal(GATED_MAX_USD, 600);
  assert.equal(tierOf("play-booster-box", 9000), "core", "a real vintage box can cost thousands");
});

test("buildPlan: spends the cap in priority order; a cap hit drops the LEAST valuable; calls never exceed the cap", () => {
  const rows = MANY(300);
  // The per-product priority on its own (sweepCalls 0: no sweep share); the sweep's place in the order is checked below.
  const full = buildPlan(rows, { cap: 2000, sweepCalls: 0, today: TODAY });
  assert.equal(full.sweepBudget, 0);
  assert.equal(full.calls, 260 + 300);
  assert.equal(full.byBucket.items.feeds, 300);
  assert.equal(full.items.core, 300);
  assert.equal(full.items.coreCovered, 300, "all fit");
  const items = full.feeds.filter((f) => f.bucket === "items");
  const values = items.map((f) => f.item!.value);
  for (let i = 1; i < values.length; i++) assert.ok(values[i - 1] >= values[i], "most valuable first");
  assert.equal(full.feeds.findIndex((f) => f.bucket === "items") > full.feeds.findLastIndex((f) => f.bucket === "sets"), true);
  const idx = (b: string) => BUCKETS.indexOf(b as never);
  for (const cap of [0, 1, 7, 8, 39, 40, 41, 70, 71, 100, 115, 259, 260, 261, 300, 560]) {
    const p = buildPlan(rows, { cap, sweepCalls: 0, today: TODAY });
    assert.ok(p.calls <= cap, `${cap}`);
    assert.equal(p.calls, p.feeds.reduce((a, f) => a + f.searches.length, 0));
    // strict priority: nothing of a lower bucket is planned while a higher bucket has an unplanned feed
    const planned = p.feeds.map((f) => idx(f.bucket));
    for (let i = 1; i < planned.length; i++) assert.ok(planned[i] >= planned[i - 1]);
  }
  assert.equal(buildPlan(rows, { cap: 0, today: TODAY }).feeds.length, 0);
  assert.equal(buildPlan(rows, { cap: 0, today: TODAY }).sweepBudget, 0);
  assert.equal(buildPlan(rows, { cap: 7, today: TODAY }).feeds.length, 0, "the first chase feed needs 8 calls");
  assert.equal(buildPlan(rows, { cap: 7, today: TODAY }).sweepBudget, 0, "nothing below a feed that did not fit, the sweep included");
  // 300 items but a cap of 300 + 260: exactly the 35 least valuable items miss out at cap 510
  const tight = buildPlan(rows, { cap: 260 + 250, sweepCalls: 0, today: TODAY });
  assert.equal(tight.byBucket.items.feeds, 250);
  assert.equal(tight.items.coreCovered, 250);
  const dropped = new Set(items.map((f) => f.feed));
  for (const f of tight.feeds.filter((x) => x.bucket === "items")) dropped.delete(f.feed);
  const minKept = Math.min(...tight.feeds.filter((x) => x.bucket === "items").map((x) => x.item!.value));
  for (const f of items) if (dropped.has(f.feed)) assert.ok(f.item!.value <= minKept);

  // The catalogue sweep's share comes after the sets and before the per-product (pre-plan) items: chase, sealed, types, sets, sweep, items.
  assert.deepEqual(BUCKETS, ["chase", "sealed", "types", "sets", "sweep", "items"]);
  assert.equal(DEFAULT_SWEEP_CALLS, 2100);
  const withSweep = buildPlan(rows, { cap: 260 + DEFAULT_SWEEP_CALLS + 300, today: TODAY }); // room for every fixed feed, the full share and all 300 items
  assert.equal(withSweep.sweepBudget, DEFAULT_SWEEP_CALLS);
  assert.equal(withSweep.calls, 260 + DEFAULT_SWEEP_CALLS + 300);
  assert.deepEqual(withSweep.byBucket.sweep, { feeds: 5, calls: DEFAULT_SWEEP_CALLS, wanted: 5, wantedCalls: DEFAULT_SWEEP_CALLS, fresh: 0 }, "the sweep's 'feeds' are its marketplaces");
  assert.equal(withSweep.byBucket.items.feeds, 300);
  const edge = 260 + DEFAULT_SWEEP_CALLS;
  for (const cap of [0, 7, 100, 259, 260, 261, 300, 1000, edge - 1, edge, edge + 1, 2100, 2360, 2500]) {
    const p = buildPlan(rows, { cap, today: TODAY });
    const fixedCalls = p.feeds.filter((f) => f.bucket !== "items").reduce((a, f) => a + f.searches.length, 0);
    const itemCalls = p.feeds.filter((f) => f.bucket === "items").reduce((a, f) => a + f.searches.length, 0);
    assert.ok(p.calls <= cap, `${cap}: ${p.calls}`);
    assert.equal(p.calls, fixedCalls + p.sweepBudget + itemCalls, `${cap}: the plan's calls are its feeds' searches plus the sweep's share`);
    // the sweep gets nothing while a fixed feed is unplanned; a per-product search nothing while the sweep is short of its share
    assert.equal(p.sweepBudget, cap >= 260 ? Math.min(DEFAULT_SWEEP_CALLS, cap - 260) : 0, `${cap}`);
    if (p.sweepBudget > 0) assert.equal(fixedCalls, 260, `${cap}`);
    if (itemCalls > 0) assert.equal(p.sweepBudget, DEFAULT_SWEEP_CALLS, `${cap}`);
    const planned = p.feeds.map((f) => idx(f.bucket));
    for (let i = 1; i < planned.length; i++) assert.ok(planned[i] >= planned[i - 1]);
  }
  // the items that do fit after the sweep are still the most valuable ones
  const after = buildPlan(rows, { cap: 260 + DEFAULT_SWEEP_CALLS + 100, today: TODAY });
  assert.equal(after.byBucket.items.feeds, 100);
  assert.deepEqual(after.feeds.filter((f) => f.bucket === "items").map((f) => f.feed), items.slice(0, 100).map((f) => f.feed));
  // EBAY_SWEEP_CALLS sets the share (buildPlan's sweepCalls)
  assert.equal(buildPlan(rows, { cap: 2500, sweepCalls: 100, today: TODAY }).sweepBudget, 100);
});

test("buildPlan: the extension (US$25-50) is bought only after EVERY core key, and never below US$25", () => {
  const core = MANY(20);
  const ext = Array.from({ length: 10 }, (_, i) => planRow("commander-deck", "US", usdCents(25 + i * 2, "US"), { id: `e${i}`, name: `Test Tin Extension ${i}` }));
  const below = [planRow("commander-deck", "US", usdCents(24, "US"), { id: "low", name: "Cheap Tin" })];
  const rows = [...ext, ...below, ...core];
  // the per-product pre-plan on its own (sweepCalls 0), as the run sizes it once the sweep has spent its share
  const p = buildPlan(rows, { cap: 260 + 20, sweepCalls: 0, today: TODAY });
  assert.equal(p.items.coreCovered, 20);
  assert.equal(p.items.extensionCovered, 0, "the budget ended exactly at the last core key");
  const p2 = buildPlan(rows, { cap: 260 + 25, sweepCalls: 0, today: TODAY });
  assert.equal(p2.items.extensionCovered, 5);
  const covered = p2.feeds.filter((f) => f.item?.tier === "extension").map((f) => f.item!.productId);
  assert.deepEqual(covered, ["e9", "e8", "e7", "e6", "e5"], "downward by price: the dearest of the extension first");
  const p3 = buildPlan(rows, { cap: 5000, sweepCalls: 0, today: TODAY });
  assert.equal(p3.items.extensionCovered, 10);
  assert.ok(!p3.feeds.some((f) => f.item?.productId === "low"), "never below US$25");
  assert.equal(p3.keys.length, 30);
  // the same order after the sweep's share
  const p4 = buildPlan(rows, { cap: 260 + DEFAULT_SWEEP_CALLS + 25, today: TODAY });
  assert.equal(p4.items.coreCovered, 20);
  assert.deepEqual(p4.feeds.filter((f) => f.item?.tier === "extension").map((f) => f.item!.productId), ["e9", "e8", "e7", "e6", "e5"]);
  assert.ok(!buildPlan(rows, { cap: 5000, today: TODAY }).feeds.some((f) => f.item?.productId === "low"), "never below US$25");
});

test("buildPlan: --only buckets, and the plan reports what it wanted vs got", () => {
  const rows = MANY(10);
  const p = buildPlan(rows, { cap: 2000, today: TODAY, only: ["items"] });
  assert.equal(p.feeds.length, 10);
  assert.equal(p.byBucket.chase.wanted, 0);
  assert.equal(p.sweepBudget, 0, "the sweep is a bucket like the others: --only items leaves it out");
  assert.equal(p.byBucket.sweep.wanted, 0);
  const q = buildPlan(rows, { cap: 2000, today: TODAY, only: ["chase", "sets"] });
  assert.deepEqual([...new Set(q.feeds.map((f) => f.bucket))], ["chase", "sets"]);
  assert.equal(q.sweepBudget, 0);
  const sw = buildPlan(rows, { cap: 2000, today: TODAY, only: ["sweep"] });
  const share = Math.min(DEFAULT_SWEEP_CALLS, 2000);
  assert.deepEqual([sw.feeds.length, sw.sweepBudget, sw.calls], [0, share, share], "--only sweep: the sweep alone, within the cap");
  // the per-product pre-plan against the cap (no sweep share): what it wanted vs what it got
  const r = buildPlan(MANY(3000), { cap: 2000, sweepCalls: 0, today: TODAY });
  assert.equal(r.calls, 2000);
  assert.ok(r.byBucket.items.wanted === 3000 && r.byBucket.items.feeds === 1740 && r.items.core === 3000 && r.items.coreCovered === 1740);
  const text = capacityReport(r).join("\n");
  assert.match(text, /NOT all core keys fit/);
  assert.match(capacityReport(buildPlan(rows, { cap: 2000, sweepCalls: 0, today: TODAY })).join("\n"), /ALL core keys fit/);
  // with the sweep's default share at the default caps: 260 fixed + 2,100 sweep + what is left for the pre-plan
  const d = buildPlan(MANY(3000), { cap: DEFAULT_RUN_CAP, today: TODAY });
  assert.equal(d.calls, DEFAULT_RUN_CAP);
  assert.equal(d.sweepBudget, DEFAULT_SWEEP_CALLS);
  assert.equal(d.byBucket.items.feeds, DEFAULT_RUN_CAP - 260 - DEFAULT_SWEEP_CALLS);
  assert.equal(d.byBucket.items.wanted, 3000);
  const dt = capacityReport(d).join("\n");
  assert.ok(dt.includes(`| sweep | 5 | 2,100 | 5 | 2,100 |`), dt);
  assert.match(dt, /NOT all core keys fit/);
});

// ─── hot sets and priority marketplaces (src/lib/popular.ts) ────────────────────

/** Hot-set products (Reality Fracture, The Hobbit, Avatar, Final Fantasy) in several markets, and some that are not hot. */
function hotRows() {
  return [
    planRow("play-booster", "US", 600, { name: "Reality Fracture Play Booster Pack", productId: "fra-pack" }),
    planRow("bundle", "US", 6000, { name: "Reality Fracture Bundle", productId: "fra-bun" }),
    planRow("commander-deck", "US", 3000, { name: "Reality Fracture Commander Deck - Shattered Time", productId: "fra-cmd" }),
    planRow("collector-booster-box", "US", 15000, { name: "Reality Fracture Collector Booster Box", productId: "fra-cbb" }),
    planRow("gift-bundle", "UK", usdCents(90, "UK"), { name: "Reality Fracture Gift Bundle", productId: "fra-gift" }),
    planRow("special-bundle", "EU", usdCents(30, "EU"), { name: "Reality Fracture Bundle - Ugin Edition", productId: "fra-sbun" }),
    planRow("scene-box", "AU", 2000, { name: "Reality Fracture Scene Box - Ugin", productId: "fra-scene" }), // an AU-only type still makes a query there
    planRow("bundle", "CA", usdCents(60, "CA"), { name: "Reality Fracture Bundle", productId: "fra-bun" }),
    planRow("bundle", "US", 5500, { name: "The Hobbit Bundle", productId: "hob-bun" }),
    planRow("play-booster-box", "US", 16000, { name: "The Hobbit Play Booster Box", productId: "hob-box" }),
    planRow("play-booster-box-case", "US", 90000, { name: "The Hobbit Play Booster Box Case", productId: "hob-case" }),
    planRow("bundle", "US", 5000, { name: "Avatar: The Last Airbender Bundle", productId: "tla-bun" }),
    planRow("gift-bundle", "US", 3000, { name: "Final Fantasy Gift Bundle", productId: "fin-gift" }),
    planRow("play-booster-box", "US", 16000, { name: "Star Trek Play Booster Box", productId: "trk-box" }), // hot, but not out on TODAY
    planRow("play-booster-box", "US", 16000, { name: "Aetherdrift Play Booster Box", productId: "dft-box" }), // not a hot set
    planRow("bundle", "US", 7000, { name: "Aetherdrift Bundle", productId: "dft-bun" }), // not a hot set
    planRow("play-booster-box", "UK", usdCents(150, "UK"), { name: "Aetherdrift Play Booster Box", productId: "ss-box" }), // not a hot set
  ];
}
const feedOf = (k: { marketplace: string; productId: string }) => `${k.marketplace}|item:${k.productId}`;

test("hot keys: the hot-set products of the US, UK and EU, ANY type and price (packs and cheap ones too), by hot rank, then marketplace, then value", () => {
  assert.equal(HOT_SETS[0], "trk", "Star Trek is the most wanted");
  assert.deepEqual([...PRIORITY_MARKETPLACES], ["EBAY_US", "EBAY_GB", "EBAY_DE"]);
  const rows = hotRows();
  assert.deepEqual(
    hotItemKeys(rows, TODAY).map((k) => `${k.productId}@${k.marketplace}`),
    [
      // Star Trek is not out on TODAY: Reality Fracture first, in the US dearest first, down to the US$6 pack; then the UK, then the EU
      "fra-cbb@EBAY_US", "fra-bun@EBAY_US", "fra-cmd@EBAY_US", "fra-pack@EBAY_US", "fra-gift@EBAY_GB", "fra-sbun@EBAY_DE",
      // then The Hobbit, Avatar and Final Fantasy, in HOT_SETS order
      "hob-case@EBAY_US", "hob-box@EBAY_US", "hob-bun@EBAY_US", "tla-bun@EBAY_US", "fin-gift@EBAY_US",
    ],
    "never a set that is not hot or not out, never Australia or Canada",
  );
  assert.ok(!itemKeys(rows).some((k) => k.productId === "fra-pack"), "the pack is not an eligible key, and is still searched first");
  assert.equal(hotItemKeys(rows, TODAY)[0].rank, 1);
  assert.equal(hotItemKeys(rows, "2026-11-20")[0].productId, "trk-box", "Star Trek first once it is out");
  // stable whatever the row order
  assert.deepEqual(hotItemKeys([...rows].reverse(), TODAY).map(feedOf), hotItemKeys(rows, TODAY).map(feedOf));
});

test("per-product searches: the hot products first, then every other eligible key by value; a hot product that is eligible keeps its tier", () => {
  const rows = hotRows();
  const feeds = perProductFeeds(rows, undefined, TODAY);
  const hot = hotItemKeys(rows, TODAY).map(feedOf);
  assert.deepEqual(feeds.slice(0, hot.length).map((f) => f.feed), hot);
  assert.ok(feeds.slice(0, hot.length).every((f) => f.hot));
  const rest = feeds.slice(hot.length);
  assert.ok(rest.every((f) => !f.hot && f.item), "then the eligible keys");
  assert.deepEqual(rest.map((f) => f.feed), itemKeys(rows).map(feedOf).filter((f) => !hot.includes(f)), "in itemKeys' order: core by value, then the extension");
  assert.deepEqual(rest.map((f) => f.feed), ["EBAY_US|item:dft-box", "EBAY_US|item:trk-box", "EBAY_GB|item:ss-box", "EBAY_US|item:dft-bun", "EBAY_CA|item:fra-bun"]);
  assert.equal(new Set(feeds.map((f) => f.feed)).size, feeds.length, "each (marketplace, product) once");
  assert.equal(feeds.find((f) => f.feed === "EBAY_US|item:fra-bun")!.item?.tier, "core", "still a covered core key");
  const pack = feeds.find((f) => f.feed === "EBAY_US|item:fra-pack")!;
  assert.equal(pack.item, undefined);
  // one search each, as for any product: "MTG <cleaned name>", the type's floor, the item normaliser
  assert.deepEqual(pack.searches.map((x) => [x.q, x.limit, x.minPrice, x.ref]), [["MTG Reality Fracture Play Booster Pack", 50, 3, "mtg-us-item"]]);
  assert.equal(pack.rule.kind, "item");
  // a hot set's products are searched by the keyword sellers use: "Hobbit" for The Hobbit, "Avatar" for Avatar: The Last Airbender
  assert.equal(feeds.find((f) => f.feed === "EBAY_US|item:hob-box")!.searches[0].q, "MTG Hobbit Play Booster Box");
  assert.equal(feeds.find((f) => f.feed === "EBAY_US|item:tla-bun")!.searches[0].q, "MTG Avatar Bundle");
  // the plan's pre-plan buys them in the same order, after the fixed feeds
  const plan = buildPlan(rows, { cap: 260 + 5, sweepCalls: 0, today: TODAY });
  assert.deepEqual(plan.feeds.filter((f) => f.bucket === "items").map((f) => f.feed), hot.slice(0, 5));
  assert.equal(plan.byBucket.items.wanted, feeds.length);
  assert.equal(plan.items.core + plan.items.extension, itemKeys(rows).length, "eligible keys are counted once, hot or not");
});

test("hot coverage: per hot set and priority marketplace, products with an item feed / products listed (counts only)", () => {
  const rows = hotRows();
  const has = new Set(["EBAY_US|item:fra-bun", "EBAY_US|item:fra-pack", "EBAY_GB|item:fra-gift", "EBAY_AU|item:fra-scene"]);
  const cov = hotCoverage(rows, (f) => has.has(f));
  assert.equal(cov.length, HOT_SETS.length * PRIORITY_MARKETPLACES.length);
  const at = (set: string, mp: string) => cov.find((c) => c.set === set && c.marketplace === mp)!;
  assert.deepEqual([at("fra", "EBAY_US").withFeed, at("fra", "EBAY_US").products], [2, 4]);
  assert.deepEqual([at("fra", "EBAY_GB").withFeed, at("fra", "EBAY_GB").products], [1, 1]);
  assert.deepEqual([at("fra", "EBAY_DE").withFeed, at("fra", "EBAY_DE").products], [0, 1]);
  assert.deepEqual([at("hob", "EBAY_US").withFeed, at("hob", "EBAY_US").products], [0, 3]);
  assert.equal(at("msh", "EBAY_US").products, 0);
  assert.ok(!cov.some((c) => (c.marketplace as string) === "EBAY_AU"), "the priority marketplaces only");
});

// ─── caps ───────────────────────────────────────────────────────────────────────

test("caps: daily 2500 (clamped 0..2500), run 2500, sweep 2100, and the run's allowance is what the database says is left", () => {
  assert.equal(MAX_DAILY_CAP, 2500);
  assert.deepEqual([DEFAULT_DAILY_CAP, DEFAULT_RUN_CAP, DEFAULT_SWEEP_CALLS], [2500, 2500, 2100]);
  assert.deepEqual(capsFromEnv({}), { daily: 2500, run: 2500 });
  assert.deepEqual(capsFromEnv({ EBAY_DAILY_CAP: "3000", EBAY_RUN_CAP: "9999" }), { daily: 2500, run: 2500 }, "never above the hard ceiling");
  assert.deepEqual(capsFromEnv({ EBAY_DAILY_CAP: "-5", EBAY_RUN_CAP: "x" }), { daily: 0, run: 2500 });
  assert.deepEqual(capsFromEnv({ EBAY_DAILY_CAP: " 1000 ", EBAY_RUN_CAP: "400" }), { daily: 1000, run: 400 });
  // the sweep's allowance (EBAY_SWEEP_CALLS): default 2100, clamped 0..2500; "0" turns the sweep off
  assert.equal(sweepCallsFromEnv({}), 2100);
  assert.equal(sweepCallsFromEnv({ EBAY_SWEEP_CALLS: "0" }), 0);
  assert.equal(sweepCallsFromEnv({ EBAY_SWEEP_CALLS: " 600 " }), 600);
  assert.equal(sweepCallsFromEnv({ EBAY_SWEEP_CALLS: "99999" }), 2500);
  assert.equal(sweepCallsFromEnv({ EBAY_SWEEP_CALLS: "-1" }), 0);
  assert.equal(sweepCallsFromEnv({ EBAY_SWEEP_CALLS: "lots" }), 2100);
  // the defaults: the whole run cap, bounded by what is left of the day
  assert.equal(runCap(capsFromEnv({}), 0), 2500);
  assert.equal(runCap(capsFromEnv({}), 640), 1860);
  assert.equal(runCap(capsFromEnv({}), 2500), 0);
  assert.equal(runCap(capsFromEnv({}), 9999), 0);
  // a run cap below the daily cap (the compliant mode's EBAY_RUN_CAP)
  assert.equal(runCap({ daily: 2400, run: 2000 }, 0), 2000);
  assert.equal(runCap({ daily: 2400, run: 2000 }, 1000), 1400);
  assert.equal(runCap({ daily: 2400, run: 2000 }, 2400), 0);
  assert.equal(runCap({ daily: 2400, run: 2000 }, 2999), 0);
  assert.equal(runCap({ daily: 2400, run: 2000 }, 0, 300), 300);
  assert.equal(runCap({ daily: 2400, run: 2000 }, 0, 5000), 2000);
  assert.equal(retryAllowance(2000), 105);
  assert.equal(retryAllowance(2500), 130);
  assert.equal(hoursToMs(30), purgeCutoff(NOW, {}).getTime() === NOW - hoursToMs(30) ? hoursToMs(30) : -1, "purge: 26 h bound + 4 h");
  assert.equal(purgeCutoff(NOW, { EBAY_LISTING_MAX_AGE_HOURS: "5.5" }).getTime(), NOW - hoursToMs(9.5));
});

// ─── the run ────────────────────────────────────────────────────────────────────

/**
 * A search handler: high-end sealed (collector boxes) for the chase queries, a set's Commander deck set for a set query, nothing a
 * product matches for a sweep query, and the product's own title for any other (sealed, type and item) query; counts searches.
 */
function ebay(over: { onSearch?: (n: number, url: string) => Response | undefined } = {}): { handler: Handler; n: () => number } {
  let n = 0;
  const chase = new Set(CHASE_QUERIES.map((q) => `MTG ${q}`));
  const sweep = new Set(SWEEP_QUERIES.map((x) => `MTG ${x.q}`));
  const handler: Handler = (url, init) => {
    if (url.includes("/oauth2/token")) return okToken();
    n++;
    const forced = over.onSearch?.(n, url);
    if (forced) return forced;
    const q = new URL(url).searchParams.get("q") ?? "";
    const mp = ((init?.headers ?? {}) as Record<string, string>)["X-EBAY-C-MARKETPLACE-ID"] ?? "EBAY_US";
    const subject = q.replace(/^MTG /, "").replace(/ sealed$/, "");
    const items = chase.has(q)
      ? Array.from({ length: 4 }, (_, i) => summary(`${n}${i}`, `MTG Final Fantasy Collector Booster Box Sealed NEW ${i}`, 300 + i * 10, mp))
      : sweep.has(q)
        ? Array.from({ length: 4 }, (_, i) => summary(`${n}${i}`, `MTG Mystery Lot of cards ${i}`, 60 + i, mp))
        : /^(?:.+) sealed$/.test(q) && !TYPE_FEEDS.some((t) => q === `MTG ${t.query}`) && !SEALED_QUERIES.some((x) => q === `MTG ${x}`)
          ? Array.from({ length: 3 }, (_, i) => summary(`${n}${i}`, `MTG ${subject} Commander Deck Set of 4 Sealed NEW ${i}`, 200 + i * 10, mp))
          : Array.from({ length: 3 }, (_, i) => summary(`${n}${i}`, `MTG ${subject} Sealed NEW ${i}`, 70 + i * 10, mp));
    return json({ itemSummaries: withReference(items, requestedReference(init)) });
  };
  return { handler, n: () => n };
}

function deps(db: FakeDb, h: ReturnType<typeof harness>, env: ImportDeps["env"] = {}): ImportDeps {
  return { db, api: h.deps, env, log: () => {} };
}

test("run: every search is reserved BEFORE it is made; the database counter equals the searches made", async () => {
  const e = ebay();
  const h = harness(e.handler);
  const db = fakeDb(MANY(40));
  const order: string[] = [];
  const reserve = db.reserve.bind(db);
  db.reserve = async (...a) => (order.push("reserve"), reserve(...a));
  const fetch0 = h.deps.fetch;
  h.deps.fetch = async (u, i) => (u.includes("/item_summary/search") && order.push("search"), fetch0(u, i));
  const s = await runImport(deps(db, h), { concurrency: 1 });
  // the fixed feeds (260), the sweep (every query's first page in each of the 5 marketplaces: the mock's pages are short, so each
  // query ends after one), then one search per eligible key the sweep did not cover (the mock's cards match no product: all 40)
  const sweepCalls = SWEEP_QUERIES.length * MARKETPLACE_ORDER.length;
  const total = 260 + sweepCalls + 40;
  assert.equal(s.buckets.sweep.calls, sweepCalls);
  assert.equal(s.sweep.length, 5);
  assert.equal(h.searches().length, total);
  assert.equal(s.searches, total);
  assert.equal(db.days.get(s.day), total, "the counter equals the calls made");
  assert.equal(s.usedAfter, total);
  assert.equal(BUCKETS.reduce((a, b) => a + s.buckets[b].calls, 0), total, "every search is counted against its bucket");
  // never a search without its reservation first
  let reserved = 0;
  let searched = 0;
  for (const o of order) {
    if (o === "reserve") reserved++;
    else {
      searched++;
      assert.ok(searched <= reserved, "a search happened before its reservation");
    }
  }
  assert.equal(h.tokens().length, 1);
  assert.equal(db.ensured, 1, "the tables are created if missing");
  assert.ok(s.buckets.chase.refreshed === 5 && s.buckets.sets.refreshed === 150);
  assert.ok(s.buckets.items.refreshed === 40, JSON.stringify(s.buckets.items));
  assert.equal(s.buckets.items.covered, 0);
  assert.ok(db.purges.length >= 2, "purged at the start and at the end");
  // phase order: every fixed feed's search, then the sweep's pages, then the per-product searches
  const kinds = h.searches().map((c) => requestedReference(c.init)!.split("-")[2]);
  const qs = h.searches().map((c) => new URL(c.url).searchParams.get("q") ?? "");
  const sweepQs = new Set(SWEEP_QUERIES.map((x) => `MTG ${x.q}`));
  const firstSweep = qs.findIndex((q) => sweepQs.has(q));
  assert.equal(firstSweep, 260);
  assert.ok(kinds.slice(0, 260).every((k) => k !== "item"), "fixed feeds first");
  assert.ok(qs.slice(260, 260 + sweepCalls).every((q) => sweepQs.has(q)), "then the sweep");
  assert.ok(qs.slice(260 + sweepCalls).every((q) => !sweepQs.has(q)) && kinds.slice(260).every((k) => k === "item"), "then the per-product searches");
});

test("run: three overlapping runs and a manual dispatch can never pass the daily cap", async () => {
  const e = ebay();
  const db = fakeDb(MANY(200));
  const env = { EBAY_DAILY_CAP: "500", EBAY_RUN_CAP: "400" };
  const runs = await Promise.all([0, 1, 2, 3].map(() => {
    const h = harness(e.handler);
    return runImport(deps(db, h, env), { concurrency: 3 }).then((s) => ({ s, h }));
  }));
  const day = runs[0].s.day;
  const made = runs.reduce((a, r) => a + r.h.searches().length, 0);
  assert.equal(made, e.n());
  assert.ok(made <= 500, `${made} searches against a 500 cap`);
  assert.equal(db.days.get(day), made, "reservations == calls");
  assert.ok(made >= 450, "the cap is used, not left idle");
  for (const r of runs) assert.ok(r.s.searches <= 400);
  // a later run the same day sees what is left
  const later = harness(e.handler);
  const s = await runImport(deps(db, later, env));
  assert.equal(later.searches().length, 500 - made);
  assert.equal(s.plan.cap, 500 - made);
  // and once it is spent, nothing is called at all
  const none = harness(e.handler);
  await runImport(deps(db, none, env));
  assert.equal(none.searches().length, 0);
  assert.equal(none.tokens().length, 0, "no token is fetched for a run with nothing to do");
});

test("run: the day rolls over in Pacific time, with a fresh counter", async () => {
  const e = ebay();
  const db = fakeDb(MANY(5));
  const h = harness(e.handler);
  const env = { EBAY_DAILY_CAP: "60", EBAY_RUN_CAP: "60" };
  const a = await runImport(deps(db, h, env), { concurrency: 1 });
  assert.equal(a.day, "2026-10-06");
  assert.equal(a.plan.calls, 58, "a feed that does not fit is not bought");
  assert.equal(a.usedAfter, 58);
  h.clock.t = Date.parse("2026-10-07T07:00:01Z"); // midnight Pacific has passed
  const b = await runImport(deps(db, h, env), { concurrency: 1, force: true }); // force: the feeds the first run stored are only minutes old
  assert.equal(b.day, "2026-10-07");
  assert.equal(b.usedBefore, 0);
  assert.equal(b.searches, 58);
  assert.equal(db.days.get("2026-10-06"), 58);
  assert.equal(db.days.get("2026-10-07"), 58);
});

test("run: a 429 stops the whole run, keeps the previous rows, and says so", async () => {
  const e = ebay({ onSearch: (n) => (n >= 30 ? json({ errors: [{ message: "too many" }] }, 429, { "retry-after": "60" }) : undefined) });
  const h = harness(e.handler);
  const db = fakeDb(MANY(40));
  db.feeds.set("EBAY_US|set:reality-fracture", { items: [{ id: "old", title: "old", imageUrl: "https://i.ebayimg.com/x", price: { value: "1.00", currency: "USD" }, url: "https://www.ebay.com/itm/1" }], fetchedAt: new Date(NOW - 3600_000) });
  const s = await runImport(deps(db, h), { concurrency: 3 });
  assert.equal(s.stopped, "rate-limited");
  assert.ok(h.searches().length <= 30 + 3, `${h.searches().length} searches after a 429`);
  assert.equal(db.days.get(s.day), h.searches().length);
  assert.equal(db.feeds.get("EBAY_US|set:reality-fracture")!.items[0].id, "old", "a feed the run never refreshed keeps its rows");
  assert.ok(s.feedsRefreshed < s.feedsPlanned);
  assert.ok(runReport(s).join("\n").includes("rate-limited"));
});

test("run: a token failure stops before any search and reports only eBay's OAuth category", async () => {
  const h = harness((url) => (url.includes("/oauth2/token") ? new Response(JSON.stringify({ error: "invalid_client", error_description: "secret-ish client authentication failed" }), { status: 401 }) : json({})));
  const db = fakeDb(MANY(10));
  const s = await runImport(deps(db, h), {});
  assert.equal(s.stopped, "token");
  assert.equal(s.tokenError, "token-http-401:invalid_client");
  assert.equal(h.searches().length, 0);
  assert.equal(db.days.size, 0, "no budget spent");
  const text = JSON.stringify(s.tokenError) + runReport(s).join("\n");
  assert.ok(!/secret-ish|SECRET|MtgComp-/.test(text));
});

test("run: retries once on a 5xx or a timeout, and once without the price filter on a 400; each retry is reserved", async () => {
  const seen: string[] = [];
  const e = ebay({
    onSearch: (n, url) => {
      seen.push(`${n}:${new URL(url).searchParams.get("filter")?.includes("price:[") ? "price" : "noprice"}`);
      if (n === 1) return json({}, 503);
      if (n === 3) return json({}, 400);
      return undefined;
    },
  });
  const h = harness(e.handler);
  const db = fakeDb(MANY(0));
  const s = await runImport(deps(db, h), { only: ["chase"], concurrency: 1 });
  assert.equal(s.retries, 2);
  assert.equal(h.searches().length, 40 + 2);
  assert.equal(db.days.get(s.day), 42);
  assert.ok(seen[2].endsWith("price") && seen[3].endsWith("noprice"), seen.slice(0, 5).join(" "));
  assert.equal(s.buckets.chase.refreshed, 5);
  // a second 5xx for the same search is a failure of that search only
  const e2 = ebay({ onSearch: (n) => (n <= 2 ? json({}, 500) : undefined) });
  const h2 = harness(e2.handler);
  const s2 = await runImport(deps(fakeDb([]), h2), { only: ["chase"], concurrency: 1 });
  assert.equal(s2.buckets.chase.refreshed, 5, "the feed is still built from its other searches");
  // a network failure also retries once
  let k = 0;
  const h3 = harness((url) => (url.includes("/oauth2/token") ? okToken() : (++k === 1 ? (() => { throw new Error("socket"); })() : ebay().handler(url, undefined, 0))));
  const s3 = await runImport(deps(fakeDb([]), h3), { only: ["chase"], concurrency: 1 });
  assert.equal(s3.retries, 1);
});

// ─── circuit breaker, fresh feeds, stop inside a feed (review F1, F8, SEC-11) ────

test("breaker: a 403 on a search (no Buy API access) stops the run at once and reports only the code", async () => {
  const h = harness((url) => (url.includes("/oauth2/token") ? okToken() : json({ errors: [{ message: "Insufficient permissions to fulfill the request. secret-ish" }] }, 403)));
  const db = fakeDb(MANY(200));
  const s = await runImport(deps(db, h), { concurrency: 3 });
  assert.equal(s.stopped, "forbidden");
  assert.equal(s.tokenError, "search-http-403");
  assert.ok(h.searches().length <= 3, `${h.searches().length} searches after the first refusal (3 workers in flight)`);
  assert.equal(db.days.get(s.day), h.searches().length);
  assert.equal(s.feedsRefreshed, 0);
  assert.ok(!runReport(s).join("\n").includes("secret-ish"));
});

test("breaker: a 401 that survives the token refresh is also 'forbidden'", async () => {
  const h = harness((url) => (url.includes("/oauth2/token") ? okToken() : json({}, 401)));
  const s = await runImport(deps(fakeDb(MANY(50)), h), { concurrency: 1 });
  assert.equal(s.stopped, "forbidden");
  assert.ok(h.searches().length <= 3);
});

test("breaker: 6 searches in a row that fail (400/5xx/malformed/warned-empty) stop the run, with the error category only; a success in between resets the count", async () => {
  assert.equal(BREAKER_FAILURES, 6);
  for (const mode of ["500", "400", "malformed", "warning"] as const) {
    const h = harness((url) => {
      if (url.includes("/oauth2/token")) return okToken();
      if (mode === "malformed") return new Response("<html>not json secret-ish</html>", { status: 200 });
      if (mode === "warning") return json({ total: 0, warnings: [{ errorId: 12006, message: "secret-ish" }] });
      return json({ errors: [{ message: "secret-ish" }] }, Number(mode));
    });
    const db = fakeDb(MANY(300));
    const s = await runImport(deps(db, h), { concurrency: 1 });
    assert.equal(s.stopped, "failing", mode);
    assert.ok(h.searches().length <= BREAKER_FAILURES * 2 + 2, `${mode}: ${h.searches().length} searches`); // each failure may have one retry; far from the run cap
    assert.equal(db.days.get(s.day), h.searches().length, "the counter equals the calls made");
    assert.match(s.tokenError ?? "", /^search-(http-\d+|malformed|warning)$/, "only the error category");
    assert.ok(!runReport(s).join("\n").includes("secret-ish"));
  }
  // alternating failure and success never reaches 6 in a row
  const e = ebay({ onSearch: (n) => (n % 6 !== 0 ? json({ errors: [] }, 404) : undefined) }); // 5 failures, then a success, again and again
  const h2 = harness(e.handler);
  const s2 = await runImport(deps(fakeDb(MANY(0)), h2), { only: ["chase", "sealed", "types"], concurrency: 1 });
  assert.notEqual(s2.stopped, "failing");
  assert.ok(h2.searches().length >= 30, "ran past several cycles of 5 failures");
});

test(`breaker: ${BREAKER_EMPTY} searches in a row with no listings at all stop the run (HTTP 200, nothing in itemSummaries, no warning)`, async () => {
  assert.equal(BREAKER_EMPTY, 30);
  const h = harness((url) => (url.includes("/oauth2/token") ? okToken() : json({ total: 0 })));
  const db = fakeDb(MANY(300));
  const s = await runImport(deps(db, h), { concurrency: 1 });
  assert.equal(s.stopped, "empty");
  assert.equal(h.searches().length, BREAKER_EMPTY);
  assert.equal(db.days.get(s.day), BREAKER_EMPTY);
  // some empties between good answers do not trip it
  const e = ebay({ onSearch: (n) => (n % 3 === 0 ? json({ total: 0 }) : undefined) });
  const s2 = await runImport(deps(fakeDb(MANY(0)), harness(e.handler)), { only: ["chase", "sealed"], concurrency: 1 });
  assert.equal(s2.stopped, null);
});

test("the retry allowance running out is reported as 'retries', not 'cap'", async () => {
  // every 2nd search fails once and succeeds on the retry: retries are 1 per 2 calls, far above the 5% allowance
  let n = 0;
  const e = ebay({ onSearch: () => (++n % 2 === 1 ? json({}, 503) : undefined) });
  const s = await runImport(deps(fakeDb(MANY(0)), harness(e.handler)), { only: ["chase", "sealed", "types"], concurrency: 1 });
  assert.equal(s.stopped, "retries");
});

test("after a 429 no worker starts another search for the feed it is in (chase feeds hold 8 searches)", async () => {
  const e = ebay({ onSearch: (n) => (n === 1 ? json({}, 429, { "retry-after": "60" }) : undefined) });
  const h = harness(e.handler);
  const s = await runImport(deps(fakeDb(MANY(0)), h), { only: ["chase"], concurrency: 3 });
  assert.equal(s.stopped, "rate-limited");
  assert.ok(h.searches().length <= 3 + 2, `${h.searches().length} searches after a 429 on the first`);
});

test("after a 429 in the catalogue sweep no worker starts another search (three in flight at most), even if eBay would answer again", async () => {
  // full pages that keep paging; ONE 429 (the third call), then eBay answers normally again
  let n = 0;
  const h = harness((url, init) => {
    if (url.includes("/oauth2/token")) return okToken();
    n++;
    if (n === 3) return json({ errors: [{ message: "too many" }] }, 429, { "retry-after": "60" });
    const items = Array.from({ length: SWEEP_PAGE }, (_, i) => summary(`p${n}-${i}`, `MTG Test Commander Collection Number ${i} Pulled From Collector Booster Box`, 70));
    return json({ total: 100_000, itemSummaries: withReference(items, requestedReference(init)) });
  });
  const db = fakeDb(MANY(40));
  const s = await runImport(deps(db, h), { only: ["sweep", "items"], concurrency: 3 });
  assert.equal(s.stopped, "rate-limited");
  assert.ok(h.searches().length <= 3 + 2, `${h.searches().length} searches after a 429 on the third`);
  assert.equal(db.days.get(s.day), h.searches().length);
  assert.equal(s.buckets.items.calls, 0, "no per-product search after a 429");
});

test("fresh feeds are not bought again (a re-run, an overlapping run, a retry after a crash) unless forced; stale ones are", async () => {
  // Feed by feed: the fixed feeds and the per-product item feeds (EBAY_SWEEP_CALLS=0). The sweep's own freshness is checked below.
  const NOSWEEP = { EBAY_SWEEP_CALLS: "0" };
  const db = fakeDb(MANY(30));
  const e = ebay();
  const first = await runImport(deps(db, harness(e.handler), NOSWEEP), { concurrency: 3 });
  assert.equal(first.searches, 260 + 30);
  assert.equal(first.buckets.sweep.calls, 0);
  // the same instant again: every feed that has rows is fresh and is not bought again (only feeds that came back empty are tried again)
  const h2 = harness(e.handler);
  const again = await runImport(deps(db, h2, NOSWEEP), { concurrency: 3 });
  const stored = first.buckets.chase.refreshed + first.buckets.sealed.refreshed + first.buckets.types.refreshed + first.buckets.sets.refreshed + first.buckets.items.refreshed;
  assert.equal(again.buckets.chase.fresh, 5);
  assert.equal(again.buckets.items.fresh, 30);
  assert.equal(again.buckets.items.refreshed, 0);
  assert.equal(again.buckets.chase.refreshed, 0);
  assert.ok(h2.searches().length < 290 && stored >= 185, `${h2.searches().length} searches the second time, ${stored} feeds stored the first`);
  assert.equal(again.plan.items.coreCovered, again.plan.items.core, "fresh item feeds still count as covered");
  assert.ok(runReport(again).join("\n").includes("Fresh (not bought)"));
  assert.ok(h2.searches().every((c) => requestedReference(c.init) !== "mtg-us-item"), "no item feed bought again");
  // forced: everything again
  const h3 = harness(e.handler);
  await runImport(deps(db, h3, NOSWEEP), { concurrency: 3, force: true });
  assert.equal(h3.searches().length, 290);
  // the window is 2 hours (a quarter of the bound at most): 1.9 h on a feed is still fresh, 2.1 h on it is bought again
  assert.equal(freshWindowMs({}), hoursToMs(2));
  assert.equal(freshWindowMs({ EBAY_LISTING_MAX_AGE_HOURS: "5.5" }), hoursToMs(1.375), "compliant mode: a quarter of 5.5 h");
  assert.equal(freshWindowMs({ EBAY_LISTING_MAX_AGE_HOURS: "72" }), hoursToMs(2), "never more than 2 h");
  const h3b = harness(e.handler);
  h3b.clock.t = NOW + 1.9 * 3600_000;
  const soon = await runImport(deps(db, h3b, NOSWEEP), { concurrency: 3 });
  assert.equal(soon.buckets.chase.fresh, 5);
  assert.equal(soon.buckets.items.fresh, 30);
  assert.ok(h3b.searches().length < 290, "an accidental re-dispatch within 2 h re-buys nothing that has rows");
  const h4 = harness(e.handler);
  h4.clock.t = NOW + 3 * 3600_000 + 1;
  db.feeds.forEach((v) => (v.fetchedAt = new Date(NOW))); // as the forced run left them
  const later = await runImport(deps(db, h4, NOSWEEP), { concurrency: 3 });
  assert.equal(h4.searches().length, 290);
  assert.equal(later.buckets.chase.fresh, 0);
  // a feed fresher than the share is skipped and the budget goes further down the plan instead
  const hourOld = () => ({ items: [{ id: "o", title: "o", imageUrl: "https://i.ebayimg.com/x", price: { value: "1.00", currency: "USD" }, url: "https://www.ebay.com/itm/1" }], fetchedAt: new Date(NOW - 3600_000) });
  const db2 = fakeDb(MANY(30));
  for (const f of fixedFeeds(TODAY)) db2.feeds.set(f.feed, hourOld());
  const h5 = harness(e.handler);
  const s5 = await runImport(deps(db2, h5, { EBAY_RUN_CAP: "20", ...NOSWEEP }), { concurrency: 1 });
  // the per-product phase holds back its own retry allowance from what is left of the run cap
  assert.equal(s5.buckets.items.refreshed, 20 - retryAllowance(20), "the cap is spent on item feeds, not on feeds that are an hour old");
  assert.equal(s5.buckets.chase.refreshed, 0);
  assert.ok(h5.searches().length <= 20 && h5.searches().every((c) => requestedReference(c.init)!.endsWith("-item")), "every search an item search");
  // with the sweep (the default), the same cap goes to the sweep first, never to the hour-old fixed feeds
  const db2b = fakeDb(MANY(30));
  for (const f of fixedFeeds(TODAY)) db2b.feeds.set(f.feed, hourOld());
  const h5b = harness(e.handler);
  const s5b = await runImport(deps(db2b, h5b, { EBAY_RUN_CAP: "20" }), { concurrency: 1 });
  assert.equal(s5b.plan.sweepBudget, 20);
  assert.ok(s5b.buckets.sweep.calls > 0 && h5b.searches().length <= 20, `${h5b.searches().length}`);
  assert.equal(s5b.buckets.chase.calls + s5b.buckets.sealed.calls + s5b.buckets.types.calls + s5b.buckets.sets.calls, 0);
  assert.equal(s5b.buckets.chase.fresh, 5);

  // The sweep: a marketplace whose item feeds are fresh (a re-dispatch after a run that swept it) is not swept again unless forced;
  // and the per-product searches skip those fresh feeds too. 60 US products, every one with an hour-old item feed.
  const usRows = Array.from({ length: 60 }, (_, i) => planRow("collection", "US", usdCents(60 + i, "US"), { id: `u${String(i).padStart(2, "0")}`, name: `Fresh Test Collection ${i}` }));
  const db4 = fakeDb(usRows);
  for (const r of usRows) db4.feeds.set(`EBAY_US|item:${r.productId}`, hourOld());
  const h7 = harness(e.handler);
  const s7 = await runImport(deps(db4, h7), { concurrency: 3 });
  assert.equal(s7.buckets.sweep.fresh, 1);
  assert.equal(s7.buckets.sweep.planned, 0);
  assert.equal(s7.buckets.sweep.calls, 0, "the marketplace is not swept again");
  assert.equal(s7.buckets.items.fresh, 60);
  assert.equal(s7.buckets.items.calls, 0, "nor its fresh item feeds searched one by one");
  assert.equal(h7.searches().length, 260, "only the fixed feeds, which had no rows");
  // forced: swept again (one page per query: the mock's pages are short), and every item feed bought again
  const h8 = harness(e.handler);
  const s8 = await runImport(deps(db4, h8), { concurrency: 3, force: true });
  assert.equal(s8.buckets.sweep.fresh, 0);
  assert.equal(s8.buckets.sweep.calls, SWEEP_QUERIES.length);
  assert.equal(h8.searches().length, 260 + SWEEP_QUERIES.length + 60);
  // stale (older than the window): swept again without forcing
  const h9 = harness(e.handler);
  h9.clock.t = NOW + 3 * 3600_000;
  const s9 = await runImport(deps(db4, h9), { concurrency: 3 });
  assert.equal(s9.buckets.sweep.fresh, 0);
  assert.equal(s9.buckets.sweep.calls, SWEEP_QUERIES.length);
  // compliant mode (bound 5.5 h): the window is 1.4 h, so a 4-hourly run always buys again
  const db3 = fakeDb(MANY(0));
  await runImport(deps(db3, harness(e.handler)), { only: ["chase"], concurrency: 3 });
  const h6 = harness(e.handler);
  h6.clock.t = NOW + 4 * 3600_000;
  const s6 = await runImport(deps(db3, h6, { EBAY_LISTING_MAX_AGE_HOURS: "5.5" }), { only: ["chase"], concurrency: 3 });
  assert.equal(s6.buckets.chase.fresh, 0);
  assert.equal(s6.buckets.chase.refreshed, 5);
});

test("strict caps: EBAY_RUN_CAP and --max-calls bound the searches of a run INCLUDING retries; three workers never overshoot", async () => {
  // --max-calls 10 against a mock that fails every search once: retries come out of the 10, not on top of it
  const flaky = () => {
    let n = 0;
    return ebay({ onSearch: () => (++n % 2 === 1 ? json({}, 503) : undefined) });
  };
  for (const concurrency of [1, 3]) {
    const h = harness(flaky().handler);
    const db = fakeDb(MANY(0));
    const s = await runImport(deps(db, h), { only: ["chase"], maxCalls: 10, concurrency });
    assert.ok(h.searches().length <= 10, `concurrency ${concurrency}: ${h.searches().length} searches under --max-calls 10`);
    assert.equal(s.searches, h.searches().length);
    assert.equal(db.days.get(s.day), h.searches().length, "the counter equals the calls made");
  }
  // EBAY_RUN_CAP=50 with every 5th search failing once: exactly 50 searches, retries included
  let k = 0;
  const e = ebay({ onSearch: () => (++k % 5 === 0 ? json({}, 500) : undefined) });
  for (const concurrency of [1, 3]) {
    k = 0;
    const h = harness(e.handler);
    const s = await runImport(deps(fakeDb(MANY(100)), h, { EBAY_RUN_CAP: "50" }), { concurrency });
    assert.ok(h.searches().length <= 50, `concurrency ${concurrency}: ${h.searches().length} searches under EBAY_RUN_CAP=50`);
    assert.equal(s.plan.cap, 50);
    assert.ok(s.stopped === "cap" || s.stopped === "retries", String(s.stopped)); // whichever bound is reached first
    assert.equal(s.searches, h.searches().length);
  }
  // the repeat after a 401 is inside the cap too
  const h401 = harness((url, init) => {
    if (url.includes("/oauth2/token")) return okToken();
    return json({}, 401);
  });
  const s401 = await runImport(deps(fakeDb(MANY(0)), h401), { only: ["chase"], maxCalls: 4, concurrency: 1 });
  assert.ok(h401.searches().length <= 4);
  void s401;
});

test("the importer says what it will do with today's budget BEFORE the first search, and logs its running total against the caps", async () => {
  const lines: string[] = [];
  const e = ebay();
  const db = fakeDb(MANY(40));
  const day = budgetDay(NOW);
  db.days.set(day, 640); // a manual run earlier in the Pacific day
  const h = harness(e.handler);
  const first = { searched: false };
  const fetch0 = h.deps.fetch;
  h.deps.fetch = async (u, i) => {
    if (u.includes("/item_summary/search") && !first.searched) {
      first.searched = true;
      assert.ok(lines.some((l) => /Budget day 2026-10-0\d/.test(l)), "the budget was printed before the first search");
    }
    return fetch0(u, i);
  };
  const s = await runImport({ db, api: h.deps, env: {}, log: (l) => lines.push(l) }, { concurrency: 3, maxCalls: 300 });
  const text = lines.join("\n");
  assert.match(text, /Budget day \d{4}-\d{2}-\d{2} \(the Pacific day/);
  assert.match(text, /reserved so far today: 640 of the 2,500 daily cap \(1,860 left\)/);
  assert.match(text, /at most 300 searches, retries included \(the smallest of: run cap 2,500, 1,860 left of today's 2,500, --max-calls 300\)/);
  assert.match(text, /Plan: \d+ feeds in 300 searches \(chase 5 feeds\/40 calls/);
  // 300 - 260 fixed = 40 for the sweep; nothing left for per-product searches
  assert.match(text, /sweep up to 40 calls over 5 marketplaces, items: whatever the sweep leaves/);
  assert.match(text, /stops early on a 429, a 401\/403 on a search, 6 failed searches in a row, or 30 with no listings in a row/);
  assert.match(text, /another application on the same eBay keyset is invisible/);
  assert.ok(!/SECRET|MtgComp-|Bearer/.test(text));
  assert.equal(s.searches, 300);
  assert.equal(db.days.get(day), 640 + 300);
  // the running total against the caps, every PROGRESS_EVERY searches
  assert.equal(PROGRESS_EVERY, 250);
  const progress = lines.filter((l) => l.startsWith("progress:"));
  assert.equal(progress.length, 1);
  assert.match(progress[0], /^progress: 250 searches this run \(\d+ retries, run cap 300\); 890 of the 2,500 daily cap used today; \d+ feeds refreshed\.$/);
  // the sweep logs counts per marketplace, nothing else
  const sweepLines = lines.filter((l) => l.startsWith("sweep "));
  assert.equal(sweepLines.length, 5);
  for (const l of sweepLines) assert.match(l, /^sweep EBAY_[A-Z]{2}: \d+ pages \(\d+ on the hot sets\), \d+ listings matched to \d+ of \d+ products; \d+ item feeds written\.$/);
  assert.deepEqual(sweepLines.map((l) => l.split(":")[0].slice(6)), [...MARKETPLACE_ORDER], "swept in the priority order: US, UK, EU, then AU and CA");
  assert.ok(lines.some((l) => l.startsWith("Priorities (src/lib/popular.ts): marketplaces in the order EBAY_US, EBAY_GB, EBAY_DE, EBAY_AU, EBAY_CA; hot sets trk, fra,")));
  // nothing left today: it says so
  const spent = fakeDb(MANY(10));
  spent.days.set(day, 2500);
  const lines2: string[] = [];
  const s2 = await runImport({ db: spent, api: harness(e.handler).deps, env: {}, log: (l) => lines2.push(l) }, {});
  assert.equal(s2.searches, 0);
  assert.match(lines2.join("\n"), /at most 0 searches.*Nothing to do: the budget for today is spent/);
  // a dry run prints the same, and is marked
  const lines3: string[] = [];
  await runImport({ db: fakeDb(MANY(10)), api: harness(e.handler).deps, env: {}, log: (l) => lines3.push(l) }, { dryRun: true });
  assert.match(lines3[0], /^DRY RUN \(no eBay call, no database write\)\. Budget day/);
  assert.equal(startReport(s2, { force: true, freshMs: hoursToMs(2) }).join("\n").includes("--force"), true);
});

test("each feed asks eBay for its own affiliateReferenceId (mtg-<market>-<kind>) and the stored links keep eBay's URL as returned", async () => {
  const refs = new Map<string, Set<string>>();
  const e = ebay();
  const h = harness((url, init) => {
    if (!url.includes("/item_summary/search")) return e.handler(url, init, 0);
    const hd = init?.headers as Record<string, string>;
    const set = refs.get(hd["X-EBAY-C-MARKETPLACE-ID"]) ?? new Set<string>();
    set.add(requestedReference(init)!);
    refs.set(hd["X-EBAY-C-MARKETPLACE-ID"], set);
    return e.handler(url, init, 0);
  });
  const db = fakeDb(MANY(40));
  await runImport(deps(db, h), { concurrency: 1 });
  assert.deepEqual([...(refs.get("EBAY_US") ?? [])].sort(), ["mtg-us-chase", "mtg-us-item", "mtg-us-sealed", "mtg-us-set", "mtg-us-type"]);
  assert.deepEqual([...(refs.get("EBAY_AU") ?? [])].sort(), ["mtg-au-chase", "mtg-au-sealed", "mtg-au-set", "mtg-au-type"].concat(refs.get("EBAY_AU")?.has("mtg-au-item") ? ["mtg-au-item"] : []).sort());
  for (const [feed, v] of db.feeds) {
    const kind = feed.split("|")[1].split(":")[0];
    const mp = { EBAY_US: "us", EBAY_AU: "au", EBAY_GB: "uk", EBAY_CA: "ca", EBAY_DE: "eu" }[feed.split("|")[0] as "EBAY_US"];
    for (const it of v.items) assert.equal(new URL(it.url).searchParams.get("customid"), `mtg-${mp}-${kind}`, `${feed}: the URL is eBay's, with the feed's sub-id`);
  }
  assert.ok(db.feeds.size > 100);
});

test("replaceFeed's advisory lock and UTC timestamps are in the SQL (source check: the SQL itself runs against Postgres in the verification)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/lib/ebay-store.ts", import.meta.url), "utf8");
  assert.match(src, /pg_advisory_xact_lock\(hashtext\(\$\{feed\}\)\)/);
  assert.equal((src.match(/utcTimestamp\(/g) ?? []).length >= 2, true);
  const t = (await import("../src/lib/pg-time")).utcTimestamp(new Date("2026-10-07T06:37:00Z"));
  assert.match(t.sql, /::timestamptz AT TIME ZONE 'UTC'/);
  assert.deepEqual(t.values, ["2026-10-07T06:37:00.000Z"]);
});

test("run: a feed's rows are REPLACED (never appended); an empty or failed refresh keeps the old rows; a refresh failure of one feed does not stop the rest", async () => {
  const rows = [planRow("bundle", "US", 6000, { id: "bun-us", name: "Aetherdrift Bundle" }), planRow("bundle", "US", 7000, { id: "bun-none", name: "Tarkir: Dragonstorm Bundle" })];
  const db = fakeDb(rows);
  const old = (id: string) => ({ items: [{ id, title: "old", imageUrl: "https://i.ebayimg.com/x", price: { value: "1.00", currency: "USD" }, url: "https://www.ebay.com/itm/1" }], fetchedAt: new Date(NOW - 20 * 3600_000) });
  db.feeds.set("EBAY_US|item:bun-us", old("a"));
  db.feeds.set("EBAY_US|item:bun-none", old("b"));
  const handler: Handler = (url) => {
    if (url.includes("/oauth2/token")) return okToken();
    const q = new URL(url).searchParams.get("q") ?? "";
    if (q.includes("Tarkir")) return json({ itemSummaries: [summary("1", "MTG Japanese Tarkir Dragonstorm Bundle", 80), summary("2", "Tarkir Dragonstorm Bundle EMPTY box", 80)] }); // nothing relevant
    return json({ itemSummaries: [summary("11", "Magic The Gathering Aetherdrift Bundle Sealed", 90), summary("12", "MTG Aetherdrift Bundle NEW", 70)] });
  };
  const h = harness(handler);
  const s = await runImport(deps(db, h), { only: ["items"], concurrency: 1 });
  const fresh = db.feeds.get("EBAY_US|item:bun-us")!;
  assert.deepEqual(fresh.items.map((i) => i.price.value), ["70.00", "90.00"], "replaced, lowest price first");
  assert.equal(fresh.fetchedAt.getTime(), NOW);
  assert.equal(db.feeds.get("EBAY_US|item:bun-none")!.items[0].id, "b", "an empty result keeps the old rows");
  assert.equal(s.buckets.items.emptied, 1);
  assert.equal(s.buckets.items.refreshed, 1);
  // every search of a feed failing keeps the rows too
  const h2 = harness((url) => (url.includes("/oauth2/token") ? okToken() : json({}, 500)));
  const db2 = fakeDb(rows);
  db2.feeds.set("EBAY_US|item:bun-us", old("a"));
  const s2 = await runImport(deps(db2, h2), { only: ["items"], concurrency: 1 });
  assert.equal(db2.feeds.get("EBAY_US|item:bun-us")!.items[0].id, "a");
  assert.equal(s2.buckets.items.failed, 2);
  // a database failure on one feed is that feed's failure only
  const db3 = fakeDb(rows, { failReplace: (f) => f.includes("bun-us") });
  const e3 = ebay();
  const s3 = await runImport(deps(db3, harness(e3.handler)), { only: ["items"], concurrency: 1 });
  assert.equal(s3.buckets.items.failed, 1);
});

test("run: the purge deletes rows older than the bound + 4 h (26 + 4 by default, 5.5 + 4 in compliant mode), at the start and the end", async () => {
  const mk = (ageH: number) => ({ items: [{ id: "x", title: "x", imageUrl: "https://i.ebayimg.com/x", price: { value: "1.00", currency: "USD" }, url: "https://www.ebay.com/itm/1" }], fetchedAt: new Date(NOW - ageH * 3600_000) });
  const db = fakeDb([]);
  db.feeds.set("old", mk(31));
  db.feeds.set("edge", mk(29));
  db.feeds.set("fresh", mk(2));
  const s = await runImport(deps(db, harness(ebay().handler)), { dryRun: false, only: ["chase"], maxCalls: 0 });
  assert.ok(!db.feeds.has("old") && db.feeds.has("edge") && db.feeds.has("fresh"));
  assert.equal(s.purged, 1);
  const strict = fakeDb([]);
  strict.feeds.set("a", mk(10));
  strict.feeds.set("b", mk(9));
  await runImport(deps(strict, harness(ebay().handler), { EBAY_LISTING_MAX_AGE_HOURS: "5.5" }), { maxCalls: 0 });
  assert.ok(!strict.feeds.has("a") && strict.feeds.has("b"));
  assert.ok(strict.purges.every((c) => c.getTime() === NOW - hoursToMs(9.5)));
});

test("run: a dry run makes no call and writes nothing", async () => {
  const e = ebay();
  const h = harness(e.handler);
  const db = fakeDb(MANY(30));
  const s = await runImport(deps(db, h), { dryRun: true });
  assert.equal(h.calls.length, 0);
  assert.equal(db.ensured, 0);
  assert.equal(db.purges.length, 0);
  assert.equal(db.days.size, 0);
  assert.equal(db.feeds.size, 0);
  assert.equal(db.replaced.length, 0);
  // the plan it prints: the fixed feeds, the sweep's share and the per-product pre-plan
  assert.equal(s.plan.sweepBudget, DEFAULT_SWEEP_CALLS);
  assert.equal(s.plan.calls, 260 + DEFAULT_SWEEP_CALLS + 30);
  assert.equal(s.searches, 0);
  assert.deepEqual(s.sweep, []);
  assert.ok(runReport(s).join("\n").startsWith("DRY RUN"));
  // the same without the sweep (EBAY_SWEEP_CALLS=0)
  const h2 = harness(e.handler);
  const s2 = await runImport(deps(fakeDb(MANY(30)), h2, { EBAY_SWEEP_CALLS: "0" }), { dryRun: true });
  assert.equal(h2.calls.length, 0);
  assert.equal(s2.plan.calls, 260 + 30);
});

test("selectFeedItems: each rule keeps what it should, and an item feed keeps 8 at most", () => {
  const feed = (kind: "item" | "chase") => ({ ...fixedFeeds(TODAY)[0], rule: kind === "chase" ? { kind: "chase" as const } : { kind: "item" as const, target: { groupKey: "dft|bundle", type: "bundle" as const, setCode: "dft" } }, marketplace: "EBAY_US" as const });
  const bundles = Array.from({ length: 20 }, (_, i) => summary(String(i), "Magic The Gathering Aetherdrift Bundle Sealed", 100 - i));
  const out = selectFeedItems(feed("item"), [bundles], NOW);
  assert.equal(out.length, 8);
  assert.deepEqual(out.map((o) => Number(o.price.value)), [81, 82, 83, 84, 85, 86, 87, 88]);
  assert.deepEqual(selectFeedItems(feed("chase"), [bundles], NOW), [], "a Bundle is sealed, but not high-end");
  assert.deepEqual(selectFeedItems(feed("item"), [], NOW), []);
});

test("reports: counts and ages only, no titles or prices", async () => {
  const e = ebay();
  const s = await runImport(deps(fakeDb(MANY(20)), harness(e.handler)), { only: ["chase", "sweep", "items"] });
  const text = runReport(s).join("\n");
  assert.match(text, /Calls today: \d+/);
  assert.match(text, /Oldest row/);
  assert.match(text, /Item feeds in the database/);
  assert.match(text, /\| Sweep \| Products \| Pages \|/, "the sweep's table is in the report");
  assert.ok(s.sweep.length > 0);
  assert.ok(!/Special Illustration|A\$|US\$|\$\d/.test(text.replace(/US\$\d+/g, "")));
  assert.match(text, /\| Hot set \| EBAY_US \| EBAY_GB \| EBAY_DE \|/, "the hot-set table is in the report, even with no hot product");
});

test("run: hot sets first: each marketplace's sweep starts with the hot pass; then the hot products the sweep missed are searched one by one (packs too), then the eligible keys by value; the report counts only", async () => {
  const rows = hotRows();
  const db = fakeDb(rows);
  const old = (ageH: number) => ({ items: [{ id: "o", title: "old", imageUrl: "https://i.ebayimg.com/x", price: { value: "1.00", currency: "USD" }, url: "https://www.ebay.com/itm/1" }], fetchedAt: new Date(NOW - ageH * 3600_000) });
  db.feeds.set("EBAY_US|item:fra-cmd", old(5)); // stale for the skip-fresh rule, still shown: counts as a feed after the run
  db.feeds.set("EBAY_US|item:fra-pack", old(29.5)); // still there at the start; the run takes over 30 minutes, so the end purge removes it
  let n = 0;
  const h = harness((url, init) => {
    if (url.includes("/oauth2/token")) return okToken(n);
    n++;
    h.clock.t += 60_000; // a minute a search
    const q = new URL(url).searchParams.get("q") ?? "";
    const mp = ((init?.headers ?? {}) as Record<string, string>)["X-EBAY-C-MARKETPLACE-ID"];
    const ref = requestedReference(init);
    // the hot pass finds Reality Fracture Bundles in the US (two listings)
    if (q === "MTG reality fracture bundle" && mp === "EBAY_US")
      return json({ total: 2, itemSummaries: withReference([summary("h1", "MTG Reality Fracture Bundle Sealed", 70), summary("h2", "Magic The Gathering Reality Fracture Bundle", 65)], ref) });
    // anything else: one single card pulled from a box, which no product takes
    return json({ total: 1, itemSummaries: withReference([summary(`c${n}`, "MTG Reality Fracture Borderless Mythic Pulled From Collector Booster Box", 50, mp)], ref) });
  });
  const s = await runImport(deps(db, h, { EBAY_SWEEP_CALLS: "300" }), { only: ["sweep", "items"], concurrency: 1 });
  assert.equal(s.stopped, null);
  const calls = h.searches().map((c) => {
    const u = new URL(c.url);
    return { q: u.searchParams.get("q")!, mp: ((c.init?.headers ?? {}) as Record<string, string>)["X-EBAY-C-MARKETPLACE-ID"], limit: u.searchParams.get("limit") };
  });
  // the sweep, marketplace by marketplace in the priority order, each starting with every hot query FOR WHAT IT LISTS before any general one
  const hotQs = new Set(hotSweepQueries(rows, TODAY).map((x) => `MTG ${x.q}`));
  assert.equal(hotQs.size, 11, "Reality Fracture: collector box, bundle (and the special one), gift bundle, Commander deck, scene box, pack; The Hobbit: box, bundle, case; Avatar: bundle; Final Fantasy: gift bundle");
  const hotFor = (mp: string) => hotSweepQueries(rows.filter((r) => MARKETPLACE_OF_REGION[r.market.toLowerCase() as Region] === mp), TODAY).map((x) => `MTG ${x.q}`);
  assert.ok(MARKETPLACE_ORDER.some((mp) => hotFor(mp).length < hotQs.size), "a type only another market lists is not searched there");
  const sweep = calls.filter((c) => c.limit === "200");
  assert.deepEqual([...new Set(sweep.map((c) => c.mp))], [...MARKETPLACE_ORDER]);
  for (const mp of MARKETPLACE_ORDER) {
    const mine = new Set(hotFor(mp));
    const qs = sweep.filter((c) => c.mp === mp).map((c) => c.q);
    assert.ok(qs.every((q) => mine.has(q) || !hotQs.has(q)), `${mp}: no hot query for a set/type it does not list`);
    if (!mine.size) continue;
    const lastHot = qs.findLastIndex((q) => mine.has(q));
    const firstGeneral = qs.findIndex((q) => !mine.has(q));
    assert.equal(lastHot, mine.size - 1, mp);
    assert.equal(firstGeneral, mine.size, `${mp}: the hot pass first`);
    assert.equal(qs[0], hotFor(mp)[0], `${mp}: the most wanted hot set first of all`);
  }
  assert.ok(s.sweep.every((m) => m.hotPages === hotFor(m.marketplace).length && m.hotQueries.length === hotFor(m.marketplace).length));
  assert.ok(db.feeds.has("EBAY_US|item:fra-bun"), "the hot pass wrote the Reality Fracture Bundle's feed");
  // then one search per product the sweep did not cover: the hot ones (the US$6 pack included) before every other eligible key
  const perProduct = calls.filter((c) => c.limit === "50").map((c) => `${c.mp} ${c.q}`);
  const expected = perProductFeeds(rows, undefined, TODAY)
    .filter((f) => f.feed !== "EBAY_US|item:fra-bun")
    .map((f) => `${f.marketplace} ${f.searches[0].q}`);
  assert.deepEqual(perProduct, expected);
  // a hot set's own products are searched by the keyword sellers use ("Hobbit", "Avatar"), not the set's catalogue name
  assert.equal(perProduct[0], "EBAY_US MTG Reality Fracture Collector Booster Box");
  assert.ok(perProduct.includes("EBAY_US MTG Reality Fracture Play Booster Pack"));
  assert.ok(perProduct.includes("EBAY_US MTG Hobbit Play Booster Box"));
  assert.equal(perProduct.indexOf("EBAY_US MTG Final Fantasy Gift Bundle"), 9, "the last of the 10 hot products the sweep missed...");
  assert.equal(perProduct.indexOf("EBAY_US MTG Aetherdrift Play Booster Box"), 10, "...then the most valuable other eligible key");
  assert.equal(perProduct.indexOf("EBAY_US MTG Star Trek Play Booster Box"), 11, "Star Trek is not out: an eligible key, not a hot one yet");
  assert.deepEqual(s.hotItems, { keys: 11, fresh: 0, covered: 1, searched: 10, refreshed: 0 });
  assert.equal(s.buckets.items.skipped, 0);
  assert.equal(s.buckets.items.planned, 15);
  assert.equal(s.feedsPlanned, 14, "the booster pack's own search is best effort (not an eligible key): outside the job's exit check, in the hot-set line");
  // every call reserved, and the bucket counts add up
  assert.equal(db.days.get(s.day), h.searches().length);
  assert.equal(s.buckets.sweep.calls + s.buckets.items.calls, h.searches().length);
  // the Hot sets table: products with an item feed after the run / products listed (the 29.5-hour-old feed was purged at the end)
  assert.ok(!db.feeds.has("EBAY_US|item:fra-pack"));
  const fra = s.hot.find((c) => c.set === "fra" && c.marketplace === "EBAY_US")!;
  assert.deepEqual([fra.withFeed, fra.products], [2, 4], "the swept Bundle and the 5-hour-old Commander deck");
  const text = runReport(s).join("\n");
  assert.match(text, /\| fra \(Reality Fracture\) \| 2\/4 \(50%\) \| 0\/1 \(0%\) \| 0\/1 \(0%\) \|/);
  assert.match(text, /\| hob \(The Hobbit\) \| 0\/3 \(0%\) \| - \| - \|/);
  assert.match(text, /\| msh \(Marvel Super Heroes\) \| - \| - \| - \|/);
  assert.match(text, /Hot-set products in EBAY_US, EBAY_GB, EBAY_DE: 11; 1 covered by the sweep, 0 fresh \(not bought again\), 10 searched one by one this run \(0 found listings\)\./);
  const usHot = hotFor("EBAY_US").length;
  assert.match(text, new RegExp(`\\| EBAY_US \\| 12 \\| \\d+ \\| ${usHot} \\(${usHot}\\) \\|`), "the sweep table's hot-pass column");
  // counts only: no listing title, product name or price
  assert.ok(!/Magic The Gathering|Sealed|Borderless|Pulled|Booster Pack|\$\d|£|€|65\.00|70\.00/.test(text), text);
});

test("DEPLOY.md says what the owner must know: both prongs of 8.1(c), the whole switch, the shared keyset, the reporting granularity", async () => {
  const { readFileSync } = await import("node:fs");
  const doc = readFileSync(new URL("../DEPLOY.md", import.meta.url), "utf8");
  const wf = readFileSync(new URL("../.github/workflows/ebay-import.yml", import.meta.url), "utf8");
  // both prongs of the Age clause, quoted, with the section as the live agreement numbers it
  for (const needle of ["8.1(c)", "Age of Displayed eBay Content", "six (6) hours older than information displayed on the eBay Site", "twenty-four (24) hours older than content displayed on the eBay Site", "how much older your displayed item listing is", "8.1(b)(1)", "3.1(b)"]) assert.ok(doc.includes(needle), `DEPLOY.md quotes ${needle}`);
  // the switch: cron + the age variable (GitHub and Vercel) + the run cap; the copy follows by itself
  for (const needle of ['"37 8 * * *"', '"13 */4 * * *"', "EBAY_LISTING_MAX_AGE_HOURS=5.5", "EBAY_RUN_CAP", "380", "follows the bound by itself"]) assert.ok(doc.includes(needle), `DEPLOY.md's switch says ${needle}`);
  assert.ok(wf.includes('cron: "37 8 * * *"') && wf.includes("13 */4 * * *") && wf.includes("EBAY_RUN_CAP = 380"));
  // the shared keyset, prominently (before the first subsection), with both remedies
  const head = doc.slice(doc.indexOf("## eBay listings: the daily import"), doc.indexOf("### Why daily"));
  assert.match(head, /READ THIS FIRST/);
  assert.match(head, /separate eBay application/);
  assert.match(head, /EBAY_DAILY_CAP/);
  assert.match(head, /BOTH sites/);
  // what EPN reports for listing tiles
  for (const needle of ["mtg-us-chase", "mtg-au-item", "affiliateReferenceId", "exactly as returned"]) assert.ok(doc.includes(needle), `DEPLOY.md explains ${needle}`);
  // the numbers the code enforces appear in the doc as they are
  assert.ok(doc.includes(`**${BREAKER_FAILURES} searches in a row that fail**`) && doc.includes(`${BREAKER_EMPTY} in a row that come back with no listings`));
  assert.ok(doc.includes("less than 2 hours old") && doc.includes("strict upper bound"));
});
