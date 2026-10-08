// owner: WP02
// src/lib/data/history.ts: C0 STUB (contract 9.3 step 2), the section "history.ts" of api.ts. Every function below throws until WP02 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { UnitRef } from "../constants";
import type { CardLite, HistoryPoint, IndexPoint } from "./types";

export const RECENT_HISTORY_MAX_IDS: 500 = 500;
/** hist/p base bucket (floor(id / 64)) + hist/t tail (floor(id / 512)), merged by mergeTail; default 365 days; [] for an untracked unit (the mask says so: no request). OP's getProductHistory(id) is DELETED: a call without a finish cannot exist. */
export function getUnitHistory(unit: UnitRef, days?: number): Promise<HistoryPoint[]> { throw new Error("not implemented: WP02"); }
export function getSparklines(units: readonly UnitRef[], days?: number): Promise<Record<string, number[]>> { throw new Error("not implemented: WP02"); }   // <= 48 units, key UnitKey, <= 30 points
export function getRecentHistory(units: readonly UnitRef[]): Promise<Map<string, Map<number, number>>> { throw new Error("not implemented: WP02"); }   // <= 500 units; the last 120 days; batches of 16 files; key UnitKey -> dayMs -> cents
export function getIndexSeries(): Promise<IndexPoint[]> { throw new Error("not implemented: WP02"); }                                       // hist/index.json, newest 730 days
export function getRecentlyUpdated(n?: number): Promise<{ card: CardLite; pct: number }[]> { throw new Error("not implemented: WP02"); }   // mv/recent.json (the 24 largest changes between the last two days) -> getCardsByIds
