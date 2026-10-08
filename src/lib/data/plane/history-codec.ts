// src/lib/data/plane/history-codec.ts (owner WP01a, FROZEN). The v4 history series, the base + tail merge, and the ONLY way a day is appended (appendDay): the importer reads yesterday's series back, adds today and writes it again.
//
// v4 = [startDay YYYYMMDD, value, days, value, days, ...], value = USD cents or null (no price that day), days = consecutive CALENDAR days. Because the encoding is calendar-contiguous, every case that v3's dated points made
// impossible has a rule here (critique DP-12; the property test in tests/plane-history.test.ts kills and re-runs a simulated publisher at random points for 60 days and compares the decoded series with the model):
//   * the same priceDay published twice (the 21:55 and 22:25 retries, a phase-2 re-run)  -> REPLACE the last day, never extend the run;
//   * a missed day (red run, TCGCSV outage)                                              -> a null run for the gap, never a held price (a held price would invent a quote);
//   * a unit entering tracking mid-cycle                                                 -> a new series that starts that day (no base entry; mergeTail handles base-less units);
//   * a unit that left tracking and comes back                                           -> the gap is a null run; the old series is kept (history is never deleted);
//   * a day OLDER than the series end                                                    -> refused (returns changed:false); history is append-only.
import { addDays, daysBetween } from "../../history";
import type { SeriesV4 } from "./formats";

export type { SeriesV4 };
const runsOf = (s: SeriesV4): { value: number | null; days: number }[] => { const out: { value: number | null; days: number }[] = []; for (let i = 1; i + 1 < s.length; i += 2) out.push({ value: s[i] as number | null, days: s[i + 1] as number }); return out; };
const fromRuns = (start: number, runs: { value: number | null; days: number }[]): SeriesV4 => { const out: SeriesV4 = [start]; for (const r of runs) out.push(r.value, r.days); return out; };
const norm = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null);

/** Calendar days covered by the series. */
export const spanOf = (s: SeriesV4): number => { let n = 0; for (let i = 2; i < s.length; i += 2) n += s[i] as number; return n; };
/** Last day (YYYYMMDD) covered, or startDay - 1 for an empty series. */
export const endDayOf = (s: SeriesV4): number => addDays(s[0], spanOf(s) - 1);

/** encodeRuns: dense per-day values (oldest first) -> runs. 0 and negative are "no price". */
export function encodeRuns(startDay: number, values: ArrayLike<number | null>): SeriesV4 {
  const out: SeriesV4 = [startDay]; let i = 0;
  while (i < values.length) { const v = norm(values[i]); let j = i; while (j + 1 < values.length && norm(values[j + 1]) === v) j++; out.push(v, j - i + 1); i = j + 1; }
  return out;
}
/** decodeDense: runs -> one entry per calendar day (null = no price). */
export function decodeDense(s: SeriesV4): { day: number; cents: number | null }[] {
  const out: { day: number; cents: number | null }[] = []; let day = s[0];
  for (const r of runsOf(s)) for (let d = 0; d < r.days; d++, day = addDays(day, 1)) out.push({ day, cents: r.value });
  return out;
}

export interface AppendResult { series: SeriesV4; changed: boolean; action: "new" | "extend" | "new-run" | "replace" | "noop" | "gap" | "refused-older" }
/** The ONLY append rule. `series` undefined = the unit has no history yet. Pure: returns a new series. */
export function appendDay(series: SeriesV4 | undefined, day: number, value: number | null): AppendResult {
  const v = norm(value);
  if (!series || series.length < 3) return { series: [day, v, 1], changed: true, action: "new" };
  const end = endDayOf(series), runs = runsOf(series);
  const last = runs[runs.length - 1]!;
  if (day < end) return { series, changed: false, action: "refused-older" };
  if (day === end) {                                                                       // a retry of the same priceDay
    if (last.value === v) return { series, changed: false, action: "noop" };
    const next = runs.slice(); next.pop();
    if (last.days > 1) next.push({ value: last.value, days: last.days - 1 });
    const prev = next[next.length - 1];
    if (prev && prev.value === v) prev.days += 1; else next.push({ value: v, days: 1 });
    return { series: fromRuns(series[0], next), changed: true, action: "replace" };
  }
  const next = runs.map((r) => ({ ...r }));
  let action: AppendResult["action"] = "extend";
  if (day > addDays(end, 1)) {                                                             // a gap: a null run, never a held price
    const gap = daysBetween(end, day) - 1;
    const tail = next[next.length - 1]!;
    if (tail.value === null) tail.days += gap; else next.push({ value: null, days: gap });
    action = "gap";
  }
  const tail = next[next.length - 1]!;
  if (tail.value === v) tail.days += 1; else { next.push({ value: v, days: 1 }); if (action === "extend") action = "new-run"; }
  return { series: fromRuns(series[0], next), changed: true, action };
}

/** base (ends on the cut day or earlier) + tail (starts after it) -> one series. A unit with no base starts at its tail; a gap between them is a null run. */
export function mergeTail(base: SeriesV4 | undefined, tail: SeriesV4 | undefined): SeriesV4 | undefined {
  if (!base || base.length < 3) return tail && tail.length >= 3 ? tail : undefined;
  if (!tail || tail.length < 3) return base;
  const bEnd = endDayOf(base);
  if (tail[0] <= bEnd) { let s: SeriesV4 | undefined = base; for (const p of decodeDense(tail)) if (p.day > bEnd) s = appendDay(s, p.day, p.cents).series; return s; }   // overlap (a cut raced a tail write): the base wins up to its end
  const runs = runsOf(base);
  const gap = daysBetween(bEnd, tail[0]) - 1;
  if (gap > 0) { const l = runs[runs.length - 1]!; if (l.value === null) l.days += gap; else runs.push({ value: null, days: gap }); }
  const tr = runsOf(tail); const l = runs[runs.length - 1]!;
  if (l.value === tr[0]!.value) { l.days += tr[0]!.days; tr.shift(); }
  return fromRuns(base[0], runs.concat(tr));
}
/** Cut a series to the last `keep` days ending on its own end day (the cut day rewrites every base file to this window). */
export function trimToWindow(s: SeriesV4, keep: number): SeriesV4 {
  const span = spanOf(s); if (span <= keep) return s;
  const dense = decodeDense(s).slice(span - keep);
  return encodeRuns(dense[0]!.day, dense.map((d) => d.cents));
}
/** The decode the OP maths consume: Point[] ([YYYYMMDD, market, null x 6]); null days are dropped as decodeBucket does for v3. */
export function toPoints(s: SeriesV4): (number | null)[][] {
  return decodeDense(s).filter((p) => p.cents != null).map((p) => [p.day, p.cents, null, null, null, null, null, null]);
}
/** The days of a series from `from` (YYYYMMDD) on, dense; used by charts and sparklines. */
export function sliceFrom(s: SeriesV4 | undefined, from: number): { day: number; cents: number | null }[] { return s ? decodeDense(s).filter((p) => p.day >= from) : []; }
/** Does a v3 or v4 file series (the wire shape: [start, ...]) have the v4 shape? v3 = [start, c0, c1, ...] (one value per day). Readers branch on HistFile.v, never on the data. */
export function decodeV3(s: (number | null)[]): { day: number; cents: number | null }[] { const start = s[0] as number; return s.slice(1).map((c, i) => ({ day: addDays(start, i), cents: c })); }
