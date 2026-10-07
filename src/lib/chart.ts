// Pure helpers for the interactive price chart (components/LineChart.tsx) and
// the sparklines — no React, so tests/chart.test.ts can pin them.

export interface ChartRange {
  key: string;
  label: string;
  /** Index into the chart's day axis where this range starts. */
  start: number;
  lo: number;
  hi: number;
}

export const RANGE_DAYS: { key: string; label: string; days: number }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
];

const DAY = 86_400_000;
const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** y-axis bounds with 8% headroom, never below zero; a flat line gets ±10%. */
export function yBounds(values: number[]): { lo: number; hi: number } | null {
  if (!values.length) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo = lo * 0.9;
    hi = hi * 1.1 || 1;
  }
  const span = hi - lo;
  return { lo: Math.max(0, lo - span * 0.08), hi: hi + span * 0.08 };
}

/**
 * The range tabs worth offering for a day axis (sorted ISO days): a range is
 * offered only when the history is LONGER than it (otherwise it would draw the
 * same picture as "All") and it still holds two points. "All" is always last.
 */
export function chartRanges(xs: string[], ys: (number | null)[][]): ChartRange[] {
  const out: ChartRange[] = [];
  if (xs.length < 2) return out;
  const last = dayMs(xs[xs.length - 1]);
  const spanDays = (last - dayMs(xs[0])) / DAY;
  const boundsFrom = (start: number) => yBounds(ys.flatMap((s) => s.slice(start)).filter((v): v is number => v != null));
  for (const r of RANGE_DAYS) {
    if (spanDays <= r.days) continue;
    const cutoff = last - r.days * DAY;
    const start = xs.findIndex((x) => dayMs(x) >= cutoff);
    if (start < 0 || xs.length - start < 2) continue;
    const b = boundsFrom(start);
    if (b) out.push({ key: r.key, label: r.label, start, ...b });
  }
  const all = boundsFrom(0);
  if (all) out.push({ key: "all", label: "All", start: 0, ...all });
  return out;
}

/** Five evenly spaced tick values from lo to hi. */
export function ticks(lo: number, hi: number, n = 5): number[] {
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

/** The point index under a pointer at `ratio` (0–1 across the plot) of `n` points. */
export function nearestIndex(ratio: number, n: number): number {
  if (n <= 1) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * (n - 1));
}

/** First and last non-null values of a series, and the % change between them. */
export function seriesChange(ys: (number | null)[]): { first: number; last: number; pct: number | null } | null {
  const vals = ys.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const first = vals[0];
  const last = vals[vals.length - 1];
  return { first, last, pct: first > 0 ? ((last - first) / first) * 100 : null };
}

/** An SVG polyline/path "d" for a series, breaking the line at nulls. */
export function linePath(ys: (number | null)[], X: (i: number) => number, Y: (v: number) => number): string {
  let d = "";
  let pen = false;
  ys.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}
