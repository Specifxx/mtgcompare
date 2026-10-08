import * as T from "../../src/lib/track";
import { PRICE_MASK } from "../../src/lib/constants";
let fails = 0; const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } };
const cfg = T.TRACK_DEFAULTS;
const at50 = { ...cfg, catalogFloorCents: 50 };
// env parsing: every dial, junk falls back
eq(T.trackConfigFromEnv({ CATALOG_FLOOR_CENTS: "25", TRACK_LOW_BASIS: "1", TRACK_FLOOR_CENTS: "abc" }).catalogFloorCents, 25, "env floor");
eq(T.trackConfigFromEnv({ TRACK_FLOOR_CENTS: "abc" }).trackFloorCents, 500, "bad env falls back");
eq(T.trackConfigFromEnv({}).catalogFloorCents, 1, "default catalogue floor is one cent (every priced single)");
eq(T.trackConfigFromEnv({ CATALOG_ORACLE_COMPLETE: "0", IMPORT_ACCEPT_FLAG_CHANGE: "1", INDEX_FLOOR_CENTS: "75", IMPORT_GUARD_MAX_TRIPS: "0" }), { ...cfg, oracleComplete: false, acceptFlagChange: true, indexFloorCents: 75, maxGuardTrips: 1 }, "new dials");
// popularity and score
eq([T.popularity(80, false).toFixed(3), T.popularity(null, true), T.popularity(null, false)], ["0.949", 0.5, 0], "pop");
eq(Math.round(T.trackScoreCents({ n: 25, f: null }, T.popularity(80, false), cfg)), 72, "$0.25 rank 80 staple");
// catalogue: the fallback ladder (floor 50) still behaves as the first draft; the default (1) lists everything priced
eq([T.inCatalogue(60, false, 0, at50), T.inCatalogue(30, false, 0, at50), T.inCatalogue(45, true, 0, at50), T.inCatalogue(39, true, 0, at50), T.inCatalogue(1999, false, 1, at50), T.inCatalogue(2000, false, 1, at50), T.inCatalogue(100000, false, 1, { ...at50, specialFloorCents: 0 })], [true, false, true, false, false, true, false], "catalogue at 50");
eq([T.inCatalogue(1, false, 0, cfg), T.inCatalogue(0.5, false, 0, cfg), T.inCatalogue(0.8, true, 0, cfg), T.inCatalogue(0.79, true, 0, cfg)], [true, false, true, false], "catalogue at the default 1 cent");
// THIN and indexable
eq([T.isThin(49.9, false, 0, cfg), T.isThin(50, false, 0, cfg), T.isThin(41, true, 0, cfg), T.isThin(41, false, 0, cfg), T.isThin(39, true, 0, cfg), T.isThin(5000, true, 1, cfg), T.isThin(5, false, 0, { ...cfg, indexFloorCents: 0 })], [true, false, false, true, true, true, false], "thin: floor, band (wasIndexable), class");
const L = PRICE_MASK.LISTED;
eq([T.isIndexable(L | PRICE_MASK.TOP, 0), T.isIndexable(L | PRICE_MASK.TRACKF, 0), T.isIndexable(L, 0), T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.THIN, 0), T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.GONE, 0), T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.GONEP, 0), T.isIndexable(PRICE_MASK.TOP, 0), T.isIndexable(L | PRICE_MASK.TOP, 1)],
   [true, true, false, false, false, true, false, false], "isIndexable");
// oracle completeness
const rows = [
  { id: 10, oracleId: "a", marketCents: 40, valueCents: 40 }, { id: 11, oracleId: "a", marketCents: 40, valueCents: 40 },        // tie: the lower id wins
  { id: 20, oracleId: "b", marketCents: null, valueCents: 900 }, { id: 21, oracleId: "b", marketCents: 5, valueCents: 5 },      // a market of 5 beats a low-only 900 (market ranks, never a low)
  { id: 30, oracleId: "c", marketCents: 100, valueCents: 100 }, { id: 40, oracleId: null, marketCents: 100, valueCents: 100 },  // c is already listed; no oracle: skipped
];
eq([...T.completenessPicks(rows, new Set(["c"]))].sort((x, y) => x - y), [10, 21], "completenessPicks");
// units, headline
eq([T.unitTracked(500, false, false, cfg), T.unitTracked(499, false, false, cfg), T.unitTracked(400, true, false, cfg), T.unitTracked(399, true, false, cfg), T.unitTracked(100000, false, true, cfg), T.unitTracked(100000, false, true, { ...cfg, lowBasis: true }), T.unitTracked(9999, false, false, cfg, 1)], [true, false, true, false, false, true, false], "tracked");
eq([T.marketOnlyCents({ marketCents: 100, lowCents: 5 }), T.marketOnlyCents({ marketCents: null, lowCents: 5 }), T.marketOnlyCents(null), T.unitValueCents({ marketCents: null, lowCents: 5 })], [100, null, null, { cents: 5, lowBasis: true }], "market-only ranking value vs display value");
eq([T.headlineOf(100, 900), T.headlineOf(null, 900), T.headlineOf(null, null)], [{ cents: 100, finish: "N" }, { cents: 900, finish: "F" }, { cents: null, finish: "N" }], "headline");
eq([T.normalizeFoil({ mask: 2 }, false), T.normalizeFoil({ mask: 1 }, true), T.normalizeFoil({ mask: 3 }, true)], [true, false, true], "normalizeFoil");
// F10 and its recovery (critique 8): trip, release by config change, by accept, by the Nth consecutive trip; first run exempt
const big = { rows: 98000, tracked: 28000 }, over = { listed: 6000, tracked: 100 }, under = { listed: 4000, tracked: 100 };
eq([T.flagChangeGuard(big, over, cfg), T.flagChangeGuard(big, under, cfg).ok, T.flagChangeGuard({ rows: 0, tracked: 0 }, { listed: 9e9, tracked: 9e9 }, cfg).bypass], [{ ok: false, reason: "LISTED would change on 6000 of 98000 rows", trips: 1 }, true, "first-run"], "guard trips and passes");
eq(T.flagChangeGuard(big, over, cfg, { configChanged: true, priorTrips: 0 }).bypass, "config-changed", "a changed dial releases once");
eq(T.flagChangeGuard(big, over, { ...cfg, acceptFlagChange: true }).bypass, "accepted", "explicit accept");
eq([T.flagChangeGuard(big, over, cfg, { configChanged: false, priorTrips: 1 }), T.flagChangeGuard(big, over, cfg, { configChanged: false, priorTrips: 2 })].map((v) => [v.ok, v.trips, v.bypass]), [[false, 2, undefined], [true, 0, "persisted"]], "the third consecutive trip is accepted");
eq(T.flagChangeGuard(big, { listed: 0, tracked: 5000 }, cfg).ok, false, "tracked-change guard");
eq(T.trackConfigHash(cfg) === T.trackConfigHash({ ...cfg, maxListedChange: 0.5, catalogMaxRows: 1 }) && T.trackConfigHash(cfg) !== T.trackConfigHash({ ...cfg, catalogFloorCents: 25 }), true, "hash covers policy dials, not guard/cap fields");
console.log(fails ? fails + " FAILURES" : "track unit checks pass");
