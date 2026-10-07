import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, indexConstituents, indexSentence } from "../src/lib/market-stats";

const pts = (vs: number[]) => vs.map((value, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, value }));

test("basket value, average and median over priced constituents", () => {
  const s = computeStats(pts([1000, 1010]), [{ priceCents: 100, d7pct: 5 }, { priceCents: 300, d7pct: -2 }, { priceCents: 200, d7pct: 0 }, { priceCents: 0, d7pct: null }]);
  assert.equal(s.basketValueCents, 600);
  assert.equal(s.avgPriceCents, 200);
  assert.equal(s.medianPriceCents, 200);
  assert.equal(s.constituentCount, 4);
  const even = computeStats([], [{ priceCents: 100, d7pct: null }, { priceCents: 301, d7pct: null }]);
  assert.equal(even.medianPriceCents, 201);
});

test("range, breadth and volatility", () => {
  const s = computeStats(pts([1000, 1020, 990, 1010, 1030, 1000, 1040]), [{ priceCents: 1, d7pct: 3 }, { priceCents: 1, d7pct: -3 }, { priceCents: 1, d7pct: null }, { priceCents: 1, d7pct: 0 }]);
  assert.equal(s.high, 1040);
  assert.equal(s.low, 990);
  assert.equal(s.advancing, 1);
  assert.equal(s.declining, 1);
  assert.equal(s.unchanged, 2);
  assert.ok(s.volatilityPct != null && s.volatilityPct > 0);
  assert.equal(computeStats(pts([1000, 1001, 1002]), []).volatilityPct, null); // fewer than 5 moves
});

test("an empty market is zeros, never NaN", () => {
  const s = computeStats([], []);
  assert.deepEqual([s.basketValueCents, s.avgPriceCents, s.medianPriceCents, s.high, s.low], [0, 0, 0, 0, 0]);
});

test("constituents: US$1+ only, dearest first, weights against the whole basket, capped", () => {
  const card = (id: number, usd: number | null, d7: number | null = null) => ({ id, slug: `c${id}`, name: `C${id}`, variant: null, number: null, setId: 1, marketUsd: usd, change7d: d7, hasImage: true });
  const r = indexConstituents([card(1, 50), card(2, 900, 4), card(3, 100), card(4, null), card(5, 100)], () => "OP01", 3);
  assert.deepEqual(r.rows.map((x) => x.id), [2, 3, 5]);
  assert.equal(r.basketCount, 3);
  assert.equal(r.basketCents, 1100);
  assert.equal(r.rows[0].weightPct, 81.8);
  assert.equal(r.rows[0].d7pct, 4);
});

test("the quotable sentence says only what it has", () => {
  assert.equal(indexSentence({ day: "4 October 2026", value: 1042.37, d7: 2.5, advancing: 120, counted: 300 }), "As of 4 October 2026 the OP Compare Index sits at 1042.4, up 2.5% over 7 days, with 120 of 300 cards higher.");
  assert.equal(indexSentence({ day: "x", value: 1000, d7: null, advancing: 0, counted: 0 }), "As of x the OP Compare Index sits at 1000.0.");
});
