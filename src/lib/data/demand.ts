// owner: WP07
// src/lib/data/demand.ts: C0 STUB (contract 9.3 step 2), the section "demand.ts" of api.ts. Every function below throws until WP07 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
// PAID LOADERS: the body reads `who` through accessOf(feature, who) / viewerOf(who) (plane/entitlement.ts), computes the ranking tier-neutral and cuts it with sliceRanking(feature, who, ranking, q); it never compares a tier itself (premium-gates.ts). tests/plane-no-premium.test.ts scans this file for those names.
import type { Access } from "../premium-gates";
import type { DemandWindowDays } from "../demand-view";
import type { DemandWindowResult } from "../demand-snapshot";
import type { Movement } from "../demand-movement";
import type { RiseAnalysis, RiseScope, WeekAgoRanking } from "../rise-predictor";
import type { RisingSnapshotData } from "../rising-snapshot";
import type { CardLite } from "./types";
import type { Entitlement } from "./plane/entitlement";

export interface DemandPick { card: CardLite & { setCode: string }; searches: number; views: number; move: Movement | null }
export interface DemandResult {
  bySearch: DemandPick[]; byView: DemandPick[]; windowUsable: boolean; coveredDays: number | null; totalDays: number; failed?: boolean; previous: { startDay: string; endDay: string; coveredDays: number } | null;
  access: Access; locked: boolean; limit: number;                            // below full: the 7-day top-10-by-search preview (pv/demand.json) for everyone, byView empty, other windows empty
}
/** N (Neon CardStat + DemandDay) behind a tier-neutral R entry [demand-v1, ref, days]; the preview is P pv/demand.json. Never throws: a failure is an empty result with `failed`. */
export function getTopDemand(days: DemandWindowDays, who: Entitlement, limit?: number): Promise<DemandResult> { throw new Error("not implemented: WP07"); }
/** The free strip of /movers and the tools hub: the top 10 most searched cards over 7 days, identical for every viewer (a cached public page), read from the CLEAR preview slice pv/demand.json and hydrated with getCardsByIds. Never Neon, never a views column. P. */
export function getDemandStrip(): Promise<{ at: string; rows: { card: CardLite & { setCode: string }; searches: number }[] }> { throw new Error("not implemented: WP07"); }
/** The Rising Cards teaser of a cached public page (home, tools hub): at most 3 picks per scope from the clear slice pv/rising.json. Never Neon. P. */
export function getRisingTeaser(scope: RiseScope): Promise<RisePreviewRow[]> { throw new Error("not implemented: WP07"); }
/** ADMIN and the demand job only (Neon DemandDay). Throws when the window is not covered (OP's guard). `ref` is the data commit. */
export function demandWindowAtOrThrow(ref: string, days: number, opts?: { previous?: boolean }): Promise<DemandWindowResult> { throw new Error("not implemented: WP07"); }
export interface RisePreviewRow { id: number; slug: string; name: string; reason: string }
export type RiseResult =
  | { access: "full"; locked: false; limit: number; failed: boolean; analysis: RiseAnalysis }
  | { access: "preview" | "none"; locked: true; limit: number; failed: boolean; preview: RisePreviewRow[] };            // below full there is no `analysis` property to read: the type itself is the gate (pv/rising.json, <= 3 rows per scope)
/** R [rise-v1, ref, day, scope]: assembleRisingCards over hist/w (public weekly closes) + the Neon counters, cached tier-neutral and cut after `who`. THE one Rising Cards entry point (never wrap it, never call it inside an unstable_cache callback). */
export function getCachedRisingCards(scope: RiseScope, who: Entitlement): Promise<RiseResult> { throw new Error("not implemented: WP07"); }
export function getRisingWeekAgo(scope: RiseScope, who: Entitlement): Promise<WeekAgoRanking | null> { throw new Error("not implemented: WP07"); }   // full access only; null otherwise or when it cannot be rebuilt
/** N: the frozen JSON of a minted Hot 40 (/rising/[token]); whoever has the link sees it (a snapshot is a shared page, not a paid read). */
export function getRisingSnapshot(token: string): Promise<{ title: string; data: RisingSnapshotData; createdAt: string } | null> { throw new Error("not implemented: WP07"); }
