// Region-home SEO helpers — RiftCompare's lib/seo.ts, the parts MTG Compare
// uses: the six region-home paths, their reciprocal hreflang map and the home
// titles/descriptions. Pure (no next/headers), so client code may import
// REGION_HOME_PATH.
import { SITE_URL } from "./site";
import { COUNTRIES, type Country } from "./country";

// The blog posts that answer "where do I buy Magic cards in <market>" best,
// linked from each region home's "Buying Magic cards in <place>" block. There
// is one where-to-buy guide and one cheaper-abroad guide covering every market,
// so each market points at the same pair (REQ-WP15-5 asks the editorial package
// to publish the guides under these slugs).
export const COUNTRY_GUIDE_SLUGS: Record<Country, string> = {
  US: "where-to-buy-magic-cards",
  UK: "where-to-buy-magic-cards",
  AU: "where-to-buy-magic-cards",
  CA: "where-to-buy-magic-cards",
  SG: "where-to-buy-magic-cards",
  EU: "where-to-buy-magic-cards",
};
export const CHEAPER_ABROAD_SLUG = "are-magic-cards-cheaper-abroad";

// BCP 47 tags per market. EU is not a country, so it fans out to the eurozone's
// largest English-reading audiences (RiftCompare's EU_HREFLANG_COUNTRIES).
const HREFLANG: Record<Country, string> = {
  US: "en-US",
  UK: "en-GB",
  AU: "en-AU",
  CA: "en-CA",
  SG: "en-SG",
  EU: "en",
};
export const EU_HREFLANG_COUNTRIES = ["IE", "DE", "FR", "NL", "BE", "ES", "IT", "AT", "PL", "SE", "DK", "FI", "PT"] as const;

function hreflangTags(country: Country): string[] {
  if (country === "EU") return EU_HREFLANG_COUNTRIES.map((c) => `en-${c}`);
  if (country === "US") return ["en-US", "en"];
  return [HREFLANG[country]];
}

// The six region homes: "/" is the US (and x-default); the others lock their
// hero to one market. CountryHeroToggle routes here; CountryProvider sends a
// visitor with a stored market to their own region home.
export const REGION_HOME_PATH: Record<Country, string> = {
  US: "/",
  UK: "/uk",
  AU: "/au",
  CA: "/ca",
  SG: "/sg",
  EU: "/eu",
};

/** Reciprocal hreflang for every region home, "/" as x-default. */
export function regionHomeHreflang(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [country, path] of Object.entries(REGION_HOME_PATH) as [Country, string][]) {
    for (const tag of hreflangTags(country)) map[tag] = `${SITE_URL}${path === "/" ? "" : path}`;
  }
  map["x-default"] = SITE_URL;
  return map;
}

const TITLE_PLACE: Record<Exclude<Country, "US">, string> = {
  AU: "Australia",
  UK: "UK",
  SG: "Singapore",
  CA: "Canada",
  EU: "Europe",
};

// Google truncates near 60 characters: the first candidate that fits wins.
const TITLE_MAX = 60;
const firstFit = (candidates: string[]) => candidates.find((t) => t.length <= TITLE_MAX) ?? candidates[candidates.length - 1];

// eBay is named in the home copy only while its Browse API is switched on
// (`ebayLive`, from getSiteStats): until then eBay is a search link, not a
// price we compare, and the title must not claim otherwise.
export function homeTitle(liveStores: number | null | undefined, ebayLive = false): string {
  const n = liveStores && liveStores > 0 ? liveStores : null;
  const e = ebayLive ? " + eBay" : "";
  return firstFit([
    ...(n ? [`MTG Card Prices: Live Price Guide, ${n} Stores${e}`, `MTG Card Prices: ${n} Stores${e}, Updated Daily`] : []),
    `MTG Card Prices: Live Price Guide, Stores${e}`,
  ]);
}

export function regionHomeTitle(region: Exclude<Country, "US">, liveStores: number | null | undefined): string {
  const n = liveStores && liveStores > 0 ? liveStores : null;
  const place = TITLE_PLACE[region];
  return firstFit([
    ...(n ? [`MTG Card Prices ${place}: Compare ${n} ${region} Stores`] : []),
    `MTG Card Prices ${place}: Compare ${region} Stores`,
    `MTG Card Prices ${place}`,
  ]);
}

export function homeDescription(cards: number | null | undefined, liveStores: number | null | undefined, ebayLive = false): string {
  const c = cards && cards > 0 ? `${cards.toLocaleString("en-US")} cards` : "every card";
  const s = liveStores && liveStores > 0 ? `${liveStores} stores` : "tracked stores";
  return `Compare Magic: The Gathering prices for ${c} across ${s}${ebayLive ? " + eBay" : ""} — price check any card across six markets, cheapest first. Updated daily.`;
}

export function regionHomeDescription(region: Exclude<Country, "US">, cards: number | null | undefined, liveStores: number | null | undefined): string {
  const info = COUNTRIES[region];
  const c = cards && cards > 0 ? `${cards.toLocaleString("en-US")} cards` : "every card";
  const s = liveStores && liveStores > 0 ? `${liveStores} ${info.adjective} stores` : `tracked ${info.adjective} stores`;
  return `Compare Magic: The Gathering prices in ${info.place}: ${c} across ${s} in ${info.currency}, cheapest first. Updated daily.`;
}

export function homeSocialTitle(liveStores: number | null | undefined, ebayLive = false): string {
  const n = liveStores && liveStores > 0 ? liveStores : null;
  return n ? `MTG Compare: Magic prices across ${n} stores${ebayLive ? " + eBay" : ""}` : "MTG Compare: Magic: The Gathering prices, compared";
}

export function homeSocialDescription(liveStores: number | null | undefined, ebayLive = false): string {
  const s = liveStores && liveStores > 0 ? `${liveStores} stores` : "the stores we track";
  return `Compare Magic: The Gathering card and sealed prices across ${s}${ebayLive ? " and eBay" : ""} in six markets, cheapest first.`;
}

/**
 * The title of a blog post for a feed or a teaser. `Post.title` takes the catalogue today (`cat.pricesAt` puts the month in a title)
 * and a smaller context once the editorial package has rewritten the posts (REQ-WP15-5): this adapter hands over the one field titles
 * read, and feeds, the news sitemap and the editorial band no longer need a catalogue to print a headline.
 */
export function postTitle(post: { title: (ctx: never) => string }, pricesAt: string | null | undefined): string {
  return post.title({ cat: { pricesAt: pricesAt || new Date().toISOString() } } as never);
}
