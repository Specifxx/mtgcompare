// The catalogue / index / tracking policy of src/lib/track.ts (owner WP01a, contract section 5). Table-tested on the dials, then replayed on the 57 real products of tests/fixtures/magic-products.json
// with their real TCGplayer prices (scripts/contract-checks/check-policy-snapshot.ts replays the same functions over all 111,839 singles). Cents throughout; the score is NOT rounded.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as T from "../src/lib/track";
import { finishPrices } from "../src/lib/catalog";
import { CARD_CLASS, PRICE_MASK } from "../src/lib/constants";

const cfg = T.TRACK_DEFAULTS;
const at50 = { ...cfg, catalogFloorCents: 50 };

test("the dials: defaults, every env name, junk falls back, and the hash covers the policy dials only", () => {
  assert.deepEqual(cfg, {
    catalogFloorCents: 1, catalogExitRatio: 0.8, oracleComplete: true, indexFloorCents: 50, specialFloorCents: 2000, trackFloorCents: 500, trackExitRatio: 0.8, lowBasis: false, popBoost: false, perOracleCap: 0,
    clipCents: 200_000, catalogMaxRows: 200_000, trackMaxUnits: 70_000, offerRowsBudget: 450_000, maxListedChange: 0.05, maxTrackedChange: 0.15, acceptFlagChange: false, maxGuardTrips: 3,
  });
  assert.deepEqual(T.trackConfigFromEnv({}), cfg);
  assert.equal(T.trackConfigFromEnv({ CATALOG_FLOOR_CENTS: "25", TRACK_LOW_BASIS: "1", TRACK_FLOOR_CENTS: "abc" }).catalogFloorCents, 25);
  assert.equal(T.trackConfigFromEnv({ TRACK_FLOOR_CENTS: "abc" }).trackFloorCents, 500, "junk falls back to the default");
  assert.equal(T.trackConfigFromEnv({ TRACK_FLOOR_CENTS: "-5" }).trackFloorCents, 500, "a negative dial falls back");
  assert.deepEqual(
    T.trackConfigFromEnv({ CATALOG_ORACLE_COMPLETE: "0", IMPORT_ACCEPT_FLAG_CHANGE: "1", INDEX_FLOOR_CENTS: "75", IMPORT_GUARD_MAX_TRIPS: "0", TRACK_LOW_BASIS: "1", TRACK_POP_BOOST: "1", TRACK_PER_ORACLE_CAP: "3" }),
    { ...cfg, oracleComplete: false, acceptFlagChange: true, indexFloorCents: 75, maxGuardTrips: 1, lowBasis: true, popBoost: true, perOracleCap: 3 },
  );
  assert.equal(T.trackConfigHash(cfg), "1|0.8|1|50|2000|500|0.8|0|0|0|200000");
  assert.equal(T.trackConfigHash(cfg), T.trackConfigHash({ ...cfg, maxListedChange: 0.5, catalogMaxRows: 1, acceptFlagChange: true }), "guard and cap fields are not policy");
  assert.notEqual(T.trackConfigHash(cfg), T.trackConfigHash({ ...cfg, catalogFloorCents: 25 }));
  assert.notEqual(T.trackConfigHash(cfg), T.trackConfigHash({ ...cfg, trackFloorCents: 200 }));
});

test("popularity and score: EDHREC rank and the Reserved List, clipped for scoring only, never rounded", () => {
  assert.equal(T.popularity(null, false), 0);
  assert.equal(T.popularity(null, true), 0.5);
  assert.equal(T.popularity(80, false).toFixed(3), "0.949");
  assert.equal(T.popularity(1500, false), 0.5);
  assert.equal(T.popularity(1500, true), 0.5);
  assert.ok(T.popularity(1, true) > 0.99);
  assert.equal(Math.round(T.trackScoreCents({ n: 25, f: null }, T.popularity(80, false), cfg)), 72, "a 25 cent staple at EDHREC rank 80 scores 72");
  assert.equal(T.trackScoreCents({ n: 49, f: null }, 0, cfg), 49, "unrounded: 49 stays 49 and never reaches 50");
  assert.equal(T.trackScoreCents({ n: null, f: null }, 0.9, cfg), 0);
  assert.equal(T.trackScoreCents({ n: 100, f: 900 }, 0, cfg), 900, "the better finish");
  assert.equal(T.trackScoreCents({ n: 20_306_770, f: null }, 0, cfg), 200_000, "clipped at $2,000 for scoring");
});

test("catalogue: the default floor lists every priced single; the fallback ladder (50) keeps the first draft's behaviour; specials need $20", () => {
  assert.deepEqual([T.inCatalogue(60, false, 0, at50), T.inCatalogue(30, false, 0, at50), T.inCatalogue(45, true, 0, at50), T.inCatalogue(39, true, 0, at50)], [true, false, true, false], "floor 50 with its 0.8 band");
  assert.deepEqual([T.inCatalogue(1999, false, 1, at50), T.inCatalogue(2000, false, 1, at50), T.inCatalogue(1600, true, 1, at50), T.inCatalogue(100000, false, 1, { ...at50, specialFloorCents: 0 })], [false, true, true, false], "specials: $20, same band, 0 disables");
  assert.deepEqual([T.inCatalogue(1, false, 0, cfg), T.inCatalogue(0.5, false, 0, cfg), T.inCatalogue(0.8, true, 0, cfg), T.inCatalogue(0.79, true, 0, cfg)], [true, false, true, false], "default 1 cent");
  for (const cls of [CARD_CLASS.TOKEN, CARD_CLASS.ART, CARD_CLASS.OVERSIZED, CARD_CLASS.HELPER]) assert.equal(T.inCatalogue(1999, false, cls, cfg), false);
});

test("THIN and indexable: score under the index floor is thin with the same Schmitt band; classes 1 to 4 are always thin; one missing day keeps the page indexable", () => {
  assert.deepEqual([T.isThin(49.9, false, 0, cfg), T.isThin(50, false, 0, cfg), T.isThin(41, true, 0, cfg), T.isThin(41, false, 0, cfg), T.isThin(39, true, 0, cfg), T.isThin(5000, true, 1, cfg), T.isThin(5, false, 0, { ...cfg, indexFloorCents: 0 })], [true, false, false, true, true, true, false]);
  const L = PRICE_MASK.LISTED;
  assert.deepEqual(
    [T.isIndexable(L | PRICE_MASK.TOP, 0), T.isIndexable(L | PRICE_MASK.TRACKF, 0), T.isIndexable(L | PRICE_MASK.TRACKN, 0), T.isIndexable(L, 0), T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.THIN, 0), T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.GONE, 0),
      T.isIndexable(L | PRICE_MASK.TOP | PRICE_MASK.GONEP, 0), T.isIndexable(PRICE_MASK.TOP, 0), T.isIndexable(L | PRICE_MASK.TOP, 1)],
    [true, true, true, false, false, false, true, false, false],
  );
});

test("oracle completeness: every priced oracle keeps its TOP printing; market ranks, a low never does; ties go to the higher value, then the lower id", () => {
  const rows = [
    { id: 10, oracleId: "a", marketCents: 40, valueCents: 40 }, { id: 11, oracleId: "a", marketCents: 40, valueCents: 40 },
    { id: 20, oracleId: "b", marketCents: null, valueCents: 900 }, { id: 21, oracleId: "b", marketCents: 5, valueCents: 5 },
    { id: 30, oracleId: "c", marketCents: 100, valueCents: 100 }, { id: 40, oracleId: null, marketCents: 100, valueCents: 100 },
    { id: 50, oracleId: "d", marketCents: 7, valueCents: 7 }, { id: 51, oracleId: "d", marketCents: 7, valueCents: 12 },
  ];
  assert.deepEqual([...T.completenessPicks(rows, new Set(["c"]))].sort((x, y) => x - y), [10, 21, 51]);
  assert.deepEqual([...T.completenessPicks([...rows].reverse(), new Set(["c"]))].sort((x, y) => x - y), [10, 21, 51], "order independent");
  assert.equal(T.completenessPicks(rows, new Set(["a", "b", "c", "d"])).size, 0);
});

test("units: tracked at the market floor with a 20% band; a thin low never tracks; classes 1 to 4 never track", () => {
  assert.deepEqual([T.unitTracked(500, false, false, cfg), T.unitTracked(499, false, false, cfg), T.unitTracked(400, true, false, cfg), T.unitTracked(399, true, false, cfg)], [true, false, true, false]);
  assert.deepEqual([T.unitTracked(100000, false, true, cfg), T.unitTracked(100000, false, true, { ...cfg, lowBasis: true }), T.unitTracked(9999, false, false, cfg, CARD_CLASS.TOKEN), T.unitTracked(null, true, false, cfg)], [false, true, false, false]);
});

test("market ranks, display shows; the headline is Normal first; bestUsd is the dearer MARKET; normalizeFoil forces the only finish a product has", () => {
  assert.equal(T.marketOnlyCents({ marketCents: 100, lowCents: 5 }), 100);
  assert.equal(T.marketOnlyCents({ marketCents: null, lowCents: 5 }), null);
  assert.equal(T.marketOnlyCents(null), null);
  assert.deepEqual(T.unitValueCents({ marketCents: null, lowCents: 5 }), { cents: 5, lowBasis: true });
  assert.deepEqual(T.unitValueCents({ marketCents: 7, lowCents: 5 }), { cents: 7, lowBasis: false });
  assert.equal(T.unitValueCents({ marketCents: null, lowCents: null }), null);
  assert.deepEqual([T.headlineOf(100, 900), T.headlineOf(null, 900), T.headlineOf(null, null), T.headlineOf(0, 900)], [{ cents: 100, finish: "N" }, { cents: 900, finish: "F" }, { cents: null, finish: "N" }, { cents: 0, finish: "N" }]);
  assert.equal(T.bestUsd({ marketN: 100, marketF: 900 }), 900);
  assert.equal(T.bestUsd({ marketN: null, marketF: null }), null);
  assert.equal(T.bestUsd({ marketN: 0, marketF: null }), null);
  assert.deepEqual([T.normalizeFoil({ mask: PRICE_MASK.HASF }, false), T.normalizeFoil({ mask: PRICE_MASK.HASN }, true), T.normalizeFoil({ mask: PRICE_MASK.HASN | PRICE_MASK.HASF }, true), T.normalizeFoil({ mask: PRICE_MASK.HASN | PRICE_MASK.HASF }, false)], [true, false, true, false]);
});

test("F10: a mass flag change is refused, then released by a changed dial, an explicit accept, the Nth consecutive trip, or a first run", () => {
  const big = { rows: 98000, tracked: 28000 };
  const over = { listed: 6000, tracked: 100 };
  const under = { listed: 4000, tracked: 100 };
  assert.deepEqual(T.flagChangeGuard(big, over, cfg), { ok: false, reason: "LISTED would change on 6000 of 98000 rows", trips: 1 });
  assert.equal(T.flagChangeGuard(big, under, cfg).ok, true);
  assert.equal(T.flagChangeGuard({ rows: 0, tracked: 0 }, { listed: 9e9, tracked: 9e9 }, cfg).bypass, "first-run");
  assert.equal(T.flagChangeGuard({ rows: 999, tracked: 999 }, { listed: 999, tracked: 999 }, cfg).bypass, "first-run", "under 1,000 rows is exempt");
  assert.equal(T.flagChangeGuard(big, over, cfg, { configChanged: true, priorTrips: 0 }).bypass, "config-changed", "the draft silently vetoed CATALOG_FLOOR_CENTS=25; a changed dial now releases once");
  assert.equal(T.flagChangeGuard(big, over, { ...cfg, acceptFlagChange: true }).bypass, "accepted");
  assert.deepEqual([T.flagChangeGuard(big, over, cfg, { configChanged: false, priorTrips: 1 }), T.flagChangeGuard(big, over, cfg, { configChanged: false, priorTrips: 2 })].map((v) => [v.ok, v.trips, v.bypass]), [[false, 2, undefined], [true, 0, "persisted"]], "the third consecutive trip is accepted");
  assert.equal(T.flagChangeGuard(big, { listed: 0, tracked: 5000 }, cfg).ok, false, "15% of tracked units");
  assert.equal(T.flagChangeGuard(big, { listed: 0, tracked: 4000 }, cfg).ok, true);
  assert.equal(T.flagChangeGuard({ rows: 98000, tracked: 999 }, { listed: 0, tracked: 999 }, cfg).ok, true, "the tracked-change rule needs 1,000 tracked units");
});

// ── the policy on the real fixtures ──
interface Fx { productId: number; name: string; prices: { Normal?: { market: number | null; low: number | null }; Foil?: { market: number | null; low: number | null } }; expect: { cls: number | "sealed"; hasN: boolean; hasF: boolean }; scryfall: { edhrec_rank: number | null; reserved: boolean }[] }
const fixtures: Fx[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/magic-products.json"), "utf8"));
const byId = new Map(fixtures.map((f) => [f.productId, f]));
function policy(id: number): { cls: number; score: number; listed: boolean; thin: boolean; trackedN: boolean; trackedF: boolean; lowOnlyN: boolean; lowOnlyF: boolean; headline: { cents: number | null; finish: string }; best: number | null } {
  const f = byId.get(id)!;
  const rows = finishPrices(Object.entries(f.prices).map(([subTypeName, p]) => ({ productId: id, subTypeName, marketPrice: p.market, lowPrice: p.low })));
  const n = T.unitValueCents(rows.n), fv = T.unitValueCents(rows.f);
  const cls = f.expect.cls as number;
  const joined = f.scryfall[0];
  const pop = cls === 0 && joined ? T.popularity(joined.edhrec_rank, joined.reserved) : 0;
  const score = cls === 0 ? T.trackScoreCents({ n: n?.cents ?? null, f: fv?.cents ?? null }, pop, cfg) : Math.max(n?.cents ?? 0, fv?.cents ?? 0);
  return {
    cls, score, listed: T.inCatalogue(score, false, cls, cfg), thin: T.isThin(score, false, cls, cfg),
    trackedN: T.unitTracked(n?.cents ?? null, false, n?.lowBasis ?? false, cfg, cls), trackedF: T.unitTracked(fv?.cents ?? null, false, fv?.lowBasis ?? false, cfg, cls),
    lowOnlyN: n?.lowBasis ?? false, lowOnlyF: fv?.lowBasis ?? false,
    headline: T.headlineOf(T.marketOnlyCents(rows.n) ?? n?.cents ?? null, T.marketOnlyCents(rows.f) ?? fv?.cents ?? null), best: T.bestUsd({ marketN: T.marketOnlyCents(rows.n), marketF: T.marketOnlyCents(rows.f) }),
  };
}
test("fixture 2831 Birds of Paradise (7th Edition, shared id): both finishes tracked; the Foil is worth $3,980.75 and still not the headline", () => {
  const p = policy(2831);
  assert.deepEqual([p.listed, p.thin, p.trackedN, p.trackedF, p.headline.finish, p.best], [true, false, true, true, "N", 398075]);
  assert.ok(p.score > 200_000, "the clip is for scoring only: 200,000 cents times (1 + 2 pop)");
});
test("fixture 3077 Shivan Dragon: the Foil row is a thin low ($8.97): shown, never tracked, never the best value", () => {
  const p = policy(3077);
  assert.deepEqual([p.listed, p.trackedN, p.trackedF, p.lowOnlyN, p.lowOnlyF, p.best], [true, false, false, false, true, 91]);
});
test("fixture 449401 Living Artifact: a $203,067.70 single thin listing is listed and scored (clipped) but never tracked and never ranked", () => {
  const p = policy(449401);
  assert.deepEqual([p.listed, p.thin, p.trackedN, p.lowOnlyN, p.best, p.score >= 200_000], [true, false, false, true, null, true]);
  assert.equal(T.marketOnlyCents({ marketCents: null, lowCents: 20_306_770 }), null);
});
test("fixtures 719547 and 8989 and 664143: low-only units are listed, not tracked, not ranked", () => {
  for (const id of [719547, 8989, 664143, 485192]) { const p = policy(id); assert.deepEqual([p.listed, p.trackedN, p.trackedF, p.best], [true, false, false, null], String(id)); }
});
test("fixtures 692998 and 630946: a $298 and a $1,845 foil are tracked on their Foil unit only, and the headline falls to Foil", () => {
  for (const id of [692998, 630946]) { const p = policy(id); assert.deepEqual([p.trackedN, p.trackedF, p.headline.finish], [false, true, "F"], String(id)); }
});
test("fixtures 496078 and 80110: a 25 cent Forest and a 10 cent common are listed (floor 1 cent) but THIN: a page and a search hit, no sitemap entry", () => {
  for (const id of [496078, 80110, 4536, 286903]) { const p = policy(id); assert.deepEqual([p.listed, p.thin, p.trackedN, p.trackedF], [true, true, false, false], String(id)); }
});
test("fixture 638920 Plains Galaxy Foil at $4.21: below the floor, but a unit that was tracked stays tracked down to $4.00", () => {
  const p = policy(638920);
  assert.deepEqual([p.trackedF, T.unitTracked(421, true, false, cfg), T.unitTracked(421, false, false, cfg)], [false, true, false]);
});
test("fixture 165632 Treasure Token at $215.24: a special is listed at $20 and above, always THIN, never tracked; the Art Card at $4 low is not listed", () => {
  const t = policy(165632);
  assert.deepEqual([t.cls, t.listed, t.thin, t.trackedF], [CARD_CLASS.TOKEN, true, true, false]);
  const art = policy(718476);
  assert.deepEqual([art.cls, art.listed, art.thin, art.trackedN], [CARD_CLASS.ART, false, true, false]);
  const rules = policy(189807);
  assert.deepEqual([rules.cls, rules.listed], [CARD_CLASS.HELPER, false], "no price row at all");
});
test("on every priced fixture: tracked implies listed, a low-only unit is never tracked, THIN means score under 50 or not class 0, and the headline is Normal when Normal has a value", () => {
  let checked = 0;
  for (const f of fixtures) {
    if (f.expect.cls === "sealed" || !(f.expect.hasN || f.expect.hasF)) continue;
    const p = policy(f.productId); checked++;
    if (p.trackedN || p.trackedF) assert.ok(p.listed, `${f.productId} tracked but not listed`);
    if (p.lowOnlyN) assert.equal(p.trackedN, false, `${f.productId} N`);
    if (p.lowOnlyF) assert.equal(p.trackedF, false, `${f.productId} F`);
    if (p.cls === 0) assert.equal(p.thin, p.score < cfg.indexFloorCents, String(f.productId)); else assert.equal(p.thin, true);
    const rows = finishPrices(Object.entries(f.prices).map(([subTypeName, q]) => ({ productId: f.productId, subTypeName, marketPrice: q.market, lowPrice: q.low })));
    if (T.unitValueCents(rows.n)) assert.equal(p.headline.finish, "N", `${f.productId}: Normal first`);
  }
  assert.ok(checked >= 45, `only ${checked} priced fixtures`);
});
