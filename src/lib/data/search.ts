// owner: WP07
// src/lib/data/search.ts: C0 STUB (contract 9.3 step 2), the section "search.ts" of api.ts. Every function below throws until WP07 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { CardPage, CardQuery, NameHit, NameIndexEntry } from "./types";

export function getNameIndex(): Promise<NameIndexEntry[]> { throw new Error("not implemented: WP07"); }                                  // P nm/0 (the top 8,000 oracles, hottest first): 480 KB
export function getNameTail(qn: string): Promise<NameHit[]> { throw new Error("not implemented: WP07"); }                                // P nm/<k> beyond the hot chunk; the cached TAIL loader (<= 24 hits). `readNameTail` is the uncached helper inside it
export function searchNames(q: string, limit?: number): Promise<NameHit[]> { throw new Error("not implemented: WP07"); }                 // hot index scan in memory, then getNameTail
export function searchCards(q: string, o?: Partial<CardQuery>): Promise<CardPage> { throw new Error("not implemented: WP07"); }          // parseSearch (pure), then getCardPage
