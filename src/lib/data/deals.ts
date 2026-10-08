// owner: WP13
// src/lib/data/deals.ts: C0 STUB (contract 9.3 step 2), the section "deals.ts" of api.ts. Every function below throws until WP13 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
// PAID LOADERS: the body reads `who` through accessOf(feature, who) / viewerOf(who) (plane/entitlement.ts), computes the ranking tier-neutral and cuts it with sliceRanking(feature, who, ranking, q); it never compares a tier itself (premium-gates.ts). tests/plane-no-premium.test.ts scans this file for those names.
import type { Country } from "../country";
import type { Condition } from "../constants";
import type { DealQuery, Entitlement, Sliced } from "./plane/entitlement";

export const BASKET_ID_CHUNK: 40 = 40;
export interface DealRow { uid: number; buyCents: number; marketCents: number; belowCents: number; belowPct: number; storeId: number; source: string; market: Country }
/** R key [deal-rank-v1, ref, country, sort, buyKeysHash]: the FULL ranking from the index columns (ix/k, ix/p, ix/s, ix/f; 1 to 3 ms, about 70 KB), tier-neutral. The slice is cut AFTER `who` is read: anonymous 0 rows, free 3, plus and premium the page;
 *  a below-full viewer is always served the DEFAULT view (refinements coerced, `coerced` true, the API answers 402). Replaces getDealInputs, getStoreMins and getDealRankById. eBay is never in this list. */
export function getDealList(country: Country, q: Partial<DealQuery>, who: Entitlement): Promise<Sliced<DealRow>> { throw new Error("not implemented: WP13"); }
export function getDealCount(country: Country): Promise<number> { throw new Error("not implemented: WP13"); }                           // free: the NUMBER only (the home page, the upsell line): P hm/home.json dealCounts
export interface DealOfferDetail { uid: number; stores: { storeId: number; source: string; priceCents: number; url: string; condition: Condition | null }[]; ebay: { priceCents: number; shippingCents: number | null; url: string; checkedAt: string }[]; tcgplayerUrl: string }
export function getDealOffers(country: Country, uids: readonly number[]): Promise<DealOfferDetail[]> { throw new Error("not implemented: WP13"); }   // <= 25 units: P of/<b>; ebay[] from Neon (EbayBest) when it answers, else []
export type BasketListingTuple = [uid: number, source: string, priceCents: number, condition: number | null, url: string];
export function getBasketListings(country: Country, uids: readonly number[]): Promise<BasketListingTuple[]> { throw new Error("not implemented: WP13"); }   // P of/<b> for <= 40 uids, cheapest 60 per product; freshness by ss/runs.json
