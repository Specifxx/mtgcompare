import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hotChart, hotMove, hotName } from "../src/lib/hot100";
import type { PriceHistory } from "../src/lib/price-history";

// The weekly Hot 100 (owner, 2026-11-18): real risers only, two or more stores on both days, last week's place from the same history.
const D = 20_400;
const h = (series: Record<string, [number, number | null, number][]>): PriceHistory => ({ v: 1, since: D - 30, through: D, series: { US: series } });

test("ranks real risers only, biggest first, and keeps the honest count", () => {
  const c = hotChart(
    h({
      flat: [[D - 30, 1000, 3]],
      up10: [[D - 30, 1000, 3], [D - 1, 1100, 3]],
      up30: [[D - 30, 1000, 3], [D, 1300, 2]],
      oneStore: [[D - 30, 1000, 1], [D, 1300, 1]],
      misfiled: [[D - 30, 1000, 3], [D, 2000, 3]],
      down: [[D - 30, 1000, 3], [D, 900, 3]],
      tiny: [[D - 30, 10000, 3], [D, 10050, 3]],
      soldOut: [[D - 30, 1000, 3], [D, null, 0]],
    }),
    "US",
  )!;
  assert.deepEqual(c.rows.map((r) => r.slug), ["up30", "up10"]);
  assert.equal(c.rows[0].pct, 30);
  assert.equal(hotName(c.rows.length), "Hot 2");
});

test("last week's place is worked out the same way seven days earlier", () => {
  const c = hotChart(
    h({
      a: [[D - 20, 1000, 3], [D - 8, 1300, 3], [D, 1400, 3]],
      b: [[D - 20, 1000, 3], [D - 9, 1100, 3], [D, 1600, 3]],
      c: [[D - 20, 1000, 3], [D - 1, 1050, 3]],
    }),
    "US",
  )!;
  assert.deepEqual(c.rows.map((r) => [r.slug, r.lastRank]), [["b", 2], ["a", 1], ["c", null]]);
  assert.equal(hotMove(c.rows[0], c.lastWeekSize), "▲1");
  assert.equal(hotMove(c.rows[1], c.lastWeekSize), "▼1");
  assert.equal(hotMove(c.rows[2], c.lastWeekSize), "New");
  assert.equal(c.through, new Date(D * 86_400_000).toISOString().slice(0, 10));
});

test("no week of history, no chart; caps at 100", () => {
  assert.equal(hotChart({ v: 1, since: D - 3, through: D, series: {} }, "US"), null);
  const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`p${i}`, [[D - 10, 1000, 3], [D, 1020 + i, 3]] as [number, number, number][]]));
  assert.equal(hotChart(h(many), "US")!.rows.length, 100);
});

test("the page and its share card read the same chart and fetch nothing", () => {
  for (const f of ["src/app/[region]/hot-100/page.tsx", "src/app/og/hot-100/[region]/route.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /hotChart\(readPriceHistory\(\)/);
    assert.doesNotMatch(src, /fetch\(/);
  }
});
