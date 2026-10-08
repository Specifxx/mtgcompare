// owner: WP05
// src/lib/data/ebay.ts: C0 STUB (contract 9.3 step 2), the section "ebay.ts" of api.ts. Every function below throws until WP05 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Country } from "../country";
import type { Finish } from "../constants";
import type { PanelGraded, PanelListing } from "../listing-panel";

export interface EbayPanelBundle { best: { finish: Finish; market: Country; priceCents: number; shipCents: number | null; itemId: string; checkedAt: string }[]; listings: PanelListing[]; graded: PanelGraded[] }   // PanelListing / PanelGraded live in listing-panel.ts (tests/no-ebay-api.test.ts forbids a non-ebay*.ts file importing an ebay*.ts module)
export function getEbayPanel(productId: number): Promise<EbayPanelBundle> { throw new Error("not implemented: WP05"); }                  // N tag EBAY_BANNER_TAG; callers call it ONLY when CardDetail.tracked != 0; an empty bundle when Neon is down
export interface BannerTile { id: number; name: string; image: string | null; cents: number; ship: boolean | null; market: Country; itemId: string; checkedAt: string }
export interface BannerPayloadV1 { v: 1; builtAt: number; tiles: BannerTile[] }                   // <= 100 KB, asserted
export function getChaseBanner(): Promise<BannerPayloadV1 | null> { throw new Error("not implemented: WP05"); }                          // N EbayBanner row; the chase POOL is public (hm/home.json chase), the listings are not; null -> plain affiliate search tiles. getEbayPicks and getChaseStrip are REMOVED
