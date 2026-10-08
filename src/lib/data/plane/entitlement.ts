// src/lib/data/plane/entitlement.ts (owner WP02, FROZEN). THE GATE AT THE DATA BOUNDARY for the three paid analytics (Deal Finder: Plus and Premium; Rising Cards and Demand Finder: Premium). Pure and client-safe: it imports only premium-gates.ts.
// This is the place the premium-leak question (critique DP-07, DP-08) is closed in code. Four rules, each pinned by tests/plane-entitlement.test.ts:
//   1. NOTHING PAID IS A FILE. The publisher has no code path for a ranking, a score or a demand count (validate.ts refuses the keys); the paid lists are computed per request from published columns, behind this gate.
//   2. THE TIER IS AN OPAQUE VALUE minted from the session on the server (`mintEntitlement`, called by src/lib/data/entitlement.ts `entitlementOf(user)` only). A loader takes `who: Entitlement`; a string, a header or a query parameter cannot be passed
//      (the brand is a module-private symbol: a plain object `{ tier: "premium" }` is refused at run time, not just by the compiler).
//   3. THE CACHE NEVER SEES THE TIER. The ranking is computed once under a tier-neutral key and cut AFTER `who` is looked at. A key or a value that depends on `who` is a defect.
//   4. A BELOW-FULL VIEWER GETS THE DEFAULT SLICE ONLY. Every refinement (page, sort, store picker, "only my cards") is COERCED to the default before the ranking is read, so no sequence of requests can enumerate more rows than the free preview
//      (a free account paging 3 rows at a time through 25-row pages, or narrowing with onlyUids/buyKeys, gets the same 3 rows every time). premium-gates.ts `allowsRefinement` states the same rule: the DEFAULT view, never a 403 (a shared link opens);
//      API routes answer 402 when `coerced` is true.
import { accessFor, allowsRefinement, gate, rowLimit, type Access, type Feature, type Gated, type Viewer } from "../../premium-gates";

const MINT = Symbol("entitlement");
export type EntitlementTier = "anon" | "free" | "plus" | "premium";
export interface Entitlement { readonly [MINT]: true; readonly tier: EntitlementTier; readonly viewer: Viewer }
/** Server-only constructor. Call it from src/lib/data/entitlement.ts and from tests. `tier` is tierOf(user) (an admin is "premium"); signedIn false = anonymous. A failed user read is { signedIn: false, tier: null }: NEVER premium. */
export function mintEntitlement(v: Viewer): Entitlement {
  const tier: EntitlementTier = !v.signedIn ? "anon" : v.tier === "premium" ? "premium" : v.tier === "plus" ? "plus" : "free";
  return Object.freeze({ [MINT]: true as const, tier, viewer: Object.freeze({ signedIn: v.signedIn, tier: v.signedIn ? v.tier : null }) });
}
export const isEntitlement = (x: unknown): x is Entitlement => typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[MINT] === true;
/** Loaders call this first. A forged value throws (a programming error, never a user-visible one). */
export function viewerOf(who: Entitlement): Viewer { if (!isEntitlement(who)) throw new TypeError("a loader of a paid dataset needs an Entitlement minted from the session"); return who.viewer; }
export const accessOf = (feature: Feature, who: Entitlement): Access => accessFor(feature, viewerOf(who));

// ── Deal Finder ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type DealSort = "saving" | "pct";
export interface DealQuery { sort: DealSort; page: number; pageSize: number; buyKeys?: readonly string[]; onlyUids?: ReadonlySet<number> }
export const DEFAULT_DEAL_QUERY: DealQuery = { sort: "saving", page: 1, pageSize: 25 };
export const DEAL_PAGE_SIZES = [25, 50, 100] as const;
/** The most rows a cached ranking holds (the entry must stay far under the 2 MiB ceiling: tests/plane-budget.test.ts measures the worst case as Next does). `total` is still the true count. Deal Finder: 400 pages of 25; Rising Cards: the SCAN universe of rise-predictor.ts; Demand Finder: the 2,000 most searched. */
export const DEAL_RANK_MAX_ROWS = 10_000, RISE_RANK_MAX_ROWS = 400, DEMAND_RANK_MAX_ROWS = 2_000;
/** Free and anonymous viewers are served the default view; a request that names anything else is COERCED to it and flagged. At `full` the request is normalised (page >= 1, a known page size) and passes. */
export function coerceDealQuery(access: Access, q: Partial<DealQuery>): { q: DealQuery; coerced: boolean } {
  if (!allowsRefinement(access)) {
    const named = (q.sort != null && q.sort !== DEFAULT_DEAL_QUERY.sort) || (q.page != null && q.page !== 1) || (q.pageSize != null && q.pageSize !== DEFAULT_DEAL_QUERY.pageSize) || (q.buyKeys?.length ?? 0) > 0 || (q.onlyUids?.size ?? 0) > 0;
    return { q: { ...DEFAULT_DEAL_QUERY }, coerced: named };
  }
  const pageSize = (DEAL_PAGE_SIZES as readonly number[]).includes(q.pageSize ?? 0) ? q.pageSize! : DEFAULT_DEAL_QUERY.pageSize;
  return { q: { sort: q.sort === "pct" ? "pct" : "saving", page: Math.max(1, Math.min(400, Math.floor(q.page ?? 1))), pageSize, buyKeys: q.buyKeys?.length ? [...q.buyKeys].sort() : undefined, onlyUids: q.onlyUids?.size ? q.onlyUids : undefined }, coerced: false };
}
/** The tier-neutral cache key of a full ranking: the data commit, the market, the sort and the store set. NOT the tier, NOT the viewer, NOT the page. */
export function rankKey(name: "deal-rank-v1" | "rise-v1" | "demand-v1", ref: string, ...parts: (string | number)[]): string[] { return [name, ref, ...parts.map(String)]; }
export const buyKeysHash = (keys: readonly string[] | undefined): string => (keys?.length ? [...keys].sort().join(",") : "default");

export interface Sliced<T> { rows: T[]; total: number; locked: boolean; limit: number; access: Access; coerced: boolean; page: number }
/** The ONE place a ranking is cut for a viewer (loader side). `ranking` is the FULL list from the tier-neutral cache. */
export function sliceRanking<T>(feature: Feature, who: Entitlement, ranking: readonly T[], q: Partial<DealQuery> = {}): Sliced<T> {
  const viewer = viewerOf(who), access = accessFor(feature, viewer);
  const { q: nq, coerced } = coerceDealQuery(access, q);
  if (access === "none") return { rows: [], total: ranking.length, locked: true, limit: 0, access, coerced, page: 1 };
  if (access === "preview") { const g: Gated<T> = gate(feature, access, ranking, viewer); return { rows: g.rows, total: g.total, locked: true, limit: rowLimit(feature, access, viewer), access, coerced, page: 1 }; }
  if (feature !== "deal-finder") { const limit = rowLimit(feature, access, viewer); return { rows: ranking.slice(0, limit), total: ranking.length, locked: false, limit, access, coerced: false, page: 1 }; }   // Rising (40) and Demand (25) have no paging: the full list is the ceiling
  const start = (nq.page - 1) * nq.pageSize;
  return { rows: ranking.slice(start, start + nq.pageSize), total: ranking.length, locked: false, limit: rowLimit(feature, access, viewer), access, coerced, page: nq.page };
}
