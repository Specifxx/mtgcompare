// Country / market selection — ported from RiftCompare unchanged in shape: six
// markets, US the default, EU the eurozone as ONE market (anchored to Spain for
// Shopify Markets' ?country= and for eBay). Pure: safe in server and client code.
export type Country = "US" | "AU" | "UK" | "SG" | "CA" | "EU";

export interface CountryInfo {
  code: Country;
  label: string;
  adjective: string;
  place: string;
  flag: string;
  currency: string;
  locale: string;
  symbol: string; // the prefix prices carry: "US$", "A$", "£", "S$", "C$", "€"
}

export const COUNTRIES: Record<Country, CountryInfo> = {
  US: { code: "US", label: "United States", adjective: "US", place: "the United States", flag: "🇺🇸", currency: "USD", locale: "en-US", symbol: "US$" },
  AU: { code: "AU", label: "Australia", adjective: "Australian", place: "Australia", flag: "🇦🇺", currency: "AUD", locale: "en-AU", symbol: "A$" },
  UK: { code: "UK", label: "United Kingdom", adjective: "UK", place: "the United Kingdom", flag: "🇬🇧", currency: "GBP", locale: "en-GB", symbol: "£" },
  SG: { code: "SG", label: "Singapore", adjective: "Singapore", place: "Singapore", flag: "🇸🇬", currency: "SGD", locale: "en-SG", symbol: "S$" },
  CA: { code: "CA", label: "Canada", adjective: "Canadian", place: "Canada", flag: "🇨🇦", currency: "CAD", locale: "en-CA", symbol: "C$" },
  EU: { code: "EU", label: "Europe (EU)", adjective: "European", place: "the EU", flag: "🇪🇺", currency: "EUR", locale: "en-IE", symbol: "€" },
};

export const COUNTRY_LIST: CountryInfo[] = [COUNTRIES.US, COUNTRIES.AU, COUNTRIES.UK, COUNTRIES.SG, COUNTRIES.CA, COUNTRIES.EU];
export const MARKETS: Country[] = COUNTRY_LIST.map((c) => c.code);
export const DEFAULT_COUNTRY: Country = "US";
export const COUNTRY_COOKIE = "country";

const VALID = new Set<Country>(MARKETS);
const EU_ISO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "FI", "FR", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** Any cookie / geo / query value to a supported market. GB → UK; EU members → EU; else US. */
export function normalizeCountry(v: string | undefined | null): Country {
  let up = (v ?? "").toUpperCase();
  if (up === "GB") up = "UK";
  if (VALID.has(up as Country)) return up as Country;
  if (EU_ISO.has(up)) return "EU";
  return "US";
}

export function isCountry(v: unknown): v is Country {
  return typeof v === "string" && VALID.has(v as Country);
}

export function currencyOf(c: Country): string {
  return COUNTRIES[c].currency;
}

/** The ISO country Shopify Markets is asked for (?country=). EU anchors to Spain. */
export function isoCountry(c: Country): string {
  if (c === "UK") return "GB";
  if (c === "EU") return "ES";
  return c;
}

// ── added by the MTG Compare contract (owner WP01a, FROZEN): the market index used by the published offer tuples (formats.ts) ──
export const MARKET_INDEX: Record<Country, 0 | 1 | 2 | 3 | 4 | 5> = { US: 0, AU: 1, UK: 2, SG: 3, CA: 4, EU: 5 };
export const marketFromIndex = (i: number): Country => MARKETS[i] ?? "US";
