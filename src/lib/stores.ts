// src/lib/stores.ts (owner WP04; THE IDENTITY BRIDGE IS FROZEN BY THE CONTRACT, the bodies and the registry are WP04's).
// Critique 4: an offer row says WHICH store with a small integer; every consumer (getCardDetail, readLiveOffers, deal loaders, alerts) turns (storeId, market, path) into `source: "store:<key>"` and an absolute URL, so the
// bridge must exist before the first loader is written. OP's StoreInfo had no id. Here every store has a HAND-ASSIGNED, NEVER-REUSED id.
import { isoCountry, type Country } from "./country";
import { STORE_ID } from "./constants";
import { SEED_STORES } from "./store-registry-seed";

export type StorePlatform = "shopify" | "shadowpos" | "ecwid" | "woocommerce" | "bigcommerce" | "nopcommerce" | "feed";
export type StoreStatus = "verified" | "unverified";
export interface StoreInfo {
  /** Hand-assigned, >= STORE_ID.REGISTRY_MIN (10), unique, append-only, NEVER reused after a store is removed (add it to RETIRED_STORE_IDS). Public feeds use STORE_ID.FEED_BASE.. (8 Card Kingdom, 9 Mana Pool). */
  id: number;
  key: string;
  name: string;
  base: string;                       // origin, no trailing slash
  country: Country;
  collections: string[];
  currency?: string;                  // only where the storefront charges something other than its market's currency (mythicstore, cgrealm, chonkycollectibles: CAD)
  shippingCents?: number;
  freeOverCents?: number;
  policyUrl?: string;
  platform?: StorePlatform;           // omitted = "shopify"
  ecwidStoreId?: number;
  /** Stores whose bare title means foil (explicitFoil) vs nonfoil. The matcher never infers a finish from the headline (C2). */
  explicitFoil?: boolean;
  status: StoreStatus;                // every seed store is "unverified" until the first production probe admits it (10.26)
  verifiedAt?: string;
  maxPages?: number;
}
/** The public price feeds, ids 8 and 9 (contract 10.11). Their adapters live in store-import.ts and are OFF: FEED_SOURCES (a GitHub Actions variable) is empty until the owner has the terms in writing. */
const FEEDS: readonly StoreInfo[] = [
  { id: STORE_ID.FEED_BASE, key: "cardkingdom", name: "Card Kingdom", base: "https://www.cardkingdom.com", country: "US", collections: [], platform: "feed", status: "unverified" },
  { id: STORE_ID.FEED_BASE + 1, key: "manapool", name: "Mana Pool", base: "https://manapool.com", country: "US", collections: [], platform: "feed", status: "unverified" },
];

export const STORES: readonly StoreInfo[] = [...FEEDS, ...SEED_STORES];
export const STORE_BY_KEY: Record<string, StoreInfo> = Object.fromEntries(STORES.map((s) => [s.key, s]));
const BY_ID: ReadonlyMap<number, StoreInfo> = new Map(STORES.map((s) => [s.id, s]));
/** The date the registry (not the postage) was last reviewed; the postage of each store is measured by the shipping probe (shipping-rates.json carries its own dates). */
export const STORE_POSTAGE_CHECKED = "2026-10-08";
/** Ids that were once a store and are gone. Never reused (tests/store-ids.test.ts). Empty at launch. */
export const RETIRED_STORE_IDS: readonly number[] = [];

export function platformOf(store: Pick<StoreInfo, "platform">): StorePlatform {
  return store.platform ?? "shopify";
}

export function storesIn(country: Country): StoreInfo[] {
  return STORES.filter((s) => s.country === country);
}

/** The feeds the importer may read: the keys in FEED_SOURCES ("cardkingdom,manapool"). Empty = both off (10.11). */
export function enabledFeeds(env: Record<string, string | undefined> = process.env): StoreInfo[] {
  const on = new Set((env.FEED_SOURCES ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean));
  return FEEDS.filter((f) => on.has(f.key));
}

/** A row every "N stores" count counts: each tracked store and TCGplayer (as RiftCompare counts every in-stock seller in the comparison), never eBay (eBay rows are never counted as a store). */
export function isStoreSource(source: string): boolean {
  return !source.startsWith("ebay");
}

/** "store:ggmorley" -> the store; "tcgplayer" -> null. */
export function storeForSource(source: string): StoreInfo | null {
  return source.startsWith("store:") ? STORE_BY_KEY[source.slice(6)] ?? null : null;
}

/** eBay rows: `ebay` is the market's own eBay; `ebay_us` is a CA row derived from the US search. */
export function isEbaySource(source: string): boolean {
  return source === "ebay" || source === "ebay_us";
}

const EBAY_SITE_LABEL: Record<Country, string> = { US: "eBay", AU: "eBay Australia", UK: "eBay UK", SG: "eBay", CA: "eBay Canada", EU: "eBay Spain" };

export function sourceLabel(source: string, market?: string): string {
  if (source === "tcgplayer") return "TCGplayer";
  if (source === "ebay_us") return "eBay US";
  if (source === "ebay") return EBAY_SITE_LABEL[market as Country] ?? "eBay";
  return storeForSource(source)?.name ?? source.replace(/^store:/, "");
}

export function storeById(id: number): StoreInfo | undefined {
  return BY_ID.get(id);
}
export function storeByKey(key: string): StoreInfo | undefined {
  return STORE_BY_KEY[key];
}
export function sourceOfStoreId(id: number): string | null {
  if (id === STORE_ID.TCGPLAYER_VIRTUAL) return "tcgplayer";
  const s = BY_ID.get(id);
  return s ? `store:${s.key}` : null;
}
/** The buy URL: the store's origin plus the stored path. A Shopify store read in a market other than its own asks for that market's price with `?country=` (Shopify Markets prices per visitor country). */
export function offerUrl(storeId: number, market: Country, path: string): string | null {
  const s = BY_ID.get(storeId);
  if (!s || typeof path !== "string") return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (market === s.country || platformOf(s) !== "shopify") return `${s.base}${p}`;
  return `${s.base}${p}${p.includes("?") ? "&" : "?"}country=${isoCountry(market)}`;
}
export const isRegistryStoreId = (id: number): boolean => id >= STORE_ID.REGISTRY_MIN && id <= STORE_ID.MAX;

/** What the importer records per store and per run (ImportSummaryV1.stores[]): OP's StoreResult, unchanged in shape. */
export interface StoreResult {
  key: string;
  country: Country;
  platform: StorePlatform;
  products: number;
  cards: number;
  sealed: number;
  inStock: number;
  failed: boolean;
  skipped?: string;
  note?: string;
  /** reason -> count (the matcher's miss reasons). */
  misses: Record<string, number>;
  /** NEW: listings matched this run; a read whose matched count falls under 50% of the previous run's is a FAILED read (rows untouched, freshness not advanced; critique budget 4.5). */
  matched?: number;
  /** NEW: duplicate (store, product, finish) keys collapsed by the one-row-per-key rule (in stock first, best condition, lowest price, lowest path). */
  duplicatesCollapsed?: number;
}
