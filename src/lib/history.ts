// Public price history lives in GitHub, not in Postgres (the owner's call,
// 2026-10-03; DECISIONS.md "History lives in GitHub"). The import writes three
// kinds of JSON file to the `data` branch of Specifxx/OpCompare:
//
//   history/days/YYYY-MM-DD.json   every product's [market, low] that day —
//                                  append-only, the permanent archive
//   history/products/<bb>.json     each product's last 730 days, bucketed by
//                                  productId % 256 (hex "00"–"ff") — what a card
//                                  or sealed page's chart reads
//   history/index.json             the OP Compare Index, one row per day
//
// Prices are US cents (TCGplayer's market price and the cheapest US listing),
// days are YYYYMMDD integers. This module is pure — formats and maths only —
// so tests/history.test.ts can pin it; lib/history-store.ts does the file I/O.
export const HISTORY_BUCKETS = 256;
export const KEEP_DAYS = 730;

/**
 * v2 (2026-10-04, "history files carry every market"):
 * [YYYYMMDD, TCGplayer market USD cents, lowUS, lowAU, lowUK, lowSG, lowCA, lowEU]
 * with each low in its market's own currency, in MARKETS order. v1 files held
 * only [day, market, lowUS]; readers pad them (a v1 point has no other market).
 */
export type Point = (number | null)[];
export const POINT_LEN = 8;
export const HISTORY_MARKETS = ["US", "AU", "UK", "SG", "CA", "EU"] as const;
export interface BucketFile {
  v: 1 | 2;
  p: Record<string, Point[]>;
}
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

export const bucketOf = (id: number) => (((id % HISTORY_BUCKETS) + HISTORY_BUCKETS) % HISTORY_BUCKETS).toString(16).padStart(2, "0");
export const dayNum = (iso: string) => Number(iso.slice(0, 10).replace(/-/g, ""));
export const dayIso = (n: number) => `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`;
const dayMs = (n: number) => Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
export const addDays = (n: number, d: number) => dayNum(new Date(dayMs(n) + d * 864e5).toISOString());

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
