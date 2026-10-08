// Demand history: the daily snapshots of the running counters and the arithmetic over them. CardStat.searchCount / viewCount are cumulative running totals (no per-event log; plane/view-beacon.ts
// samples and batches them), so the only way to measure demand over a window, or its velocity, is to snapshot those totals daily and diff them.
//
// WHERE THE SNAPSHOTS LIVE (owner addendum 2026-10-08, contract 14.5): in Neon, one DemandDay row a day ({ day, data: { "<productId>": [searches, views] } }, the top DEMAND_DAY_CARDS by
// activity, about 40 KB), written by the demand-snapshot job (scripts/publish-demand.ts) and NEVER published: the counters are the Demand Finder product and the Rising Cards signal, and
// nothing paid is a file. Counts are aggregates of public activity, never who did it.
//
// THIS MODULE IS PURE: the row format and the diffing. src/lib/data/demand.ts supplies a `readDay` that reads a DemandDay row, and the job writes them (src/lib/tools-history.ts).
//
// THE READERS THROW (RiftCompare, 2026-09-25): demandWindowOrThrow lets a failed read reject, because its callers run inside an unstable_cache callback and unstable_cache stores whatever the
// callback returns: one network blip would otherwise be cached as "no demand". Callers catch OUTSIDE the cache. The display-only admin leaderboard keeps a guarded form.

export interface DemandDayFile {
  v: 1;
  day: string;
  /** product id (as a JSON key) → [searchCount, viewCount], running totals. Cards at 0/0 are left out. */
  p: Record<string, [number, number]>;
}

/** The most cards one DemandDay row keeps (the busiest by searches plus views): a card outside it on the baseline day counts in full for a window, which only understates the cards nobody searches. */
export const DEMAND_DAY_CARDS = 3000;

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" of a UTC instant. */
export const utcDayKey = (d: Date | number = Date.now()): string => new Date(d).toISOString().slice(0, 10);

/** `days` before a "YYYY-MM-DD" day, as a "YYYY-MM-DD" day. */
export function dayMinus(day: string, days: number): string {
  return utcDayKey(Date.parse(`${day}T00:00:00Z`) - days * DAY_MS);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Today's snapshot from the live counters: only cards with any activity, the DEMAND_DAY_CARDS busiest (searches plus views, then id). */
export function buildDemandDay(day: string, cards: readonly { id: number; searchCount: number; viewCount: number }[]): DemandDayFile {
  const p: DemandDayFile["p"] = {};
  const busy = cards.filter((c) => c.searchCount > 0 || c.viewCount > 0).sort((a, b) => b.searchCount + b.viewCount - (a.searchCount + a.viewCount) || a.id - b.id).slice(0, DEMAND_DAY_CARDS);
  for (const c of busy) p[String(c.id)] = [c.searchCount, c.viewCount];
  return { v: 1, day, p };
}

/** The most recent snapshot day at or before `cutoff`, or null when none reaches back that far. */
export function latestDayAtOrBefore(days: readonly string[], cutoff: string): string | null {
  let best: string | null = null;
  for (const d of days) if (d <= cutoff && (best == null || d > best)) best = d;
  return best;
}

export interface DemandWindowRow {
  cardId: number;
  searches: number; // searches accrued INSIDE the window
  views: number;
}

/**
 * Activity between two sets of running totals: `end` minus `start`, per card.
 * A card with no start row is NEW since the window opened, so all of its total
 * accrued inside it; Math.max guards a counter reset backwards.
 */
export function diffTotals(end: Readonly<Record<string, readonly [number, number]>>, start: Readonly<Record<string, readonly [number, number]>>): DemandWindowRow[] {
  const rows: DemandWindowRow[] = [];
  for (const [key, [s, v]] of Object.entries(end)) {
    const b = start[key], cardId = Number(key);
    if (!Number.isInteger(cardId) || cardId <= 0) continue;
    const searches = Math.max(0, s - (b?.[0] ?? 0));
    const views = Math.max(0, v - (b?.[1] ?? 0));
    if (searches > 0 || views > 0) rows.push({ cardId, searches, views });
  }
  return rows;
}

export interface DemandPreviousWindow {
  rows: DemandWindowRow[];
  startDay: string;
  endDay: string; // = the current window's baseline day
  coveredDays: number;
}

export interface DemandWindowResult {
  rows: DemandWindowRow[]; // every card with >0 activity in the window, unsorted
  baselineDay: string | null; // snapshot day used as the window's start (null = none old enough)
  coveredDays: number | null; // real days from baseline to today — may be < requested
  totalDays: number; // distinct snapshot days on record at all
  previous?: DemandPreviousWindow | null;
}

export interface DemandWindowDeps {
  /** The snapshot days on record (the DemandDay keys), any order. */
  days: readonly string[];
  /** Today's running totals (the live counters), product id → [searches, views]. */
  live: Readonly<Record<string, readonly [number, number]>>;
  /** Reads one day's snapshot; null when it is missing. Throws on a failed read. */
  readDay: (day: string) => Promise<DemandDayFile | null>;
  today: string;
}

/**
 * Demand accrued within the last `days` days: today's totals minus the totals
 * as of the latest snapshot at or before the window's start. Daily resolution,
 * and only as good as the snapshot coverage, which is why it returns the real
 * coverage beside the numbers: the caller must say "these are really the last
 * 5 days" rather than present a shorter window under the requested label.
 * With `previous`, also the equal-length period before the window (for rank
 * movement). Throws on a failed read (see the header).
 */
export async function demandWindowOrThrow(windowDays: number, deps: DemandWindowDeps, opts: { previous?: boolean } = {}): Promise<DemandWindowResult> {
  const totalDays = deps.days.length;
  const empty: DemandWindowResult = { rows: [], baselineDay: null, coveredDays: null, totalDays };
  if (totalDays === 0) return empty;
  const baselineDay = latestDayAtOrBefore(deps.days, dayMinus(deps.today, windowDays));
  if (!baselineDay) return empty;
  const base = await deps.readDay(baselineDay);
  if (!base) return empty;
  const rows = diffTotals(deps.live, base.p);
  const coveredDays = Math.max(0, daysBetween(baselineDay, deps.today));
  let previous: DemandPreviousWindow | null | undefined;
  if (opts.previous) {
    previous = null;
    const startDay = latestDayAtOrBefore(deps.days, dayMinus(baselineDay, windowDays));
    if (startDay) {
      const start = await deps.readDay(startDay);
      if (start) previous = { rows: diffTotals(base.p, start.p), startDay, endDay: baselineDay, coveredDays: daysBetween(startDay, baselineDay) };
    }
  }
  return { rows, baselineDay, coveredDays, totalDays, ...(opts.previous ? { previous } : {}) };
}

/** Guarded demandWindowOrThrow: an empty window on error. Display-only callers; never inside a cache callback. */
export async function demandWindow(windowDays: number, deps: DemandWindowDeps, opts: { previous?: boolean } = {}): Promise<DemandWindowResult> {
  try {
    return await demandWindowOrThrow(windowDays, deps, opts);
  } catch (e) {
    console.warn("demandWindow skipped:", (e as Error).message);
    return { rows: [], baselineDay: null, coveredDays: null, totalDays: 0 };
  }
}

// ── Velocity (Rising Cards) ──────────────────────────────────────────────────

export interface DemandVelocity {
  // Extra searches/views per day over the window (the cumulative totals' slope).
  searchPerDay: number;
  viewPerDay: number;
  // Total growth over the window as a % of the starting level (attention acceleration).
  searchGrowthPct: number | null;
  spanDays: number; // days between the first and last snapshot used
  points: number; // snapshots available for this card
}

/**
 * Velocity from a card's first and last snapshot in a window (RiftCompare's
 * velocityBetween, verbatim). Null below 2 points or a day of span.
 */
export function velocityBetween(
  first: { t: number; s: number; v: number },
  last: { t: number; s: number; v: number },
  points: number,
): DemandVelocity | null {
  if (points < 2) return null;
  const spanDays = (last.t - first.t) / DAY_MS;
  if (spanDays < 1) return null;
  const searchGrowthPct = first.s > 0 ? Math.round(((last.s - first.s) / first.s) * 1000) / 10 : null;
  return {
    searchPerDay: Math.round(((last.s - first.s) / spanDays) * 100) / 100,
    viewPerDay: Math.round(((last.v - first.v) / spanDays) * 100) / 100,
    searchGrowthPct,
    spanDays: Math.round(spanDays),
    points,
  };
}

/** One card's demand as it stood on a day: its totals then, and its velocity over the window before. */
export interface DemandAsOfCard {
  searchCount: number;
  viewCount: number;
  velocity: DemandVelocity | null;
}

/**
 * Every card's demand AS OF `asOf`, from the day files in the `windowDays`
 * before it (oldest first): its running totals on its last snapshot on or
 * before that day, and its velocity between its first and last snapshot in the
 * window. RiftCompare does this in SQL over DemandSnapshot; here the loaders
 * run it over the DemandDay rows they read (lib/data/demand.ts).
 */
export function demandAsOf(files: readonly DemandDayFile[], asOf: string, windowDays = 21): Record<number, DemandAsOfCard> {
  const from = dayMinus(asOf, windowDays);
  const inWindow = files.filter((f) => f.day >= from && f.day <= asOf).sort((a, b) => a.day.localeCompare(b.day));
  const acc = new Map<string, { first: { t: number; s: number; v: number }; last: { t: number; s: number; v: number }; n: number }>();
  for (const f of inWindow) {
    const t = Date.parse(`${f.day}T00:00:00Z`);
    for (const [id, [s, v]] of Object.entries(f.p)) {
      const cur = acc.get(id);
      if (!cur) acc.set(id, { first: { t, s, v }, last: { t, s, v }, n: 1 });
      else {
        cur.last = { t, s, v };
        cur.n += 1;
      }
    }
  }
  const out: Record<number, DemandAsOfCard> = {};
  for (const [id, a] of acc) out[Number(id)] = { searchCount: a.last.s, viewCount: a.last.v, velocity: velocityBetween(a.first, a.last, a.n) };
  return out;
}
