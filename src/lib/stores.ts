// src/lib/stores.ts (owner WP04; THE IDENTITY BRIDGE IS FROZEN BY THE CONTRACT, the bodies and the registry are WP04's).
// Critique 4: an offer row says WHICH store with a small integer; every consumer (getCardDetail, readLiveOffers, deal loaders, alerts) turns (storeId, market, path) into `source: "store:<key>"` and an absolute URL, so the
// bridge must exist before the first loader is written. OP's StoreInfo had no id. Here every store has a HAND-ASSIGNED, NEVER-REUSED id.
import type { Country } from "./country";
import { STORE_ID } from "./constants";

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
export declare const STORES: readonly StoreInfo[];
/** KEPT from OP with its signatures (13 packages import them): the registry lookups and the source-label helpers. WP04 keeps the OP bodies and updates them for `store:<key>` sources and the eBay display block. */
export declare const STORE_BY_KEY: Record<string, StoreInfo>;
export declare const STORE_POSTAGE_CHECKED: string;
export declare function platformOf(store: Pick<StoreInfo, "platform">): StorePlatform;
export declare function storesIn(country: Country): StoreInfo[];
export declare function isStoreSource(source: string): boolean;
export declare function storeForSource(source: string): StoreInfo | null;
export declare function isEbaySource(source: string): boolean;
export declare function sourceLabel(source: string, market?: string): string;
export declare const RETIRED_STORE_IDS: readonly number[];
export declare function storeById(id: number): StoreInfo | undefined;
export declare function storeByKey(key: string): StoreInfo | undefined;
/** `source: "store:<key>"` of an offer row (what OP's sourceLabel / storeForSource / isEbaySource already understand); "tcgplayer" for STORE_ID.TCGPLAYER_VIRTUAL. */
export declare function sourceOfStoreId(id: number): string | null;
/** The absolute buy URL of an offer: the store's origin plus the stored path, with OP's `?country=` rule for a store read in another market. null for an unknown id (a retired store) so the row is dropped, never rendered broken. */
export declare function offerUrl(storeId: number, market: Country, path: string): string | null;
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
