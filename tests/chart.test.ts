import { test } from "node:test";
import assert from "node:assert/strict";
import { chartRanges, linePath, nearestIndex, seriesChange, ticks, yBounds } from "../src/lib/chart";

const days = (n: number, from = "2026-01-01") => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test("y bounds: headroom, floor at zero, flat line widened", () => {
  assert.equal(yBounds([]), null);
  const b = yBounds([100, 200])!;
  assert.ok(b.lo < 100 && b.hi > 200);
  assert.equal(yBounds([1, 1000])!.lo, 0);
  const flat = yBounds([500, 500])!;
  assert.ok(flat.lo < 500 && flat.hi > 500);
});

test("range tabs only when the history is longer than the range", () => {
  const xs = days(10);
  const ys = [xs.map((_, i) => 100 + i)];
  assert.deepEqual(chartRanges(xs, ys).map((r) => r.label), ["7D", "All"]);
  const long = days(200);
  const r = chartRanges(long, [long.map((_, i) => i + 1)]);
  assert.deepEqual(r.map((x) => x.label), ["7D", "30D", "90D", "All"]);
  const r7 = r[0];
  assert.equal(long.length - r7.start, 8); // today and the seven days before it
  assert.equal(r[r.length - 1].start, 0);
  // Each range's axis fits its own points.
  assert.ok(r7.lo > 150);
  assert.deepEqual(chartRanges(days(1), [[5]]), []);
  assert.deepEqual(chartRanges(days(5), [[null, null, null, null, null]]), []);
});

test("ticks, pointer index and change", () => {
  assert.deepEqual(ticks(0, 100), [0, 25, 50, 75, 100]);
  assert.equal(nearestIndex(0, 10), 0);
  assert.equal(nearestIndex(1, 10), 9);
  assert.equal(nearestIndex(-3, 10), 0);
  assert.equal(nearestIndex(0.5, 3), 1);
  assert.equal(nearestIndex(0.4, 1), 0);
  assert.deepEqual(seriesChange([null, 100, null, 150]), { first: 100, last: 150, pct: 50 });
  assert.equal(seriesChange([null, 100]), null);
});

test("line path breaks at gaps", () => {
  const d = linePath([1, 2, null, 4], (i) => i * 10, (v) => v);
  assert.equal(d, "M0.0,1.0L10.0,2.0M30.0,4.0");
});
