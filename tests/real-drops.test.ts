// The Black Friday pages' "furthest under their own 30-day price" rules (lib/real-drops.ts): enough history, wrong-listing days
// left out, no claim on a history that swings, a placeholder price never counts, and the copy never says "was" or "dropped".
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropLine, isPlaceholderPrice, rankDrops, realDrop, type PricedDay } from "../src/lib/real-drops";

const TODAY = "2026-11-20";
const days = (cents: (number | null)[], end = "2026-11-19"): PricedDay[] => {
  const e = Date.parse(`${end}T00:00:00Z`);
  return cents.map((c, i) => ({ day: new Date(e - (cents.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), cents: c }));
};

test("a real fall under the product's own 30-day median is claimed", () => {
  const d = realDrop(days(Array(20).fill(10000)), 8500, TODAY)!;
  assert.deepEqual([d.typicalCents, d.pct, d.lowest], [10000, 15, true]);
});

test("too little history, a small fall or a tiny product: no claim", () => {
  assert.equal(realDrop(days(Array(13).fill(10000)), 5000 + 3000, TODAY), null);
  assert.equal(realDrop(days(Array(20).fill(10000)), 9200, TODAY), null);
  assert.equal(realDrop(days(Array(20).fill(1500)), 1000, TODAY), null);
});

test("wrong-listing days are left out, and a history that swings more than 2x says nothing", () => {
  // two days of a pack read as the box: ignored, the median stays the box's
  const d = realDrop(days([...Array(18).fill(20000), 3000, 3000]), 17000, TODAY)!;
  assert.equal(d.typicalCents, 20000);
  // weeks of a wrong product's price: no claim
  assert.equal(realDrop(days([...Array(10).fill(6000), ...Array(10).fill(14000)]), 9000, TODAY), null);
});

test("today's own day is not part of the window, and placeholder prices never count", () => {
  assert.equal(realDrop(days([...Array(19).fill(10000), 5000], TODAY), 8000, TODAY)!.typicalCents, 10000);
  assert.ok(isPlaceholderPrice(999999) && isPlaceholderPrice(999900) && !isPlaceholderPrice(9995));
  assert.equal(realDrop(days(Array(20).fill(999999)), 554499, TODAY), null);
});

test("biggest fall first; the copy has no banned history words", () => {
  const a = { name: "a", drop: realDrop(days(Array(20).fill(10000)), 8000, TODAY)! };
  const b = { name: "b", drop: realDrop(days(Array(20).fill(10000)), 7000, TODAY)! };
  assert.deepEqual(rankDrops([a, b], 5).map((x) => x.name), ["b", "a"]);
  const line = dropLine(b.drop, (c) => `$${(c / 100).toFixed(2)}`);
  assert.equal(line, "30% under its 30-day typical $100.00 · lowest since 31 Oct");
  assert.doesNotMatch(line, /\bwas\b|dropped|ever\b|price drop/i);
});
