// owner: WP15
// src/lib/data/sitemap.ts: C0 STUB (contract 9.3 step 2), the section "sitemap.ts" of api.ts. Every function below throws until WP15 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).

export const SITEMAP_SECTION_SIZE: 10_000 = 10_000;                                                         // far below the 50,000-URL / 50 MB protocol cap; a test asserts <= 50_000
export type SitemapKind = "static" | "sets" | "sealed" | "commanders" | "names" | "cards";
export interface SitemapPlan { static: number; sets: number; sealed: number; commanders: number; names: number; cards: number }   // URL counts
export function getSitemapPlan(): Promise<SitemapPlan> { throw new Error("not implemented: WP15"); }                                       // P sm/plan.json. Sitemaps are ROUTE HANDLERS that set publicDataHeaders(), never sitemap.ts (Next doubles the Cache-Control of a metadata route)
export function getSitemapSection(kind: SitemapKind, index: number): Promise<string[]> { throw new Error("not implemented: WP15"); }      // P sm/<kind>-<n>.json, <= SITEMAP_SECTION_SIZE paths
