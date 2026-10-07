import { test } from "node:test";
import assert from "node:assert/strict";
import { visitorHistory } from "../src/lib/price-history-view";
import type { HistoryPoint } from "../src/lib/data";

const H: HistoryPoint[] = [
  { day: "2026-10-01", marketUsd: 1000, lowUsd: 900 }, // a v1 day: no lows
  { day: "2026-10-02", marketUsd: 1000, lowUsd: 900, lows: [900, 1500, 700, null, 1300, 850] },
  { day: "2026-10-03", marketUsd: 1100, lowUsd: 950, lows: [950, null, 720, null, 1250, 860] },
];

test("US reads the v1 low too; other markets start at the first v2 day", () => {
  const us = visitorHistory(H, "US");
  assert.deepEqual(us.low.points.map((p) => p.y), [900, 900, 950]);
  assert.equal(us.title, "Price history (USD · lowest price)");
  const au = visitorHistory(H, "AU");
  assert.deepEqual(au.low.points.map((p) => p.y), [null, 1500, null]);
  assert.equal(au.title, "Price history (AUD · lowest price)");
  assert.equal(au.lowDays, 1);
  assert.equal(au.lowSince, "2026-10-02");
});

test("the market line is converted into the visitor's currency", () => {
  const au = visitorHistory(H, "AU");
  assert.ok((au.market.points[0].y ?? 0) > 1000);
  assert.equal(visitorHistory(H, "US").market.points[0].y, 1000);
});

test("no history gives empty series", () => {
  const v = visitorHistory([], "UK");
  assert.equal(v.low.points.length, 0);
  assert.equal(v.lowSince, null);
});
