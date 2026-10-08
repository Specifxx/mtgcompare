// Portfolio performance: the pure maths behind /portfolio's value chart and its
// 7- and 30-day moves. No Prisma and no React, so
// tests/portfolio-performance.test.ts runs it on synthetic series.
//
// ── WHY THE MOVES ARE LIKE-FOR-LIKE (2026-09-25) ─────────────────────────────
// The old code summed every holding's carried-forward price per snapshot day and
// compared two of those sums. A holding only joins the sum once it has a price
// point, so a card priced for the FIRST time inside the window added its whole
// value as "growth". Radiance prices from its 23 Oct release, so every Radiance
// card in a binder would have read as a gain on d7, d30 and the "beating the
// market" line.
//
// Now every step between two snapshots compares only the holdings priced at BOTH
// of its ends (carry-forward allowed, as before), and a window's move is the
// product of its steps. While the history was written weekly (2026-08-31 →
// 2026-10-03) d7 was a single step: exactly "holdings priced at both window
// endpoints"; with daily snapshots it is several, like d30. Over several steps, a
// card first priced inside the window never contributes its debut; it joins from
// its second price, so a real move on a card you hold still counts. This is the
// market index's own method (lib/history.ts), and the
// portfolio is benchmarked against that Index on the same page, so the two are
// measured the same way.
//
// ── A METHODOLOGY BREAK IS HELD FLAT ─────────────────────────────────────────
// PriceHistory records each card's low across markets. On 2026-09-23 the US
// TCGplayer row moved from TCGplayer's market price to the cheapest English NM
// listing, about 25% lower, so the first snapshots on the new basis read as a
// market-wide drop. As on the Index, a step that ENDS inside a break window is
// flat: it is neither a gain nor a loss, and a window made only of such steps
// has no move at all (null, so the chip is hidden rather than showing 0%).
//
// ── THE CHART ────────────────────────────────────────────────────────────────
// The series is today's holdings, anchored at the latest snapshot's real total
// and walked back through those step ratios. For a binder whose cards were all
// priced for the whole window, with no break, that is exactly the old raw sum.
// What changes is that a card's first price and a break no longer put a step in
// the line. d7/d30 are read off the same ratios, so the chips and the chart
// always agree.
//
// There is no "1 day" figure: while snapshots were weekly the previous one was a
// week back, so a "1 day" chip was the 7-day number under another label. With
// daily snapshots since 2026-10-03 one would now mean what it says.
import { dayIso, type IndexRow, type Point } from "./history";

// ── The input (Magic) ────────────────────────────────────────────────────────
// A holding is a UNIT: a product in one finish (constants UnitKey "<productId>.<0|1>"),
// because a Foil copy and a Normal copy of one card have their own history. The
// series are the plane's market-price histories (getRecentHistory: day ms to US
// cents, a day without a market price is absent). The binder is valued in the
// visitor's market, so the chart uses those US prices as RATIOS only: the
// like-for-like steps below are computed on them, and the series is then anchored
// at today's real total in the visitor's currency (scaleSeries). There has been no
// methodology break, so METHODOLOGY_BREAKS is empty.

/** One value per snapshot day: `t` is the day's UTC midnight in ms, `v` cents. */
export interface PricePoint {
  t: number;
  v: number;
}

/** The published history has no methodology break. */
export const METHODOLOGY_BREAKS: readonly PerfBreak[] = [];

const dayMsOf = (n: number) => Date.parse(`${dayIso(n)}T00:00:00Z`);

/**
 * Re-anchor a ratio series (US cents) at today's real total in the visitor's
 * currency: every point keeps its ratio to the latest one, and the latest one
 * becomes `totalCents`. An empty or zero series stays empty.
 */
export function scaleSeries(series: readonly PricePoint[], totalCents: number): PricePoint[] {
  const last = series.at(-1)?.v ?? 0;
  if (!(last > 0) || !(totalCents > 0)) return [];
  return series.map((p) => ({ t: p.t, v: Math.round((p.v * totalCents) / last) }));
}

/**
 * The market index's move over `days`: today's value against the latest
 * row at least that far back. null without such a row. Rounded to 0.1%.
 */
export function indexChange(rows: readonly Pick<IndexRow, "day" | "value">[], days: number): number | null {
  const last = rows.at(-1);
  if (!last || !(last.value > 0)) return null;
  const target = Date.parse(`${last.day}T00:00:00Z`) - days * 86400_000;
  const from = [...rows].reverse().find((r) => Date.parse(`${r.day}T00:00:00Z`) <= target && r.value > 0);
  if (!from) return null;
  return Math.round(((last.value - from.value) / from.value) * 1000) / 10;
}

export interface PerfHolding {
  /** The key of the holding's series in the map: a UnitKey ("2831.1") for a binder row; a plain id in the unit tests. */
  cardId: number | string;
  quantity: number;
  /** Condition multiplier (CONDITION_MULTIPLIER), 1 for NM. */
  multiplier: number;
}

export interface PerfBreak {
  from: number;
  to: number;
}

export interface PortfolioPerformance {
  /** Value per snapshot day, today's holdings, like-for-like (see the header). */
  series: PricePoint[];
  /**
   * % move from the last snapshot at least `daysBack` days before the latest one.
   * null when there is no such snapshot, or no step in the window could be
   * measured (nothing priced at both ends, or only break steps).
   */
  change: (daysBack: number) => number | null;
}

const DAY_MS = 86400_000;

export function portfolioPerformance(
  holdings: readonly PerfHolding[],
  byCard: ReadonlyMap<number | string, ReadonlyMap<number, number>>,
  breaks: readonly PerfBreak[] = [],
): PortfolioPerformance {
  const daySet = new Set<number>();
  for (const h of holdings) for (const t of byCard.get(h.cardId)?.keys() ?? []) daySet.add(t);
  const days = [...daySet].sort((a, b) => a - b);
  const n = days.length;
  const none: PortfolioPerformance = { series: [], change: () => null };
  if (n === 0) return none;

  // Carried-forward price per holding per day; NaN = not priced yet.
  const price = holdings.map((h) => {
    const m = byCard.get(h.cardId);
    const arr = new Float64Array(n);
    let last = NaN;
    for (let k = 0; k < n; k++) {
      const p = m?.get(days[k]);
      if (p != null) last = p;
      arr[k] = last;
    }
    return arr;
  });
  // Same rounding the headline and the old series used: unit rounded, then × quantity.
  const value = (i: number, k: number) => Math.round(price[i][k] * holdings[i].multiplier) * holdings[i].quantity;

  const raw = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (let i = 0; i < holdings.length; i++) if (!Number.isNaN(price[i][k])) total += value(i, k);
    raw[k] = total;
  }
  const latest = raw[n - 1];
  if (!(latest > 0)) return none;

  const inBreak = (t: number) => breaks.some((b) => t >= b.from && t < b.to);

  // toLast[k]: the like-for-like ratio from day k to the latest day.
  // measured[k]: whether any step between them was actually measured.
  const toLast = new Float64Array(n);
  const measured = new Uint8Array(n);
  toLast[n - 1] = 1;
  for (let k = n - 1; k >= 1; k--) {
    let step: number | null = null;
    if (!inBreak(days[k])) {
      let num = 0;
      let den = 0;
      for (let i = 0; i < holdings.length; i++) {
        if (Number.isNaN(price[i][k - 1])) continue; // not priced at the step's start: sits it out
        num += value(i, k);
        den += value(i, k - 1);
      }
      if (den > 0 && num > 0) step = num / den;
    }
    toLast[k - 1] = (step ?? 1) * toLast[k];
    measured[k - 1] = step != null || measured[k] ? 1 : 0;
  }

  const series: PricePoint[] = [];
  for (let k = 0; k < n; k++) {
    if (!(raw[k] > 0)) continue; // nothing owned was priced yet
    series.push({ t: days[k], v: Math.round(latest / toLast[k]) });
  }

  const change = (daysBack: number): number | null => {
    const target = days[n - 1] - daysBack * DAY_MS;
    let from = -1;
    for (let k = 0; k < n; k++) if (days[k] <= target && raw[k] > 0) from = k;
    if (from < 0 || !measured[from]) return null;
    return Math.round((toLast[from] - 1) * 1000) / 10;
  };

  return { series, change };
}
