// Daily price history (lib/price-history.ts, components/PriceHistoryChart.tsx, scripts/export-public-data.ts): change-points that
// fold in one day at a time, the window, the typical price, and a chart only from MIN_DAYS of real snapshots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { dailySeries, dayOf, daysOfHistory, isPriceHistory, KEEP_DAYS, MIN_DAYS, readPriceHistory, typicalPrice, underOwnTypical, updatePriceHistory, type PriceHistory } from "../src/lib/price-history";
import { PriceHistoryChart } from "../src/components/PriceHistoryChart";

(globalThis as unknown as { React: typeof React }).React = React;

const D0 = dayOf("2026-10-15");
const fold = (days: [number, number | null, number][], slug = "x-etb", market = "AU"): PriceHistory => {
  let h: PriceHistory | null = null;
  for (const [i, cents, stores] of days) h = updatePriceHistory(h, [{ market, slug, cents, stores }], D0 + i);
  return h!;
};

test("change-points: a point only when the price or the store count changes; a second import the same day replaces the first", () => {
  const h = fold([
    [0, 5999, 4],
    [1, 5999, 4],
    [2, 5499, 5],
    [2, 5299, 5],
    [3, 5299, 5],
  ]);
  assert.deepEqual(h.series.AU["x-etb"], [
    [D0, 5999, 4],
    [D0 + 2, 5299, 5],
  ]);
  assert.equal(h.since, D0);
  assert.equal(h.through, D0 + 3);
  // a same-day import back to the previous value removes the day's point
  const back = updatePriceHistory(fold([[0, 5999, 4], [1, 5499, 4]]), [{ market: "AU", slug: "x-etb", cents: 5999, stores: 4 }], D0 + 1);
  assert.deepEqual(back.series.AU["x-etb"], [[D0, 5999, 4]]);
});

test("a product that leaves the market gets [day, null, 0]; nothing in stock is null, never a price", () => {
  let h = fold([[0, 5999, 4]]);
  h = updatePriceHistory(h, [], D0 + 1);
  assert.deepEqual(h.series.AU["x-etb"].at(-1), [D0 + 1, null, 0]);
  h = updatePriceHistory(h, [{ market: "AU", slug: "x-etb", cents: null, stores: 0 }], D0 + 2);
  assert.equal(h.series.AU["x-etb"].length, 2, "still nothing in stock: no new point");
});

test("the window keeps KEEP_DAYS and the opening value before it", () => {
  let h = fold([[0, 5000, 3], [10, 6000, 3]]);
  h = updatePriceHistory(h, [{ market: "AU", slug: "x-etb", cents: 6000, stores: 3 }], D0 + 10 + KEEP_DAYS + 5);
  assert.deepEqual(h.series.AU["x-etb"], [[D0 + 10, 6000, 3]]);
});

test("daily series, days of history and the typical (median) price; nothing under MIN_DAYS", () => {
  const h = fold([[0, 6000, 3], [3, 5000, 3], [6, 5500, 2]]);
  const s = dailySeries(h, "AU", "x-etb");
  assert.deepEqual(s.map((d) => d.cents), [6000, 6000, 6000, 5000, 5000, 5000, 5500]);
  assert.equal(daysOfHistory(h, "AU", "x-etb"), 7);
  assert.equal(typicalPrice(h, "AU", "x-etb"), 5500);
  assert.equal(typicalPrice(fold([[0, 6000, 3], [5, 5000, 3]]), "AU", "x-etb"), null, "six days: no typical price");
});

test("under its own typical price: at least 10% under, latest in stock, never under half (a misfiled listing)", () => {
  const h = fold(Array.from({ length: 10 }, (_, i) => [i, i < 9 ? 10000 : 8500, 4] as [number, number, number]));
  assert.deepEqual(underOwnTypical(h, "AU"), [{ slug: "x-etb", cents: 8500, typical: 10000, pct: 15 }]);
  const half = fold(Array.from({ length: 10 }, (_, i) => [i, i < 9 ? 10000 : 4000, 4] as [number, number, number]));
  assert.deepEqual(underOwnTypical(half, "AU"), []);
  const sold = fold(Array.from({ length: 10 }, (_, i) => [i, i < 9 ? 10000 : null, i < 9 ? 4 : 0] as [number, number | null, number]));
  assert.deepEqual(underOwnTypical(sold, "AU"), []);
});

test("the chart: nothing under MIN_DAYS; from MIN_DAYS a step line, lowest/highest in this period, no banned words", () => {
  const short = dailySeries(fold([[0, 6000, 3], [4, 5000, 3]]), "AU", "x-etb");
  assert.ok(short.length < MIN_DAYS);
  assert.equal(renderToStaticMarkup(React.createElement(PriceHistoryChart, { values: short, market: "AU" })), "");
  const week = dailySeries(fold([[0, 6000, 3], [3, null, 0], [5, 5500, 2], [8, 5800, 2]]), "AU", "x-etb");
  const html = renderToStaticMarkup(React.createElement(PriceHistoryChart, { values: week, market: "AU" }));
  assert.match(html, /data-price-history=""/);
  assert.match(html, /<path d="M/);
  assert.match(html, /Lowest in this period/);
  assert.match(html, /A\$55\.00/);
  assert.match(html, /2 days with nothing in stock are gaps/);
  assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null);
});

test("the published file, once the imports have written it: readable, every market; each export folds in its day", () => {
  // data/public belongs to the workflows (CLAUDE.md): the first export after this change writes the file, so it may not exist yet.
  const h = readPriceHistory();
  if (h) {
    assert.ok(isPriceHistory(h), "data/public/price-history.json");
    assert.ok(Object.keys(h.series).length >= 7, "every market");
  }
  const src = readFileSync("scripts/export-public-data.ts", "utf8");
  assert.match(src, /updatePriceHistory\(prevHistory, todayRows, dayOf\(new Date\(\)\)\)/, "each export folds in its day");
});
