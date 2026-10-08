// owner: WP09
// src/lib/data/sealed.ts: C0 STUB (contract 9.3 step 2), the section "sealed.ts" of api.ts. Every function below throws until WP09 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Country } from "../country";
import type { SealedKind } from "../constants";
import type { OfferRow } from "./types";

export interface SealedLite { id: number; slug: string; name: string; setId: number | null; kind: SealedKind; packCount: number | null; releasedOn: string | null; presale: boolean; marketUsd: number | null; lowTcg: number | null; low: Record<Country, number | null>; stores: Record<Country, number>; change7d: number | null }   // imageUrl and tcgplayerUrl are DERIVED from id (images.ts, constants.ts)
export interface SealedDetail extends SealedLite { contents: string | null; offers: OfferRow[] }   // finish is always "N"; offers = store/feed rows + the synthesised TCGplayer row
export interface SealedQuery { kind?: SealedKind; setId?: number; presale?: boolean; q?: string; sort: "value" | "price-asc" | "price-desc" | "newest" | "name"; page: number; per: 24 | 48 | 100 }
export function getSealedPage(q: Partial<SealedQuery>): Promise<{ total: number; pages: number; page: number; items: SealedLite[] }> { throw new Error("not implemented: WP09"); }   // P sl/list-<k> (2 chunks, 330 KB each) filtered in memory (M). OP's getSealedCatalog is REMOVED
export function getSealedBySet(setId: number): Promise<SealedLite[]> { throw new Error("not implemented: WP09"); }                       // <= 200 rows (Secret Lair Drop: 1,077 -> 200 + total)
export function getSealedByIds(ids: readonly number[]): Promise<Map<number, SealedLite>> { throw new Error("not implemented: WP09"); }
export function getSealedDetail(slug: string): Promise<SealedDetail | null> { throw new Error("not implemented: WP09"); }                 // P slug/<h> (sealed part) -> sl/d/<fnv1a32(slug) % 64>.json
export function getSealedSoldOut(): Promise<Record<Country, number[]>> { throw new Error("not implemented: WP09"); }                      // P sl/list: GONE and no in-stock offer, per market
