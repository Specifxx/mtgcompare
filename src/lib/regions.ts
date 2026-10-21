// The markets DexCompare compares within. A market is a region whose stores
// all charge in ONE currency, so "cheapest" is always a like-for-like number a
// buyer there is actually offered. Pure module: safe in client components
// (notFound() from next/navigation is itself usable on either side).
//
// EU is the eurozone as one market (one currency, one customs union), not a
// country. The other codes are ISO 3166 except UK (ISO: GB).
//
// Which eBay site a region's links go to is affiliate.ts's EBAY_FOR_REGION
// (NZ → ebay.com.au, SG → ebay.com: neither has an EPN program of its own).

import { notFound } from "next/navigation";

export type Region = "au" | "nz" | "us" | "uk" | "ca" | "eu" | "sg";
export type Market = Uppercase<Region>;

export interface RegionInfo {
  region: Region;
  market: Market;
  name: string; // "Australia"
  // The region as it reads after "in" in a title, an H1 or a sentence: "in Australia", "in the US", "in the UK", "in Europe".
  // `name` ("United States", "Europe (eurozone)") is the formal label for switchers and tables; this is the one people search.
  inName: string;
  short: string; // "AU"
  adjective: string; // "Australian"
  flag: string;
  currency: string; // ISO 4217
  locale: string; // for number formatting
  // Shopify Markets `?country=` value that asks a store for its price in this
  // market. null = don't send one (EU stores price in EUR by default).
  shopifyCountry: string | null;
  // hreflang for alternates between regional copies of the same page.
  hreflang: string;
}

export const REGIONS: Record<Region, RegionInfo> = {
  au: { region: "au", market: "AU", name: "Australia", inName: "Australia", short: "AU", adjective: "Australian", flag: "🇦🇺", currency: "AUD", locale: "en-AU", shopifyCountry: "AU", hreflang: "en-AU" },
  nz: { region: "nz", market: "NZ", name: "New Zealand", inName: "New Zealand", short: "NZ", adjective: "New Zealand", flag: "🇳🇿", currency: "NZD", locale: "en-NZ", shopifyCountry: "NZ", hreflang: "en-NZ" },
  us: { region: "us", market: "US", name: "United States", inName: "the US", short: "US", adjective: "US", flag: "🇺🇸", currency: "USD", locale: "en-US", shopifyCountry: "US", hreflang: "en-US" },
  uk: { region: "uk", market: "UK", name: "United Kingdom", inName: "the UK", short: "UK", adjective: "UK", flag: "🇬🇧", currency: "GBP", locale: "en-GB", shopifyCountry: "GB", hreflang: "en-GB" },
  ca: { region: "ca", market: "CA", name: "Canada", inName: "Canada", short: "CA", adjective: "Canadian", flag: "🇨🇦", currency: "CAD", locale: "en-CA", shopifyCountry: "CA", hreflang: "en-CA" },
  eu: { region: "eu", market: "EU", name: "Europe (eurozone)", inName: "Europe", short: "EU", adjective: "European", flag: "🇪🇺", currency: "EUR", locale: "en-IE", shopifyCountry: null, hreflang: "en-IE" },
  sg: { region: "sg", market: "SG", name: "Singapore", inName: "Singapore", short: "SG", adjective: "Singapore", flag: "🇸🇬", currency: "SGD", locale: "en-SG", shopifyCountry: "SG", hreflang: "en-SG" },
};

export const REGION_LIST: RegionInfo[] = ["au", "us", "uk", "ca", "nz", "eu", "sg"].map((r) => REGIONS[r as Region]);

// The region hreflang="x-default" points at: the one a searcher whose language
// or country matches none of the seven should land on. US: the biggest English
// market and the only one with a marketplace, so it is rarely thin.
export const X_DEFAULT_REGION: Region = "us";

/** Exact, lowercase match only: "AU" and "Au" are not regions (the redirect in middleware.ts lowercases them). */
export function isRegion(v: string | null | undefined): v is Region {
  return !!v && Object.prototype.hasOwnProperty.call(REGIONS, v);
}

/**
 * The region for a [region] route param, or the 404 page. Every page and
 * generateMetadata under /[region] starts with this instead of REGIONS[param]:
 * a page's own code runs whether or not its layout called notFound(), and
 * REGIONS["foo"].market was how /terms and /AU used to answer 500.
 */
export function regionOrNotFound(v: string | null | undefined): RegionInfo {
  if (!isRegion(v)) notFound();
  return REGIONS[v];
}

/**
 * Which of the regions a page advertises should be its x-default: US when it
 * is among them, otherwise the first. Never a region the page is not
 * indexable in — an x-default that lands on a noindex page is worse than none.
 */
export function xDefaultRegion(advertised: readonly Region[]): Region {
  if (!advertised.length) return X_DEFAULT_REGION;
  return advertised.includes(X_DEFAULT_REGION) ? X_DEFAULT_REGION : advertised[0];
}

export function regionOfMarket(market: string): RegionInfo | null {
  const r = market.toLowerCase();
  return isRegion(r) ? REGIONS[r] : null;
}

export function currencyOfMarket(market: string): string | null {
  return regionOfMarket(market)?.currency ?? null;
}

/**
 * Guess a visitor's region from their browser time zone. Used only to SUGGEST a
 * region on the landing page; nothing redirects on it.
 */
export function regionFromTimeZone(tz: string | undefined | null): Region | null {
  if (!tz) return null;
  if (/^Australia\//.test(tz)) return "au";
  if (/^Pacific\/(Auckland|Chatham)$/.test(tz)) return "nz";
  if (/^Europe\/London$|^Europe\/Belfast$/.test(tz)) return "uk";
  if (/^Asia\/Singapore$/.test(tz)) return "sg";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife)$/.test(tz)) return "ca";
  if (/^America\//.test(tz) || /^US\//.test(tz) || tz === "Pacific/Honolulu") return "us";
  if (/^Europe\//.test(tz)) return "eu";
  return null;
}
