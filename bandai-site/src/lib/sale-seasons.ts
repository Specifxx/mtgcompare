// The seasonal sale pages (/boxing-day, /january-sales, /lunar-new-year and, where a site
// turns it on, /valentines-day): their dates, which year a page is about, when the homepage
// links it, and the region-neutral sentence that opens each page. PURE: tests/sale-seasons.test.ts.
//
// Same rules as the Black Friday page (DECISIONS.md, "Seasonal sale pages", 2026-11-02): one URL
// per event, kept every year, so links and rankings carry over; built 3+ weeks ahead so Google
// has indexed it before the day. Each page lists the SAME real deals as the site's Black Friday
// page, from that day's prices. Never a "was" price, a countdown, "ends soon" or an invented sale.
// The wording names every region the site covers, never just one country.

export type SaleSlug = "boxing-day" | "january-sales" | "lunar-new-year" | "valentines-day";

export interface SaleSeason {
  slug: SaleSlug;
  /** "Boxing Day" */
  name: string;
  /** The words a search uses: "Boxing Day sales". */
  searchName: string;
  /** Short homepage / footer link label. */
  linkLabel: string;
}

export const SALE_SEASONS: Record<SaleSlug, SaleSeason> = {
  "boxing-day": { slug: "boxing-day", name: "Boxing Day", searchName: "Boxing Day sales", linkLabel: "Boxing Day deals" },
  "january-sales": { slug: "january-sales", name: "January sales", searchName: "January sales", linkLabel: "January sales" },
  "lunar-new-year": { slug: "lunar-new-year", name: "Lunar New Year", searchName: "Lunar New Year sales", linkLabel: "Lunar New Year deals" },
  "valentines-day": { slug: "valentines-day", name: "Valentine's Day", searchName: "Valentine's Day gifts", linkLabel: "Valentine's Day gifts" },
};

/** The three every site carries; Valentine's Day only where a site lists it too. */
export const CORE_SALES: SaleSlug[] = ["boxing-day", "january-sales", "lunar-new-year"];

// Lunar New Year (the first day of the first lunar month), from the published Chinese calendar.
const LUNAR_NEW_YEAR: Record<number, string> = {
  2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03",
  2031: "2031-01-23", 2032: "2032-02-11", 2033: "2033-01-31", 2034: "2034-02-19", 2035: "2035-02-08",
  2036: "2036-01-28", 2037: "2037-02-15", 2038: "2038-02-04", 2039: "2039-01-24", 2040: "2040-02-12",
};
const ANIMALS = ["Monkey", "Rooster", "Dog", "Pig", "Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat"];

/** "Goat" for 2027. */
export function zodiacAnimal(year: number): string {
  return ANIMALS[((year % 12) + 12) % 12];
}

/** First and last day of the event in `year`, YYYY-MM-DD. Null when the date is not known (Lunar New Year past 2040). */
export function saleDates(slug: SaleSlug, year: number): { start: string; end: string } | null {
  switch (slug) {
    case "boxing-day":
      return { start: `${year}-12-26`, end: `${year}-12-26` };
    case "january-sales":
      return { start: `${year}-01-01`, end: `${year}-01-31` };
    case "lunar-new-year": {
      const d = LUNAR_NEW_YEAR[year];
      return d ? { start: d, end: d } : null;
    }
    case "valentines-day":
      return { start: `${year}-02-14`, end: `${year}-02-14` };
  }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The year the page is about: the next one, or the one just gone until a week after it ends. */
export function saleYear(slug: SaleSlug, today: string): number {
  const y = Number(today.slice(0, 4));
  for (const year of [y - 1, y, y + 1]) {
    const d = saleDates(slug, year);
    if (d && today <= addDays(d.end, 7)) return year;
  }
  return y + 1;
}

/** How many days before the start the homepage starts linking the page. */
const LEAD_DAYS: Record<SaleSlug, number> = { "boxing-day": 25, "january-sales": 12, "lunar-new-year": 28, "valentines-day": 28 };

/** Whether the homepage links the page today: a few weeks before it starts until two days after it ends. The page itself is always there. */
export function saleInSeason(slug: SaleSlug, today: string): boolean {
  const d = saleDates(slug, saleYear(slug, today));
  if (!d) return false;
  return today >= addDays(d.start, -LEAD_DAYS[slug]) && today <= addDays(d.end, 2);
}

/** The pages the homepage should link today, soonest first. */
export function salesInSeason(slugs: readonly SaleSlug[], today: string): SaleSeason[] {
  return slugs
    .filter((s) => saleInSeason(s, today))
    .sort((a, b) => (saleDates(a, saleYear(a, today))?.start ?? "").localeCompare(saleDates(b, saleYear(b, today))?.start ?? ""))
    .map((s) => SALE_SEASONS[s]);
}

/** "Saturday 26 December 2026" */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${weekday} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** Page title stem: "Boxing Day deals 2026", "January sales 2027", "Lunar New Year deals 2027", "Valentine's Day gifts 2027". */
export function saleHeading(slug: SaleSlug, year: number): string {
  return `${SALE_SEASONS[slug].linkLabel} ${year}`;
}

/**
 * The page's first sentence: facts about the day, naming every region it matters in. `regions` is
 * what the site covers, in words ("Australia, the UK and the US"), so no page reads as one country's.
 */
export function saleIntro(slug: SaleSlug, year: number, regions: string): string {
  const d = saleDates(slug, year);
  const day = d ? longDate(d.start) : "";
  switch (slug) {
    case "boxing-day":
      return `Boxing Day is ${day}: the biggest sale day of the year in Australia, New Zealand, the UK and Canada, and stores in other countries run end-of-year sales the same week. Here are today's deals across ${regions}.`;
    case "january-sales":
      return `The January sales run from New Year's Day through the end of January ${year}, when stores clear what is left after Christmas. Here are today's deals across ${regions}.`;
    case "lunar-new-year":
      return `Lunar New Year is ${day}, the start of the Year of the ${zodiacAnimal(year)}. Stores in Singapore and across Asia, and many elsewhere, run sales around it. Here are today's deals across ${regions}.`;
    case "valentines-day":
      return `Valentine's Day is ${day}. Order a week or two ahead so a gift arrives in time. Here are today's deals across ${regions}.`;
  }
}

/** "Australia, the UK and the US" */
export function listRegions(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
