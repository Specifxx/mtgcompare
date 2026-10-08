// owner: WP07
// src/lib/data/lists.ts: C0 STUB (contract 9.3 step 2), the section "lists.ts" of api.ts. Every function below throws until WP07 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Finish } from "../constants";
import type { CardLite, CardPage, CardQuery, OracleMini } from "./types";

export function getCardPage(q: Partial<CardQuery>): Promise<CardPage> { throw new Error("not implemented: WP07"); }                       // M engine: canonicalQuery(q) -> BrowseIndex.query; 1 to 5 ms once built. MARKET-ONLY sorts and ranges: a low-only unit never tops `value`
export function getMovers(o: { dir: "up" | "down"; window: 7 | 30; finish?: Finish; minCents?: number; setId?: number; n?: number }): Promise<CardLite[]> { throw new Error("not implemented: WP07"); }   // P mv/<dir>-<w>-<a|n|f>.json when setId is absent (n <= 100), else the engine
export function getNewestCards(n?: number): Promise<CardLite[]> { throw new Error("not implemented: WP07"); }                            // M engine, newest set first; n <= 100
export function getOracleAZ(letter: string, page: number): Promise<{ total: number; items: OracleMini[] }> { throw new Error("not implemented: WP07"); }   // P nm/<k>; 100 per page
