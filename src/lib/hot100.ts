// The weekly Hot 100 (owner, 2026-11-18: "Rift Compare has the Hot 100 … we should have it for all the other sites"): one
// stable URL per region, /<region>/hot-100, posted to Reddit once a week as a plain link and title. Where /<region>/charts
// is the dated, frozen Sunday chart (top 20), this is the rolling one: the last seven days up to the newest import, every
// product whose cheapest in-stock price rose, biggest rise first, up to 100, each with its place on the chart seven days
// earlier, worked out the same way. Pure, from data/public/price-history.json (lib/price-history.ts) alone.
//
// REAL MOVES ONLY, the weekly chart's rules with a lower floor: two or more stores had it in stock on both days, the price
// rose HOT_MIN_PCT or more and under CHART_MAX_PCT (a bigger jump is a misfiled listing, not a price). A week with 37 such
// products is the Hot 37, never padded (RiftCompare's Hot 40 rule).
import type { PriceHistory } from "./price-history";
/** A jump this big is a misfiled listing, not a price (the weekly chart's rule). */
export const CHART_MAX_PCT = 50;

export const HOT_MAX = 100;
export const HOT_MIN_PCT = 1;

export interface HotRow {
  slug: string;
  rank: number;
  lastRank: number | null;
  before: number;
  after: number;
  /** Percent, one decimal. */
  pct: number;
  stores: number;
}

export interface HotChart {
  /** The chart's last day and its comparison day, YYYY-MM-DD. */
  through: string;
  from: string;
  rows: HotRow[];
  lastWeekSize: number;
}

const iso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

function valueOn(h: PriceHistory, market: string, slug: string, day: number): { cents: number | null; stores: number } | null {
  const pts = h.series[market]?.[slug];
  if (!pts?.length || pts[0][0] > day || day > h.through) return null;
  let v = pts[0];
  for (const p of pts) {
    if (p[0] > day) break;
    v = p;
  }
  return { cents: v[1], stores: v[2] };
}

function movers(h: PriceHistory, market: string, end: number, max: number, dir: 1 | -1): Omit<HotRow, "rank" | "lastRank">[] {
  const rows: Omit<HotRow, "rank" | "lastRank">[] = [];
  if (end - 7 < h.since) return rows;
  for (const slug of Object.keys(h.series[market] ?? {})) {
    const a = valueOn(h, market, slug, end - 7);
    const b = valueOn(h, market, slug, end);
    if (!a || !b || a.cents == null || b.cents == null || a.stores < 2 || b.stores < 2) continue;
    const pct = Math.round(((b.cents - a.cents) / a.cents) * 1000) / 10;
    if (dir * pct < HOT_MIN_PCT || Math.abs(pct) >= CHART_MAX_PCT) continue;
    rows.push({ slug, before: a.cents, after: b.cents, pct, stores: b.stores });
  }
  return rows.sort((x, y) => dir * (y.pct - x.pct) || y.after - x.after || x.slug.localeCompare(y.slug)).slice(0, max);
}

const risers = (h: PriceHistory, market: string, end: number, max: number) => movers(h, market, end, max, 1);

/** The rolling Hot chart in one market, ending on the newest day in the history; null without a week of history. */
export function hotChart(h: PriceHistory | null, market: string, max = HOT_MAX): HotChart | null {
  if (!h || h.through - 7 < h.since) return null;
  const end = h.through;
  const last = risers(h, market, end - 7, max);
  const lastRank = new Map(last.map((r, i) => [r.slug, i + 1]));
  const rows = risers(h, market, end, max).map((r, i) => ({ ...r, rank: i + 1, lastRank: lastRank.get(r.slug) ?? null }));
  return { through: iso(end), from: iso(end - 7), rows, lastWeekSize: last.length };
}

// THE BIGGEST DROPS (owner, 2026-11-20, from a Reddit reply: "show me the biggest drops. I just want to rip and play"). The same
// week and the same rules mirrored: two or more stores in stock on both days, the price fell HOT_MIN_PCT or more and by less than
// CHART_MAX_PCT, biggest fall first. The share card draws half rises, half drops; the page lists them under the chart.
export const DROPS_MAX = 20;

/** The week's biggest price falls in one market, over the same seven days as hotChart; empty without a week of history. */
export function hotDrops(h: PriceHistory | null, market: string, max = DROPS_MAX): Omit<HotRow, "lastRank">[] {
  if (!h || h.through - 7 < h.since) return [];
  return movers(h, market, h.through, max, -1).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** "▲3", "▼2", "=", "New", or "" when there was no chart a week earlier. */
export function hotMove(row: Pick<HotRow, "rank" | "lastRank">, lastWeekSize: number): string {
  if (row.lastRank == null) return lastWeekSize > 0 ? "New" : "";
  if (row.lastRank === row.rank) return "=";
  return row.lastRank > row.rank ? `▲${row.lastRank - row.rank}` : `▼${row.rank - row.lastRank}`;
}

export const hotName = (n: number) => `Hot ${n}`;
