// What a product page may show of Amazon, per region: the ASIN's own tagged link (data/amazon/asins-<region>.json, written
// by scripts/amazon-asins.ts in the daily import; ASINs may be stored) and, only while under 24 hours old, the price this
// build fetched from the Creators API (data/amazon-live/<region>.json, git-ignored, never committed: Amazon's licence lets
// a price be kept 24 hours and shown with its time). Read only by the product page, for its pinned Amazon row: never by
// a sort, the best price, deals, alerts, history, the feed, metadata, JSON-LD or the quick view (tests/amazon-api.test.ts).
// The page sits in the CDN for a day, so the browser checks the age again and hides the price past 24 hours
// (components/AmazonPrice.tsx).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { amazonFor, amazonUrl } from "./amazon";
import type { Region } from "./regions";

export interface AmazonLive {
  asin: string;
  /** the item's own tagged /dp/ link */
  url: string;
  /** new, in stock, in the region's currency, cents; absent when this build fetched none */
  cents?: number;
  /** ISO time the price was fetched */
  at?: string;
}
export type AsinFile = Record<string, { asin: string | null; checked: string }>;
export type LiveFile = { fetchedAt: string; prices: Record<string, { asin: string; cents: number }> };

export const asinFile = (region: Region) => path.join(process.cwd(), "data", "amazon", `asins-${region}.json`);
export const liveFile = (region: Region) => path.join(process.cwd(), "data", "amazon-live", `${region}.json`);

export const AMAZON_MAX_AGE_H = 24;
/** Whether a price fetched at `at` may still be shown at `now`. */
export const isFreshAmazonPrice = (at: string | undefined, now = Date.now()) =>
  !!at && Number.isFinite(Date.parse(at)) && now - Date.parse(at) < AMAZON_MAX_AGE_H * 3600_000 && Date.parse(at) <= now + 60_000;

/** The clock an Amazon price's "as of" time is shown in: the region's own. */
export const AMAZON_CLOCK: Partial<Record<Region, { timeZone: string; label: string }>> = {
  au: { timeZone: "Australia/Sydney", label: "Sydney time" },
  us: { timeZone: "America/New_York", label: "New York time" },
  uk: { timeZone: "Europe/London", label: "London time" },
  ca: { timeZone: "America/Toronto", label: "Toronto time" },
  eu: { timeZone: "Europe/Berlin", label: "Berlin time" },
};

const cache = new Map<string, { asins: AsinFile; live: LiveFile | null }>();
function files(region: Region) {
  let c = cache.get(region);
  if (!c) {
    const read = <T,>(f: string): T | null => {
      try {
        return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : null;
      } catch {
        return null;
      }
    };
    c = { asins: read<AsinFile>(asinFile(region)) ?? {}, live: read<LiveFile>(liveFile(region)) };
    cache.set(region, c);
  }
  return c;
}

/** The product's Amazon in the region (its own listing, and this build's price while fresh), or null without a known ASIN. */
export function amazonLiveFor(slug: string, region: Region, now = Date.now()): AmazonLive | null {
  // Only a region's OWN Amazon: NZ and SG link to Amazon Australia as a search, and an AUD price is not a New Zealand price.
  if (!AMAZON_CLOCK[region] || !amazonFor(region)) return null;
  const { asins, live } = files(region);
  const asin = asins[slug]?.asin;
  if (!asin) return null;
  const url = amazonUrl(slug, { region, placement: "amazon-table", asin });
  const l = live && isFreshAmazonPrice(live.fetchedAt, now) ? live.prices[slug] : undefined;
  return l && l.asin === asin ? { asin, url, cents: l.cents, at: live!.fetchedAt } : { asin, url };
}
