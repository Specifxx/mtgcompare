// owner: WP08
// src/lib/data/facets.ts: C0 STUB (contract 9.3 step 2), the section "facets.ts" of api.ts. Every function below throws until WP08 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { OracleMini } from "./types";

export interface KeywordRow { slug: string; label: string; count: number }                         // count = oracles
export function getKeywordIndex(): Promise<KeywordRow[]> { throw new Error("not implemented: WP08"); }                                    // P ix/odict.json keyword dictionary + ix/o counts
export function getKeywordPage(slug: string, page: number, per?: 24 | 48 | 100): Promise<{ keyword: KeywordRow | null; total: number; items: OracleMini[] }> { throw new Error("not implemented: WP08"); }
export function getFacetCounts(): Promise<{ rarity: Record<string, number>; type: Record<string, number>; treat: Record<string, number>; color: Record<string, number> }> { throw new Error("not implemented: WP08"); }   // M engine, one pass, LISTED class 0
