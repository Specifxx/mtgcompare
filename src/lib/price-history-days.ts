// The pure, browser-safe half of lib/price-history.ts (the chart is a client component and the file reader imports node:fs).
/** A chart (and any statement from the history) needs this many days of snapshots for the product. */
export const MIN_DAYS = 7;

/** One day of a series: the value that held on `day`. */
export interface DayValue {
  day: number;
  cents: number | null;
  stores: number;
}

export const isoOfDay = (day: number): string => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** Change-points [day, cents | null, stores] oldest first, to one value per day from the first point (or `days` back) to `through`. */
export function expandPoints(pts: ReadonlyArray<readonly [number, number | null, number]> | undefined, through: number, days = 90): DayValue[] {
  if (!pts?.length) return [];
  const from = Math.max(pts[0][0], through - days + 1);
  const out: DayValue[] = [];
  let i = 0;
  for (let d = from; d <= through; d++) {
    while (i + 1 < pts.length && pts[i + 1][0] <= d) i++;
    if (pts[i][0] > d) continue;
    out.push({ day: d, cents: pts[i][1], stores: pts[i][2] });
  }
  return out;
}
