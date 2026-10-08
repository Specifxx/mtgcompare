// owner: WP11
// src/lib/data/commanders.ts: C0 STUB (contract 9.3 step 2), the section "commanders.ts" of api.ts. Every function below throws until WP11 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { CardMini, OracleDetail, OracleMini } from "./types";
import type { LibraryDeckRow } from "./decks";

export function getCommanderPage(o: { identity?: number; q?: string; page: number; per: 24 | 48 | 100 }): Promise<{ total: number; pages: number; items: OracleMini[] }> { throw new Error("not implemented: WP11"); }   // ORACLE_FLAGS.COMMANDER over ix/o + nm
export function getCommanderBySlug(slug: string): Promise<{ oracle: OracleDetail; printings: CardMini[]; decks: LibraryDeckRow[] } | null> { throw new Error("not implemented: WP11"); }   // oracle P; decks N (empty when Neon is down)
