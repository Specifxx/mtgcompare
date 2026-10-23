// The Black Friday / holiday deals page (/<region>/black-friday): its dates and words. Pure: tests/black-friday.test.ts.
//
// WHAT IT LISTS, AND WHAT IT NEVER SAYS. Today's products whose cheapest in-stock price is furthest under the median of the stores
// that have it (lib/deals.ts, the same 10% bar as the /deals page and every card's badge), ranked by how far under; and, once the
// site has a week of its own daily snapshots (lib/price-history.ts), the products whose price today is under their own recent
// typical price. Never a "was" price, a countdown, "ends soon" or "limited time": the stores set their own sales, and MTG Compare only
// knows what they ask when it last checked. Nothing here may match BANNED_COPY (lib/copy-rules.ts).
import type { RegionInfo } from "./regions";

/** Black Friday: the day after the fourth Thursday of November (US Thanksgiving), in YYYY-MM-DD. */
export function blackFriday(year: number): string {
  const firstOfNov = new Date(Date.UTC(year, 10, 1));
  const firstThursday = 1 + ((4 - firstOfNov.getUTCDay() + 7) % 7);
  const thanksgiving = firstThursday + 21;
  return `${year}-11-${String(thanksgiving + 1).padStart(2, "0")}`;
}

/** Cyber Monday: three days after Black Friday. */
export function cyberMonday(year: number): string {
  const d = new Date(`${blackFriday(year)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

/** The season the page is about: this year's, or next year's once this year's Cyber Monday week is over. */
export function seasonYear(today: string): number {
  const y = Number(today.slice(0, 4));
  return today > addDays(cyberMonday(y), 7) ? y + 1 : y;
}

/** Show the nav entry and the region home banner from 1 November (owner, 2026-10-23: early November to early December) to a week after Cyber Monday (the page itself is always there). */
export function inSeason(today: string): boolean {
  const y = Number(today.slice(0, 4));
  return today >= `${y}-11-01` && today <= addDays(cyberMonday(y), 7);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const bfCopy = {
  title: (r: Pick<RegionInfo, "inName">, year: number) => `Black Friday MTG deals in ${r.inName} ${year}`,
  h1: (r: Pick<RegionInfo, "inName">) => `Black Friday MTG deals in ${r.inName}`,
  description: (r: Pick<RegionInfo, "inName" | "adjective">, n: number, best: number | null) =>
    n
      ? `${n} Magic sealed products under the median ${r.adjective} store price today, up to ${best}% under, checked about twice a day through Black Friday and Cyber Monday.`
      : `Black Friday and Cyber Monday Magic sealed deals in ${r.inName}: products under the median store price, checked about twice a day.`,
};
