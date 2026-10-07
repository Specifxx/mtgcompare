import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_DEFAULT_SIZE, guideHref, guideRobots, guideStats, isGuideDefault, parseGuide, runGuide, sortGuide, thirtyDayCoverage } from "../src/lib/price-guide-query";
import type { CardLite, SetLite } from "../src/lib/data";

const SETS: SetLite[] = [
  { id: 1, slug: "op01", code: "OP01", name: "Romance Dawn", kind: "booster", releasedOn: "2022-12-02", cardCount: 3, sealedCount: 0 },
  { id: 2, slug: "op02", code: "OP02", name: "Paramount War", kind: "booster", releasedOn: "2023-03-10", cardCount: 2, sealedCount: 0 },
];
const setById = new Map(SETS.map((s) => [s.id, s]));
const c = (id: number, name: string, number: string, setId: number, usLow: number | null, over: Partial<CardLite> = {}): CardLite => ({
  id, slug: `c${id}`, name, number, setId, rarity: "R", variant: null, printing: "standard", colors: ["Red"], cardType: "Character", cost: 1, power: 1000, counter: null, life: null, hasImage: true,
  marketUsd: usLow, low: { US: usLow, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: usLow ? 2 : 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, change7d: null, change30d: null, high90Usd: null, ...over,
});
const CARDS = [
  c(1, "Zoro", "OP01-025", 1, 500, { change7d: 5, change30d: 10, stores: { US: 4, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 } }),
  c(2, "Nami", "OP01-016", 1, 100, { change7d: -3, change30d: -8 }),
  c(3, "Luffy", "OP01-003", 1, null, { marketUsd: 900 }),
  c(4, "Ace", "OP02-013", 2, 2000, { change7d: 1, change30d: null, printing: "alt", colors: ["Blue"] }),
  c(5, "Sanji", "OP02-001", 2, 50, { change7d: 20, change30d: 3 }),
];

test("parse: defaults, sort and size validation, market override", () => {
  const q = parseGuide({});
  assert.equal(q.sort, "price-desc");
  assert.equal(q.size, GUIDE_DEFAULT_SIZE);
  assert.equal(q.market, null);
  assert.equal(isGuideDefault(q), true);
  const r = parseGuide({ sort: "nope", per: "7", market: "au" });
  assert.equal(r.sort, "price-desc");
  assert.equal(r.size, 100);
  assert.equal(r.market, "AU");
  assert.equal(isGuideDefault(r), false);
  assert.equal(parseGuide({ per: "200" }).size, 200);
});

test("sorts: price (unpriced after priced; TCGplayer reference counts as a price), movers, stores, name, number", () => {
  const ids = (sort: Parameters<typeof sortGuide>[1]) => sortGuide(CARDS, sort, "US").map((x) => x.id);
  assert.deepEqual(ids("price-desc"), [4, 3, 1, 2, 5]); // 3 has no listing: TCGplayer's US$9 reference ranks it between
  assert.equal(ids("price-desc")[0], 4);
  assert.equal(ids("price-asc")[0], 5);
  assert.deepEqual(ids("rising").slice(0, 3), [5, 1, 4]);
  assert.deepEqual(ids("falling").slice(0, 2), [2, 4]);
  assert.equal(ids("rising30")[0], 1);
  assert.equal(ids("stores")[0], 1);
  assert.equal(CARDS.find((x) => x.id === ids("name")[0])!.name, "Ace");
  assert.equal(CARDS.find((x) => x.id === ids("number")[0])!.number, "OP01-003");
  // Stable across calls: a page boundary never moves.
  assert.deepEqual(ids("price-desc"), ids("price-desc"));
});

test("runGuide filters like /browse and pages in memory", () => {
  const r = runGuide(CARDS, SETS, setById, parseGuide({ set: "op02" }), "US");
  assert.equal(r.total, 2);
  assert.deepEqual(r.items.map((x) => x.id), [4, 5]);
  const p = runGuide(CARDS, SETS, setById, parseGuide({ color: "blue" }), "US");
  assert.deepEqual(p.items.map((x) => x.id), [4]);
  const big = runGuide(CARDS, SETS, setById, parseGuide({ per: "50" }), "US");
  assert.equal(big.pages, 1);
  const out = runGuide(CARDS, SETS, setById, parseGuide({ page: "9" }), "US");
  assert.equal(out.page, 1);
});

test("the 30-day column needs coverage of the priced rows", () => {
  assert.equal(thirtyDayCoverage(CARDS, "US"), 3 / 4);
  const r = runGuide(CARDS, SETS, setById, parseGuide({}), "US");
  assert.equal(r.show30d, true);
  const thin = CARDS.map((x) => ({ ...x, change30d: null }));
  assert.equal(runGuide(thin, SETS, setById, parseGuide({}), "US").show30d, false);
});

test("stats: priced, median over listings, dearest only among TCGplayer-valued cards", () => {
  const s = guideStats(CARDS, "US");
  assert.equal(s.listed, 5);
  assert.equal(s.priced, 4);
  assert.equal(s.medianCents, 300);
  assert.equal(s.dearest?.id, 4);
  assert.equal(s.underOneShare, 0.25);
  assert.equal(guideStats([], "US").medianCents, null);
});

test("robots: the plain guide and a single-set guide are indexable, everything else noindex,follow", () => {
  assert.equal(guideRobots(parseGuide({})).index, true);
  assert.equal(guideRobots(parseGuide({ set: "op01" })).index, true);
  assert.equal(guideRobots(parseGuide({ set: "op01,op02" })).index, false);
  assert.equal(guideRobots(parseGuide({ q: "luffy" })).index, false);
  assert.equal(guideRobots(parseGuide({ sort: "name" })).index, false);
  assert.equal(guideRobots(parseGuide({ page: "2" })).index, false);
  assert.equal(guideRobots(parseGuide({ market: "AU" })).follow, true);
});

test("guideHref resets the page and keeps the rest", () => {
  assert.equal(guideHref({ set: "op01", page: "3" }, { sort: "name" }), "/price-guide?set=op01&sort=name");
  assert.equal(guideHref({ set: "op01" }, { set: null }), "/price-guide");
});
