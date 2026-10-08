// owner: WP02
// src/lib/data/catalog.ts: C0 STUB (contract 9.3 step 2), the section "catalog.ts" of api.ts. Every function below throws until WP02 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Catalog, CardDetail, CardLite, CardLookup, CardMini, CatalogStats, OracleDetail, OracleMini, ScrySetLite, SetIndex, SetLite } from "./types";
import type { BrowseIndex } from "./plane/browse-index";

export function getSets(): Promise<SetLite[]> { throw new Error("not implemented: WP02"); }                                               // P meta/sets.json (439 x 150 B = 66 KB)
export function getScrySets(): Promise<Record<string, ScrySetLite>> { throw new Error("not implemented: WP02"); }                         // P meta/scrysets.json
export function getSetIndex(): Promise<SetIndex> { throw new Error("not implemented: WP02"); }                                            // M maps over getSets()
export function getSetBySlug(slug: string): Promise<SetLite | null> { throw new Error("not implemented: WP02"); }
export function getSetByCode(code: string): Promise<SetLite | null> { throw new Error("not implemented: WP02"); }                       // accepts Set.tok, Set.code, Set.scry, case-insensitive
export function getCatalogStats(): Promise<CatalogStats> { throw new Error("not implemented: WP02"); }                                    // P status.json counts + meta/sets.json
/** P slug/<h> -> cat/<b>, px/<b> (+ un/<b>, of/<b> when the mask says tracked) + or/<n> + meta/sets + ss/runs: 6 to 8 files, 139 KB median cold. null for an unknown slug; a miss is never cached. Works for unlisted rows. */
export function getCardDetail(slug: string): Promise<CardDetail | null> { throw new Error("not implemented: WP02"); }
export function getOracleBySlug(slug: string): Promise<OracleDetail | null> { throw new Error("not implemented: WP02"); }                   // P slug/<h> (oracle part) -> or/<no % 512>; about 0.5 KB
export function getOraclePrintings(oracleNo: number, page?: number, per?: 24 | 48): Promise<{ total: number; items: CardMini[] }> { throw new Error("not implemented: WP02"); }   // M engine: cls 0 and LISTED, marketUsd desc, nulls last
export function getSetHighlights(setId: number, n?: number): Promise<CardMini[]> { throw new Error("not implemented: WP02"); }           // P st/<setId>.json; n <= 12
/** Fan-in by bucket: P cat/px (+ un) of the distinct buckets (floor(id / 256)); more than 9 buckets reads the browse index (M). Misses are absent from the map. <= 2,000 ids. Per-user class: /api/* and account pages. */
export function getCardsByIds(ids: readonly number[], opts?: { stores?: boolean }): Promise<Map<number, CardLite>> { throw new Error("not implemented: WP02"); }
export function getCardLookup(q: { ids?: readonly number[]; slugs?: readonly string[] }): Promise<CardLookup> { throw new Error("not implemented: WP02"); }   // <= 500 ids + 500 slugs; never throws on a miss
export function resolveOracles(nameKeys: readonly string[]): Promise<Map<string, OracleMini>> { throw new Error("not implemented: WP02"); }   // P nm/<k> (the hot chunk first), <= 300 keys
export function resolveBySetNumber(pairs: readonly { set: string; number: string }[]): Promise<Map<string, CardLite[]>> { throw new Error("not implemented: WP02"); }   // P sc/<h> then cat/px; key "<sc>|<nkey>"; 1 to 3 cards per pair
export function cardExists(ids: readonly number[]): Promise<Set<number>> { throw new Error("not implemented: WP02"); }                    // P cat/<b> for the buckets meta/buckets.json lists (an unknown id costs no request): user-state validation, replaces a foreign key
export function sealedExists(ids: readonly number[]): Promise<Set<number>> { throw new Error("not implemented: WP02"); }                  // P sl/list-<k>
/** Server-only: the typed-array engine, one per instance and ref (M). The replacement for every "scan cat.cards" caller. Resolve it BEFORE a closure that an unstable_cache wraps. */
export function getBrowseIndex(o?: { withStores?: boolean; withOracle?: boolean }): Promise<BrowseIndex> { throw new Error("not implemented: WP02"); }
/** @deprecated TRANSITION SHIM (src/lib/data/catalog-shim.ts): every LISTED class-0 row from the browse index, 5-minute memo, one console.warn per process, REFUSES in a production deployment. Deleted at M3 (ratchet: tests/no-get-catalog.test.ts). */
export function getCatalog(): Promise<Catalog> { throw new Error("not implemented: WP02"); }
