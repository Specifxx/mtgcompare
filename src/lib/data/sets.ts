// owner: WP12
// src/lib/data/sets.ts: C0 STUB (contract 9.3 step 2), the section "sets.ts" of api.ts. Every function below throws until WP12 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Country } from "../country";
import type { ChecklistCard } from "../set-scope";
import type { CardMini, SetLite } from "./types";

export const SET_CHECKLIST_CHUNK: 2000 = 2000;
export function getSetChecklist(setId: number, market: Country): Promise<ChecklistCard[]> { throw new Error("not implemented: WP12"); }   // P st/<setId>[-k].json in collector order (nsort); <= 6,000 cards
export function getUpcomingSets(n?: number): Promise<SetLite[]> { throw new Error("not implemented: WP12"); }                              // derived from getSets()
export function getSetValueStats(): Promise<Map<number, { n: number; totalCents: number }>> { throw new Error("not implemented: WP12"); }  // from mk/overview.json
export function getBoxPools(setId: number): Promise<CardMini[]> { throw new Error("not implemented: WP12"); }                              // P st/<setId>.json: the listed singles of the set with prices (Box EV)
