// Daily price history: one snapshot a day per product per region of the two numbers every page already shows (the cheapest
// in-stock price and how many stores have it in stock), kept in data/public/price-history.json beside the other public files.
//
// WHERE IT COMES FROM. scripts/export-public-data.ts, after each import, reads the previous file and folds today's ProductStat rows
// into it (updatePriceHistory). The site reads the file (readPriceHistory), never Neon. Like the rest of data/public it is published
// with the source: public prices only, nothing about visitors.
//
// THE FORMAT IS CHANGE-POINTS, NOT ONE ROW A DAY. A series is a list of [day, cents | null, stores] points, each written only when
// the pair differs from the one before; a value holds until the next point, up to `through` (the last day folded in). A product no
// store has in stock is [day, null, 0]. Days are whole UTC days since 1970 (Date.parse / 86 400 000). Points older than KEEP_DAYS are
// dropped, but the last one before the cutoff is kept as the series' opening value. ~9,000 series, a few points each: well under 1 MB.
//
// WHAT THE SITE MAY SAY WITH IT. A chart of the cheapest in-stock price by day, and "the lowest/highest in the last N days", once a
// product has MIN_DAYS of snapshots; nothing before then (no partial chart, no guess). The copy rules still hold (lib/copy-rules.ts):
// no "dropped", "was A$…" or "lowest ever" in generated sentences.
import fs from "node:fs";
import path from "node:path";
import { publicDataDir } from "./public-data/format";

export const HISTORY_FILE = "price-history.json";
export const HISTORY_VERSION = 1;
/** Snapshots kept. */
export const KEEP_DAYS = 400;
/** A chart (and any statement from the history) needs this many days of snapshots for the product. */
export const MIN_DAYS = 7;

/** [day (UTC days since 1970), cheapest in-stock price in cents or null, stores with it in stock]. */
export type Point = [day: number, cents: number | null, stores: number];

export interface PriceHistory {
  v: typeof HISTORY_VERSION;
  /** The first day folded in (UTC days since 1970). */
  since: number;
  /** The last day folded in. */
  through: number;
  /** market → product slug → change-points, oldest first. */
  series: Record<string, Record<string, Point[]>>;
}

export const dayOf = (isoOrDate: string | Date): number => Math.floor((typeof isoOrDate === "string" ? Date.parse(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate) : isoOrDate.getTime()) / 86_400_000);
export const isoOfDay = (day: number): string => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** One product in one market today, as ProductStat has it. */
export interface TodayRow {
  market: string;
  slug: string;
  /** The cheapest open price (null when nothing is in stock). */
  cents: number | null;
  stores: number;
}

const same = (p: Point, cents: number | null, stores: number) => p[1] === cents && p[2] === stores;

/**
 * Fold today's rows into the history: a new point for each series whose value changed (today's replaces an earlier point written
 * the same day: two imports a day, the later one wins), [today, null, 0] for a series that has left the market, then the window
 * trimmed to KEEP_DAYS. Pure: returns a new object.
 */
export function updatePriceHistory(prev: PriceHistory | null, rows: readonly TodayRow[], today: number): PriceHistory {
  const series: Record<string, Record<string, Point[]>> = {};
  if (prev) for (const [m, bySlug] of Object.entries(prev.series)) series[m] = Object.fromEntries(Object.entries(bySlug).map(([s, pts]) => [s, pts.map((p) => [...p] as Point)]));
  const seen = new Set<string>();
  const put = (market: string, slug: string, cents: number | null, stores: number) => {
    const pts = ((series[market] ??= {})[slug] ??= []);
    const last = pts[pts.length - 1];
    if (last && last[0] === today) {
      pts.pop();
      const before = pts[pts.length - 1];
      if (!before || !same(before, cents, stores)) pts.push([today, cents, stores]);
    } else if (!last || !same(last, cents, stores)) {
      pts.push([today, cents, stores]);
    }
  };
  for (const r of rows) {
    const cents = r.stores > 0 || r.cents != null ? (r.cents != null && r.cents > 0 ? r.cents : null) : null;
    put(r.market, r.slug, cents, Math.max(0, r.stores | 0));
    seen.add(`${r.market}|${r.slug}`);
  }
  for (const [m, bySlug] of Object.entries(series))
    for (const slug of Object.keys(bySlug)) if (!seen.has(`${m}|${slug}`)) put(m, slug, null, 0);
  // the window: drop points before the cutoff but keep the last of them as the opening value; drop series that are only "gone"
  const cutoff = today - KEEP_DAYS;
  for (const [m, bySlug] of Object.entries(series)) {
    for (const [slug, pts] of Object.entries(bySlug)) {
      let i = 0;
      while (i + 1 < pts.length && pts[i + 1][0] <= cutoff) i++;
      const kept = pts.slice(i);
      if (kept.length === 1 && kept[0][1] == null && kept[0][2] === 0 && kept[0][0] <= cutoff) delete bySlug[slug];
      else bySlug[slug] = kept;
    }
    if (!Object.keys(bySlug).length) delete series[m];
  }
  return { v: HISTORY_VERSION, since: prev ? Math.min(prev.since, today) : today, through: Math.max(prev?.through ?? today, today), series };
}

/** One day of a series: the value that held on `day`. */
export interface DayValue {
  day: number;
  cents: number | null;
  stores: number;
}

/** A product's daily values from its first snapshot (or `days` back, whichever is later) to the history's last day. */
export function dailySeries(h: PriceHistory, market: string, slug: string, days = 90): DayValue[] {
  const pts = h.series[market]?.[slug];
  if (!pts?.length) return [];
  const from = Math.max(pts[0][0], h.through - days + 1);
  const out: DayValue[] = [];
  let i = 0;
  for (let d = from; d <= h.through; d++) {
    while (i + 1 < pts.length && pts[i + 1][0] <= d) i++;
    if (pts[i][0] > d) continue;
    out.push({ day: d, cents: pts[i][1], stores: pts[i][2] });
  }
  return out;
}

/** Days of snapshots the product has (its first point to the last day folded in). */
export function daysOfHistory(h: PriceHistory, market: string, slug: string): number {
  const pts = h.series[market]?.[slug];
  return pts?.length ? h.through - pts[0][0] + 1 : 0;
}

/** The median of a product's daily in-stock prices over the last `days` (days with nothing in stock left out), or null under MIN_DAYS of prices. */
export function typicalPrice(h: PriceHistory, market: string, slug: string, days = 30): number | null {
  const vals = dailySeries(h, market, slug, days)
    .map((d) => d.cents)
    .filter((c): c is number => c != null)
    .sort((a, b) => a - b);
  if (vals.length < MIN_DAYS) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
}

/** Is this a history file we can read? */
export function isPriceHistory(x: unknown): x is PriceHistory {
  const h = x as PriceHistory;
  return !!h && h.v === HISTORY_VERSION && Number.isInteger(h.since) && Number.isInteger(h.through) && !!h.series && typeof h.series === "object";
}

// ─── Reading the file (server only) ──────────────────────────────────────────

let cached: { mtimeMs: number; h: PriceHistory | null } | null = null;

/** data/public/price-history.json, parsed once per deployment (re-read if the file changes); null when absent or unreadable. */
export function readPriceHistory(dir = publicDataDir()): PriceHistory | null {
  const file = path.join(dir, HISTORY_FILE);
  try {
    const { mtimeMs } = fs.statSync(file);
    if (cached && cached.mtimeMs === mtimeMs) return cached.h;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    cached = { mtimeMs, h: isPriceHistory(json) ? json : null };
    return cached.h;
  } catch {
    return null;
  }
}

/** A product whose latest snapshot price sits under the median of its own daily prices over the last `days` (MIN_DAYS of prices at least). */
export interface UnderTypical {
  slug: string;
  cents: number;
  typical: number;
  /** How far under, in whole percent. */
  pct: number;
}

/**
 * The market's products whose latest in-stock price is at least `minPct`% under their own typical (median) daily price over the
 * last `days`, furthest under first. Real snapshots only (no product appears before it has MIN_DAYS of prices).
 */
export function underOwnTypical(h: PriceHistory, market: string, { days = 30, minPct = 10, take = 12 } = {}): UnderTypical[] {
  const out: UnderTypical[] = [];
  for (const [slug, pts] of Object.entries(h.series[market] ?? {})) {
    const last = pts[pts.length - 1];
    if (!last || last[1] == null || last[2] < 1) continue;
    const typical = typicalPrice(h, market, slug, days);
    if (typical == null) continue;
    const pct = Math.round(((typical - last[1]) / typical) * 100);
    // a gap over half the typical price is a misfiled listing, not a price (the /deals rule)
    if (pct >= minPct && last[1] >= typical * 0.5) out.push({ slug, cents: last[1], typical, pct });
  }
  return out.sort((a, b) => b.pct - a.pct || a.slug.localeCompare(b.slug)).slice(0, take);
}
