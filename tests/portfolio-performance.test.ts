import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { indexChange, METHODOLOGY_BREAKS, portfolioPerformance, priceMapFromPoints, scaleSeries, type PerfHolding } from "../src/lib/portfolio-performance";
import { recentOf, RECENT_DAYS } from "../src/lib/history-store";
import type { BucketFile, Point } from "../src/lib/history";

// RiftCompare's tests/portfolio-performance.test.ts, ported in wave 2
// (2026-10-03) with numeric card ids (A=1, B=2, C=3). RiftCompare's own
// 2026-09-23 methodology break is supplied inline where a test needs one: OP
// Compare has none (METHODOLOGY_BREAKS is empty).
const RC_BREAK = [{ from: Date.parse("2026-09-23T00:00:00Z"), to: Date.parse("2026-10-01T00:00:00Z") }];

// ─────────────────────────────────────────────────────────────────────────────
// /portfolio's 7- and 30-day moves and its value chart (2026-09-25).
//
// The old code compared two raw sums of "every holding priced on that day". A
// card priced for the FIRST time inside the window joined only the later sum, so
// its whole value read as growth: Radiance prices from its 23 Oct release, and
// every Radiance card in a binder would have shown as a gain. It also had a
// "1 day" chip that was the weekly step relabelled, and it charted the 23 Sep
// TCGplayer re-basing as a crash. These run the maths on synthetic series.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400_000;
const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const series = (points: Record<string, number>) => new Map(Object.entries(points).map(([k, v]) => [d(k), v]));
const nm = (cardId: number, quantity = 1): PerfHolding => ({ cardId, quantity, multiplier: 1 });

test("d7 compares only holdings priced at both ends: a newly priced card is never a gain", () => {
  // A is flat at $10. B (a Radiance card, say) gets its first price in the
  // latest snapshot, at $50. Raw sums would say $10 → $60, +500%.
  const byCard = new Map([
    [1, series({ "2026-11-06": 1000, "2026-11-13": 1000 })],
    [2, series({ "2026-11-13": 5000 })],
  ]);
  const perf = portfolioPerformance([nm(1), nm(2)], byCard);
  assert.equal(perf.change(7), 0, "B was not priced a week ago, so it sits the week out");
  // The chart's latest point is still the real total, B included…
  assert.equal(perf.series.at(-1)!.v, 6000);
  // …and the line does not jump on B's debut.
  assert.equal(perf.series[0].v, 6000);
});

test("d7 is the ratio over the holdings priced at both window endpoints, weighted by quantity and condition", () => {
  const byCard = new Map([
    [1, series({ "2026-11-06": 1000, "2026-11-13": 1100 })], // +10%
    [2, series({ "2026-11-06": 2000, "2026-11-13": 1800 })], // −10%
    [3, series({ "2026-11-13": 9999 })], // new: excluded
  ]);
  // 3 × A (NM) and 1 × B at LP (0.85): start 3000 + 1700 = 4700, end 3300 + 1530 = 4830.
  const holdings: PerfHolding[] = [nm(1, 3), { cardId: 2, quantity: 1, multiplier: 0.85 }, nm(3)];
  const perf = portfolioPerformance(holdings, byCard);
  assert.equal(perf.change(7), Math.round(((4830 - 4700) / 4700) * 1000) / 10);
});

test("d30 never counts a debut, but a card you hold still counts from its second price", () => {
  // A flat throughout. B debuts on 10-23 at $20 and falls to $10 by 11-13 —
  // a real loss on a card this binder holds. Old raw sums: +200% (debut). An
  // "A only" window would hide B's real fall; chaining week by week shows it.
  const byCard = new Map([
    [1, series({ "2026-10-09": 1000, "2026-10-16": 1000, "2026-10-23": 1000, "2026-10-30": 1000, "2026-11-06": 1000, "2026-11-13": 1000 })],
    [2, series({ "2026-10-23": 2000, "2026-10-30": 1500, "2026-11-06": 1000, "2026-11-13": 1000 })],
  ]);
  const perf = portfolioPerformance([nm(1), nm(2)], byCard);
  const d30 = perf.change(30)!;
  assert.ok(d30 < 0, `B's fall after its first price is real, got ${d30}`);
  // (1000+1500)/(1000+2000) × (1000+1000)/(1000+1500) = 2000/3000 → −33.3%
  assert.equal(d30, -33.3);
  // The debut week (10-16 → 10-23) is flat on the chart.
  const at = (iso: string) => perf.series.find((p) => p.t === d(iso))!.v;
  assert.equal(at("2026-10-16"), at("2026-10-23"));
});

test("a step ending inside a methodology break is held flat, as on the Index", () => {
  // The 2026-09-23 re-basing: every card's recorded low drops ~25% at once.
  const byCard = new Map([
    [1, series({ "2026-09-02": 1000, "2026-09-09": 1000, "2026-09-16": 1000, "2026-09-23": 750, "2026-10-07": 780 })],
  ]);
  const perf = portfolioPerformance([nm(1)], byCard, RC_BREAK);
  // 09-16 → 09-23 ends in the break: no −25% on the chart…
  const at = (iso: string) => perf.series.find((p) => p.t === d(iso))!.v;
  assert.equal(at("2026-09-16"), at("2026-09-23"));
  // …and d30 is only the measured move after it (750 → 780 = +4%).
  assert.equal(perf.change(30), 4);
  // Without the break the same data is a crash.
  assert.equal(portfolioPerformance([nm(1)], byCard).change(30), -22);
});

test("a window made only of break steps has no move: null, not 0%", () => {
  const byCard = new Map([[1, series({ "2026-09-16": 1000, "2026-09-23": 750 })]]);
  const perf = portfolioPerformance([nm(1)], byCard, RC_BREAK);
  assert.equal(perf.change(7), null, "the chip hides rather than claiming 'unchanged'");
});

test("no snapshot a full window back means no figure, and one snapshot charts nothing to compare", () => {
  const byCard = new Map([[1, series({ "2026-11-10": 1000, "2026-11-13": 1200 })]]);
  const perf = portfolioPerformance([nm(1)], byCard);
  assert.equal(perf.change(7), null, "3 days of history is not a 7-day move");
  assert.equal(portfolioPerformance([nm(1)], new Map([[1, series({ "2026-11-13": 1000 })]])).change(7), null);
  assert.deepEqual(portfolioPerformance([], new Map()).series, []);
});

test("a steady binder charts exactly its raw value — nothing changes when nothing debuts", () => {
  const byCard = new Map([
    [1, series({ "2026-10-30": 1000, "2026-11-06": 1200, "2026-11-13": 900 })],
    [2, series({ "2026-10-30": 500, "2026-11-06": 500, "2026-11-13": 600 })],
  ]);
  const perf = portfolioPerformance([nm(1, 2), nm(2)], byCard);
  assert.deepEqual(
    perf.series.map((p) => p.v),
    [2500, 2900, 2400],
  );
  assert.equal(perf.change(7), Math.round(((2400 - 2900) / 2900) * 1000) / 10);
  assert.equal(perf.series[0].t + 14 * DAY, perf.series[2].t);
});

const codeOnly = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("OP Compare has no methodology break", () => {
  assert.deepEqual([...METHODOLOGY_BREAKS], []);
});

test("/portfolio has no '1 day' chip, says the history is daily, and the series applies the breaks", () => {
  const page = codeOnly("src/app/portfolio/page.tsx");
  assert.doesNotMatch(page, /label="1 day"/, "no 1-day chip");
  assert.match(page, /after the next daily snapshot/);
  assert.match(page, /daily since 2026-10-03/);
  assert.match(page, /TCGplayer market prices \(US\)/, "the chart says where its movement comes from");
  assert.doesNotMatch(page, /Daily history|unlimited price alerts/);
  const lib = codeOnly("src/lib/collection-server.ts");
  assert.doesNotMatch(lib, /\bd1:/, "Portfolio carries no d1");
  assert.match(lib, /portfolioPerformance\([\s\S]*?METHODOLOGY_BREAKS,?\s*\)/, "the series applies the methodology breaks");
  assert.match(lib, /scaleSeries\(perf\.series, totalCents\)/, "the US ratios are anchored at today's local total");
});

// ── The history read (OP Compare) ───────────────────────────────────────────

test("a card's series is its market price, or its cheapest US listing when it has none — never a mix", () => {
  const pts: Point[] = [[20261001, 1000, 900], [20261002, null, 800], [20261003, 1200, 1100]];
  const m = priceMapFromPoints(pts);
  assert.deepEqual([...m.values()], [1000, 1200], "a day without a market price is skipped, not filled from the low");
  const lowOnly = priceMapFromPoints([[20261001, null, 500], [20261002, null, 550]]);
  assert.deepEqual([...lowOnly.values()], [500, 550]);
  assert.equal([...m.keys()][0], Date.parse("2026-10-01T00:00:00Z"), "days are UTC midnights in ms");
  assert.equal(priceMapFromPoints(undefined).size, 0);
});

test("the ratio series is anchored at today's real total in the visitor's currency", () => {
  const s = scaleSeries([{ t: 1, v: 1000 }, { t: 2, v: 1100 }, { t: 3, v: 1250 }], 5000);
  assert.deepEqual(s.map((p) => p.v), [4000, 4400, 5000]);
  assert.deepEqual(scaleSeries([], 5000), []);
  assert.deepEqual(scaleSeries([{ t: 1, v: 1000 }], 0), [], "an unpriced binder charts nothing");
});

test("the Index benchmark reads today against the latest row a full window back", () => {
  const rows = [
    { day: "2026-10-01", value: 1000 },
    { day: "2026-10-03", value: 1010 },
    { day: "2026-10-08", value: 1050 },
    { day: "2026-10-10", value: 1100 },
  ];
  assert.equal(indexChange(rows, 7), 8.9, "1100 against 2026-10-03's 1010");
  assert.equal(indexChange(rows, 30), null, "no row 30 days back");
  assert.equal(indexChange([], 7), null);
});

test("the recent history file keeps the last 120 days of every series and drops empty ones", () => {
  const file: BucketFile = {
    v: 1,
    p: {
      "1": [[20260101, 100, 90], [20260901, 200, 190], [20261003, 210, 200]],
      "2": [[20250101, 50, 40]],
    },
  };
  const r = recentOf(file, 20261003);
  assert.equal(RECENT_DAYS, 120);
  assert.deepEqual(r.p["1"], [[20260901, 200, 190], [20261003, 210, 200]]);
  assert.equal(r.p["2"], undefined, "a card with nothing recent has no entry");
  assert.deepEqual(recentOf(file, 20261003, 400).p["2"], undefined);
});

test("the import writes the recent file beside the bucket on every run", () => {
  const imp = codeOnly("src/lib/import.ts");
  assert.match(imp, /writeBucket\(b, file\);\s*writeRecentBucket\(b, recentOf\(file, dn\)\)/);
  const data = codeOnly("src/lib/data.ts");
  assert.match(data, /historyFile<BucketFile>\(`recent\/\$\{b\}\.json`\)\) \?\? \(await historyFile<BucketFile>\(`products\/\$\{b\}\.json`\)\)/, "falls back to the full bucket before the first recent file");
});
