// The /market statistics: the published basket (mk/overview.json) turned into the figures the page draws, the index range and volatility from its series, and the constituents table. Owner WP07.
// The basket and the constituents below are the real top of the 2026-10-07 TCGplayer prices (tests/fixtures/magic-products.json holds the products; the amounts are in USD cents).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, indexConstituents, indexSentence, type CardForIndex } from "../src/lib/market-stats";

const pts = (vs: number[]) => vs.map((value, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, value }));
const basket = { n: 34_954, totalCents: 83_573_391, avgCents: 2_391, medianCents: 479, advancing: 120, declining: 80 };

test("the published basket: value, average and median card, count, breadth", () => {
  const s = computeStats(pts([1000, 1010]), basket);
  assert.equal(s.basketValueCents, 83_573_391);
  assert.equal(s.avgPriceCents, 2_391);
  assert.equal(s.medianPriceCents, 479);
  assert.equal(s.constituentCount, 34_954);
  assert.deepEqual([s.advancing, s.declining, s.unchanged], [120, 80, 34_754]);
});

test("range, breadth and volatility", () => {
  const s = computeStats(pts([1000, 1020, 990, 1010, 1030, 1000, 1040]), { ...basket, advancing: 1, declining: 1, n: 4 });
  assert.equal(s.high, 1040);
  assert.equal(s.low, 990);
  assert.deepEqual([s.advancing, s.declining, s.unchanged], [1, 1, 2]);
  assert.ok(s.volatilityPct != null && s.volatilityPct > 0);
  assert.equal(computeStats(pts([1000, 1001, 1002]), basket).volatilityPct, null); // fewer than 5 moves
});

test("an empty market is zeros, never NaN", () => {
  const s = computeStats([], { n: 0, totalCents: 0, avgCents: 0, medianCents: 0, advancing: 0, declining: 0 });
  assert.deepEqual([s.basketValueCents, s.avgPriceCents, s.medianPriceCents, s.high, s.low, s.unchanged], [0, 0, 0, 0, 0, 0]);
});

// the dearest of the real basket (mk/overview.json of 2026-10-07): Timetwister, Time Walk and Ancestral Recall (2ED), then two 7th Edition cards of the fixtures
const published = [
  { id: 9232, slug: "timetwister-2ed", name: "Timetwister", cents: 640_000 },
  { id: 9231, slug: "time-walk-2ed", name: "Time Walk", cents: 571_999 },
  { id: 8973, slug: "ancestral-recall-2ed", name: "Ancestral Recall", cents: 499_995 },
  { id: 2831, slug: "birds-of-paradise-7ed-231", name: "Birds of Paradise", cents: 2_289 },
  { id: 3077, slug: "shivan-dragon-7ed-218", name: "Shivan Dragon", cents: 91 },
  { id: 999_999, slug: "no-longer-listed", name: "No Longer Listed", cents: 100 },
];
const cards = new Map<number, CardForIndex>([
  [9232, { id: 9232, variant: null, number: null, setCode: "2ED", change7d: 4, hasImage: true, imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/9232_200w.jpg" }],
  [2831, { id: 2831, variant: null, number: "231", setCode: "7ED", change7d: -1.5, hasImage: true, imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/2831_200w.jpg" }],
]);

test("constituents: US$1+ only, dearest first, weights against the whole basket, capped; a card the plane cannot find keeps its name and price", () => {
  const rows = indexConstituents(published, cards, basket.totalCents, 4);
  assert.deepEqual(rows.map((r) => r.id), [9232, 9231, 8973, 2831], "Shivan Dragon at 91 cents is under US$1: not in the basket");
  assert.equal(rows[0]!.weightPct, 0.8, "Timetwister: 640,000 of 83,573,391 cents");
  assert.deepEqual([rows[0]!.setCode, rows[0]!.number, rows[0]!.d7pct], ["2ED", null, 4]);
  assert.deepEqual([rows[1]!.setCode, rows[1]!.d7pct, rows[1]!.hasImage, rows[1]!.imageUrl], ["", null, false, null]);
  assert.equal(rows[3]!.d7pct, -1.5);
  assert.equal(indexConstituents(published, cards, 0).length, 5, "every row at US$1 or more, whatever the cap");
  assert.equal(indexConstituents(published, cards, 0)[0]!.weightPct, 0, "no basket value: no weight, never NaN");
  assert.equal(indexConstituents(published, cards, basket.totalCents).find((r) => r.id === 999_999)!.name, "No Longer Listed");
});

test("the quotable sentence says only what it has", () => {
  assert.equal(indexSentence({ day: "4 October 2026", value: 1042.37, d7: 2.5, advancing: 120, counted: 300 }), "As of 4 October 2026 the MTG Compare Index sits at 1042.4, up 2.5% over 7 days, with 120 of 300 cards higher.");
  assert.equal(indexSentence({ day: "x", value: 1000, d7: null, advancing: 0, counted: 0 }), "As of x the MTG Compare Index sits at 1000.0.");
  assert.equal(indexSentence({ day: "x", value: 990, d7: -0.4, advancing: 3, counted: 10 }), "As of x the MTG Compare Index sits at 990.0, down 0.4% over 7 days, with 3 of 10 cards higher.");
});
