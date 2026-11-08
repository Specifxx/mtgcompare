// The free public price file (competitor scan, 2026-11-08; Scryfall's model: free data, credited with a link, is
// how a price site gets used by bots, deck tools and blogs). Served as the static file /prices.json
// (src/app/prices.json/route.ts), built once per deploy from the same feed RiftCompare's alert service reads
// (lib/alert-feed.ts), so no function runs for it and only a release changes it. Store prices only: the
// cheapest in-stock store price per market, in that market's own currency, never eBay, never converted.
import { buildAlertFeed } from "./alert-feed";
import { REGION_LIST } from "./regions";
import { SITE_NAME, SITE_URL } from "./site";

export interface PriceApi {
  version: 1;
  source: string;
  home: string;
  licence: string;
  attribution: { text: string; url: string; html: string };
  generatedAt: string;
  /** market code to ISO 4217 currency */
  currency: Record<string, string>;
  products: { id: string; name: string; prices: Record<string, { cents: number; url: string }> }[];
}

export const PRICE_API_PATH = "/prices.json";

export function attributionHtml(): string {
  return `<a href="${SITE_URL}">Prices from ${SITE_NAME}</a>`;
}

/** `dir` is the public data folder (tests pass a fixture); the route reads the deploy's own data/public. */
export function buildPriceApi(now = new Date(), dir?: string): PriceApi {
  const feed = buildAlertFeed(dir, now);
  const products = Object.entries(feed.items)
    .map(([id, it]) => ({
      id,
      name: it.n,
      prices: Object.fromEntries(Object.entries(it.p).map(([m, cents]) => [m, { cents, url: SITE_URL + it.u.replace("{r}", m.toLowerCase()) }])),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: 1,
    source: SITE_NAME,
    home: SITE_URL,
    licence: `Free for any use, including commercial, if you show a visible link to ${SITE_URL} wherever the prices appear.`,
    attribution: { text: `Prices from ${SITE_NAME}`, url: SITE_URL, html: attributionHtml() },
    generatedAt: now.toISOString(),
    currency: Object.fromEntries(REGION_LIST.map((r) => [r.market, r.currency])),
    products,
  };
}
