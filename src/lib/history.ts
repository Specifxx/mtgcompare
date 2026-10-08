// src/lib/history.ts (owner WP01a, FROZEN; MERGED text: OP's file plus the v3 codec, minus the bucket constants of the Postgres era). Public price history lives in the PRIVATE data repository (contract section 12), never in Postgres.
// Pure: formats and maths only. UNCHANGED from OP (bodies copied): Point, POINT_LEN, HISTORY_MARKETS, DayFile, normPoint, IndexRow, IndexFile, dayNum, dayIso, addDays, withPoint, changeOver, highOver, nextIndex, chartSeries.
// REMOVED (data plane): HISTORY_BUCKETS, bucketOf (hex bucket of productId % N), RECENT_DAYS, KEEP_DAY_FILES and the `recent/` and `days/` families. The bucket of a unit is histBucket(id) = floor(id / 64) (plane/shards.ts);
// the v4 series, the base + tail merge and appendDay live in plane/history-codec.ts. In memory a series stays Point[] ([YYYYMMDD, market, null x 6]); files are decoded at the edge, so tests/history.test.ts keeps pinning the maths
// and the consumers (tools-history, rise-predictor, portfolio-performance, collection-server, data/history) only change their KEY (unitKey(id, finish)).
import type { UnitKey } from "./constants";

export const KEEP_DAYS = 730;
export type Point = (number | null)[];
export const POINT_LEN = 8;
export const HISTORY_MARKETS = ["US", "AU", "UK", "SG", "CA", "EU"] as const;
/** In memory. Keys are UnitKey ("<productId>.<finishIndex>"); v1/v2 files (OP) keyed by productId are still decodable but are never written. */
export interface BucketFile { v: 1 | 2; p: Record<string, Point[]> }
/** On disk: per unit [startDay (YYYYMMDD), c0, c1, ...]: MARKET cents for consecutive calendar days from startDay, null = no price that day. */
export type SeriesV3 = [startDay: number, ...marketCents: (number | null)[]];
export interface BucketFileV3 { v: 3; p: Record<UnitKey, SeriesV3> }
// ── KEPT from OP (bodies unchanged; the 22 names the smoke rule demanded back, design/_final2/handoff/frozen-imports-demands.txt): the v2 day file and the index types, normPoint ──
export interface DayFile {
  v: 2;
  day: string;
  /** id → [market, lowUS, lowAU, lowUK, lowSG, lowCA, lowEU] */
  p: Record<string, (number | null)[]>;
}

/** A point of either version as a full v2 point (v1's missing markets are null). */
export function normPoint(p: Point): Point {
  if (p.length >= POINT_LEN) return p;
  return [...p, ...Array(POINT_LEN - p.length).fill(null)];
}
export interface IndexRow {
  day: string;
  value: number;
  totalUsd: number;
  cardCount: number;
}
export interface IndexFile {
  v: 1;
  days: IndexRow[];
}

// OP's day helpers (bodies unchanged)
export const dayNum = (iso: string): number => Number(iso.slice(0, 10).replace(/-/g, ""));
export const dayIso = (n: number): string => `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`;
const dayMs = (n: number): number => Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
export const addDays = (n: number, d: number): number => dayNum(new Date(dayMs(n) + d * 864e5).toISOString());
/** Calendar days from a to b (both YYYYMMDD), b >= a. */
export const daysBetween = (a: number, b: number): number => Math.round((dayMs(b) - dayMs(a)) / 864e5);

/** v3 -> memory. v1/v2 pass through. A null day is dropped. */
export function decodeBucket(raw: unknown): BucketFile {
  const f = raw as { v?: number; p?: Record<string, unknown> } | null;
  if (!f || f.v !== 3) return (raw as BucketFile) ?? { v: 2, p: {} };
  const p: BucketFile["p"] = {};
  for (const [k, s] of Object.entries((f as unknown as BucketFileV3).p)) {
    const [start, ...vals] = s; const pts: Point[] = [];
    vals.forEach((c, i) => { if (c != null) pts.push([addDays(start, i), c, null, null, null, null, null, null]); });
    if (pts.length) p[k] = pts;
  }
  return { v: 2, p };
}
/** memory -> v3. Only the market (index 1) survives; a series is cut to its first and last non-null day. */
export function encodeBucket(f: BucketFile): BucketFileV3 {
  const p: BucketFileV3["p"] = {};
  for (const [k, pts] of Object.entries(f.p)) {
    const rows = pts.filter((x) => x[1] != null).sort((a, b) => (a[0] as number) - (b[0] as number));
    if (!rows.length) continue;
    const start = rows[0]![0] as number, last = rows[rows.length - 1]![0] as number, n = daysBetween(start, last) + 1;
    const out: (number | null)[] = new Array(n).fill(null);
    for (const x of rows) out[daysBetween(start, x[0] as number)] = x[1]!;
    p[k as UnitKey] = [start, ...out];
  }
  return { v: 3, p };
}


// ── KEPT from OP (bodies unchanged): the series maths tests/history.test.ts pins. In memory a series stays Point[]; the v3 codec above is the on-disk form. ──
/** A series with today's point set (replacing a same-day point) and anything older than `keep` days dropped. */
export function withPoint(series: Point[] | undefined, p: Point, keep = KEEP_DAYS): Point[] {
  const cutoff = addDays(p[0] as number, -keep);
  const out = (series ?? []).filter((x) => x[0] !== p[0] && (x[0] as number) > cutoff);
  out.push(p);
  return out.sort((a, b) => (a[0] as number) - (b[0] as number));
}

/**
 * Percent change of the market price over `days`, against the latest recorded
 * price between `days` and `days + 4` days ago (a missed import shouldn't blank
 * the number) — the same window the Postgres version used.
 */
export function changeOver(series: Point[], today: number, days: number): number | null {
  const now = series.find((x) => x[0] === today)?.[1];
  if (now == null) return null;
  const hi = addDays(today, -days);
  const lo = addDays(today, -(days + 4));
  const then = [...series].reverse().find((x) => (x[0] as number) <= hi && (x[0] as number) >= lo && (x[1] ?? 0) > 0)?.[1];
  return then ? Math.round(((now - then) * 1000) / then) / 10 : null;
}

/** Highest market price over the last `days` days. */
export function highOver(series: Point[], today: number, days = 90): number | null {
  const from = addDays(today, -days);
  let hi: number | null = null;
  for (const x of series) if ((x[0] as number) >= from && x[1] != null && (hi == null || x[1] > hi)) hi = x[1];
  return hi;
}

/**
 * The OP Compare Index for today: chained and value-weighted over every single
 * priced at US$1+ on both the previous recorded day and today, 1,000 on day one.
 * `pairs` are [today, previous day] market cents of cards priced on both days.
 */
export function nextIndex(prev: IndexRow | null, pairs: [number, number][], total: number, cardCount: number, day: string): IndexRow {
  let value = 1000;
  if (prev) {
    const a = pairs.reduce((s, [t]) => s + t, 0);
    const b = pairs.reduce((s, [, y]) => s + y, 0);
    value = b > 0 ? prev.value * (a / b) : prev.value;
  }
  return { day, value: Math.round(value * 100) / 100, totalUsd: Math.min(total, 2_000_000_000), cardCount };
}

/** The chart series a page draws: the last `days` days, as dated points. `lows` is every market's low in MARKETS order (v1 days: US only). */
export function chartSeries(
  series: Point[] | undefined,
  today: number,
  days = 365,
): { day: string; marketUsd: number | null; lowUsd: number | null; lows: (number | null)[] }[] {
  const from = addDays(today, -days);
  return (series ?? [])
    .filter((x) => (x[0] as number) >= from)
    .map(normPoint)
    .map((x) => ({ day: dayIso(x[0] as number), marketUsd: x[1], lowUsd: x[2], lows: x.slice(2, POINT_LEN) }));
}
