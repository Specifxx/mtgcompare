// The store registry: every store DexCompare reads, with the collections that
// hold its Pokémon sealed stock. Lives in src/data/stores.json so the probe
// (scripts/probe-stores.ts) can regenerate it and a human can edit it.
//
// A store is only listed after the probe has read it live and found Pokémon
// sealed product priced in the market's own currency. See README.md, "Adding a
// store".
import raw from "@/data/stores.json";
import { regionOfMarket, type Market } from "./regions";

export interface StoreConfig {
  key: string; // stable URL key: /<region>/stores/<key>
  name: string;
  base: string; // https origin, no trailing slash
  market: Market;
  platform: "shopify" | "woocommerce" | "tcgplayer";
  // ISO country sent as Shopify's ?country= so a Markets-enabled store prices
  // in its own currency (see shopifyMeta in feeds.ts). The shop's home country
  // from /meta.json; for EU stores it is the store's own eurozone country.
  country: string;
  // Shopify collection handles / WooCommerce category slugs to read, best first.
  // Non-Pokémon collections (e.g. "pre-orders") are read strictly: a title
  // there must say "Pokémon" outright.
  collections: string[];
}

// The independent stores: what every "N stores" claim, the store directory and
// the sitemap count. Marketplaces are not stores and are never in this list.
export const STORES: StoreConfig[] = (raw as StoreConfig[]).slice().sort((a, b) => a.name.localeCompare(b.name));

// TCGplayer: a US marketplace read through its public search API
// (src/lib/tcgplayer.ts). Its offers live in the US market alongside the
// stores' and rank on the same terms (price, then stock); its links are
// affiliate-tagged at render time (src/lib/affiliate.ts).
export const TCGPLAYER: StoreConfig = {
  key: "tcgplayer",
  name: "TCGplayer",
  base: "https://www.tcgplayer.com",
  market: "US",
  platform: "tcgplayer",
  country: "US",
  collections: [],
};

/** Everything the importer reads: the stores, then the marketplaces. */
export const SOURCES: StoreConfig[] = [...STORES, TCGPLAYER];
export const STORE_BY_KEY = new Map(SOURCES.map((s) => [s.key, s]));

export function isMarketplace(s: Pick<StoreConfig, "platform">): boolean {
  return s.platform === "tcgplayer";
}

export function storesInMarket(market: string): StoreConfig[] {
  return STORES.filter((s) => s.market === market);
}

/** The currency a store charges in: its market's. The probe verified it; the importer re-checks it. */
export function storeCurrency(s: StoreConfig): string {
  return regionOfMarket(s.market)!.currency;
}

export function storeHost(s: StoreConfig): string {
  return s.base.replace(/^https?:\/\/(www\.)?/, "");
}
