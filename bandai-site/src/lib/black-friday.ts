// The Black Friday page (/black-friday): its dates and what it lists. Pure: tests/black-friday.test.ts.
//
// WHAT IT LISTS, AND WHAT IT NEVER SAYS. Today's in-stock store prices under TCGplayer's market price
// (the same deals() the homepage and the Deal Finder use), sealed first, then cards, stores only (eBay and Amazon are never a store). Never a "was"
// price, a countdown, "ends soon" or "limited time": stores set their own sales, and we only know
// what they asked when the prices were last read. The page is always there (one URL that gathers
// links year after year); the homepage links it only in season.

/** Black Friday: the day after the fourth Thursday of November (US Thanksgiving), YYYY-MM-DD. */
export function blackFriday(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - first + 7) % 7);
  return `${year}-11-${String(firstThursday + 22).padStart(2, "0")}`;
}

/** Cyber Monday: three days after Black Friday. */
export function cyberMonday(year: number): string {
  return addDays(blackFriday(year), 3);
}

/** The season the page is about: this year's, or next year's once a week past Cyber Monday. */
export function seasonYear(today: string): number {
  const y = Number(today.slice(0, 4));
  return today > addDays(cyberMonday(y), 7) ? y + 1 : y;
}

/** Whether the homepage links the page: 1 November to a week after Cyber Monday. */
export function inSeason(today: string): boolean {
  const y = Number(today.slice(0, 4));
  return today >= `${y}-11-01` && today <= addDays(cyberMonday(y), 7);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Friday 27 November" */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Split ranked deals into sealed and cards, one row per product (its best saving). */
export function splitDeals<T extends { p: { id: number; kind: string } }>(list: T[], perKind = 24): { sealed: T[]; cards: T[] } {
  const seen = new Set<number>();
  const sealed: T[] = [];
  const cards: T[] = [];
  for (const d of list) {
    if (seen.has(d.p.id)) continue;
    seen.add(d.p.id);
    const into = d.p.kind === "sealed" ? sealed : cards;
    if (into.length < perKind) into.push(d);
  }
  return { sealed, cards };
}
