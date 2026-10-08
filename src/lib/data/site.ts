// owner: WP18
// src/lib/data/site.ts: C0 STUB (contract 9.3 step 2), the section "site.ts" of api.ts. Every function below throws until WP18 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { HomeStats } from "../home";
import type { PromoStatus } from "../launch-promo-shared";

export interface SiteStats { lastImportAt: string | null; storeOffers: { source: string; market: string; offers: number; inStock: number }[]; ebayLive: boolean }   // ebayLive is the one Neon bit (ImportRun kind "ebay" within 3 days); false when Neon is down
export function getSiteStats(): Promise<SiteStats> { throw new Error("not implemented: WP18"); }                                           // P status.json + ss/runs.json
export function getHomeStats(): Promise<HomeStats> { throw new Error("not implemented: WP18"); }                                          // P hm/home.json + ss/runs.json
export const MIN_REVIEWS_TO_DISPLAY: 3 = 3;
export interface PublicReview { id: string; rating: number | null; message: string; displayName: string | null }
export function getApprovedReviews(limit?: number): Promise<PublicReview[]> { throw new Error("not implemented: WP18"); }                // N; [] on any error. Never widen the select to `email`
export function getLaunchPromo(): Promise<PromoStatus> { throw new Error("not implemented: WP18"); }                                       // N Counter launch-promo; { left: 0 } when Neon is down
