// owner: WP15
// src/lib/data/sitemap.ts: the section "sitemap.ts" of api.ts (contract 7.12 and 4.5). The sitemap path lists are PUBLISHED FILES (sm/plan.json and sm/<kind>-<n>.json, at most SITEMAP_SECTION_SIZE slugs a file) written by the importer from the same
// rows the pages use: a card is listed only if it is LISTED, not THIN, not GONE, class 0 and tracked or TOP (track.ts isIndexable), an oracle hub only with an indexable printing and two listed printings. Read through the PlaneSource of the request, pinned to
// one data commit; no database, no unstable_cache (kind P of 7.5). The names, arguments, result types, cache kinds and tags are FROZEN (7.12): this module only adds exports.
import { sitemapPath } from "./plane/shards";
import type { SitemapPlanFile } from "./plane/formats";
import { optionalOf, planeSource } from "./plane/runtime";

export const SITEMAP_SECTION_SIZE: 10_000 = 10_000;                                                         // far below the 50,000-URL / 50 MB protocol cap; a test asserts <= 50_000
export type SitemapKind = "static" | "sets" | "sealed" | "commanders" | "names" | "cards";
/** How many section FILES each kind has (sm/plan.json holds file counts, as the publisher writes them: static is one file the route composes from code). The URL total of the cards kind is `urls.cards`. */
export interface SitemapPlan { static: number; sets: number; sealed: number; commanders: number; names: number; cards: number }
export interface SitemapPlanWithUrls extends SitemapPlan { urls: { cards: number } }

const count = (n: unknown): number => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0);
export async function getSitemapPlan(): Promise<SitemapPlan> {                                              // P sm/plan.json. Sitemaps are ROUTE HANDLERS that set publicDataHeaders(), never sitemap.ts (Next doubles the Cache-Control of a metadata route)
  const { src } = await planeSource(), f = await optionalOf<SitemapPlanFile>(src, "sm/plan.json");
  const plan: SitemapPlanWithUrls = { static: 1, sets: count(f?.sets), sealed: count(f?.sealed), commanders: count(f?.commanders), names: count(f?.names), cards: count(f?.cards), urls: { cards: count(f?.urls?.cards) } };
  return plan;
}
/** The slugs of one section file ([] when the file is absent, and for `static`, which the route builds from code). Only strings are returned, at most SITEMAP_SECTION_SIZE of them; the route validates each one again before it writes a URL. */
export async function getSitemapSection(kind: SitemapKind, index: number): Promise<string[]> {             // P sm/<kind>-<n>.json, <= SITEMAP_SECTION_SIZE paths
  if (kind === "static" || !Number.isInteger(index) || index < 0) return [];
  const { src } = await planeSource(), f = await optionalOf<unknown>(src, sitemapPath(kind, index));
  return Array.isArray(f) ? f.filter((s): s is string => typeof s === "string").slice(0, SITEMAP_SECTION_SIZE) : [];
}
