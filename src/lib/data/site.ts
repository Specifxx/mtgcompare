// owner: WP18
// src/lib/data/site.ts: site-wide facts for the chrome and the home hero (store counts, "prices updated", whether eBay is live), the approved reviews strip and the
// launch-promotion counter. The names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename.
//
// Where each bit comes from (contract 7.13):
//   • store rows, the catalogue counts and the publish time are PUBLISHED FILES, read through the loaders that own those files (getStoreStats, getCatalogStats,
//     getPlaneStatus). This module reads no plane file itself, so it imports nothing from ./plane (tests/nested-cache.test.ts RULE 5: a module that reads the plane
//     may not hold an unstable_cache), and it works whenever those loaders do, Neon or no Neon.
//   • the three Neon bits (the eBay "live" flag, the approved reviews, the promo counter) are N-kind caches: the callback only queries Neon, a failed read THROWS
//     inside (an empty result is never stored), and every loader below answers its quiet fallback when Neon is down: ebayLive false, no reviews, no promo slots.
import { unstable_cache } from "next/cache";
import { prisma } from "../db";
import { homeStatsFrom, type HomeStats, type StoreOfferRow } from "../home";
import { LAUNCH_PROMO_ENABLED, PROMO_KEY, PROMO_SLOTS, promoStatus, type PromoStatus } from "../launch-promo-shared";
import { getCatalogStats } from "./catalog";
import { EBAY_BANNER_TAG, TTL, getPlaneStatus } from "./core";
import { getStoreStats } from "./stores";
import type { CatalogStats } from "./types";

export interface SiteStats { lastImportAt: string | null; storeOffers: { source: string; market: string; offers: number; inStock: number }[]; ebayLive: boolean }   // ebayLive is the one Neon bit (an ImportRun of kind "ebay" that completed a search within 3 days); false when Neon is down

/** The eBay pass counts as live when a run that completed at least one search finished OK within this many days (copy that says "we collect eBay prices" shows only then). */
const EBAY_LIVE_DAYS = 3;

/** The row that stands for TCGplayer in the store counts: the US price source, one "store" like OP and RiftCompare count it. Its offers are the cards that carry a TCGplayer price in the US. Pure. */
export function tcgplayerRow(cat: Pick<CatalogStats, "pricedByMarket">): StoreOfferRow {
  const priced = cat.pricedByMarket.US ?? 0;
  return { source: "tcgplayer", market: "US", offers: priced, inStock: priced };
}

/** Store rows of the published run file (+ the TCGplayer row) and the time of the last publish. Pure: the loaders' answers go in, the SiteStats minus the Neon bit comes out. */
export function siteStatsFrom(
  stores: readonly { source: string; market: string; offers: number; inStock: number }[],
  cat: Pick<CatalogStats, "pricedByMarket" | "pricesAt">,
  publishedAt: string | null,
): Omit<SiteStats, "ebayLive"> {
  const rows: StoreOfferRow[] = stores.filter((s) => !s.source.startsWith("ebay")).map((s) => ({ source: s.source, market: s.market, offers: s.offers, inStock: s.inStock }));
  rows.push(tcgplayerRow(cat));
  return { lastImportAt: publishedAt || cat.pricesAt || null, storeOffers: rows };
}

/** The published half of SiteStats: three plane reads (each pinned and cached by the reader), no Neon. */
async function readPlaneSiteStats(): Promise<{ stats: Omit<SiteStats, "ebayLive">; cat: CatalogStats }> {
  const [stores, cat, status] = await Promise.all([getStoreStats(), getCatalogStats(), getPlaneStatus().catch(() => null)]);
  return { stats: siteStatsFrom(stores, cat, status?.pointer.publishedAt ?? null), cat };
}

/** The searches a finished eBay run completed (its ImportRun summary); 0 for a run that only read the quota (observe-only, a reserve, budget or quiet-check stop) or an unreadable summary. Pure. */
export function completedSearches(summary: unknown): number {
  const c = summary && typeof summary === "object" ? (summary as { completed?: unknown }).completed : null;
  return typeof c === "number" && Number.isFinite(c) && c > 0 ? c : 0;
}

const loadEbayLive = unstable_cache(
  async (): Promise<boolean> => {
    // A run that searched nothing still finishes ok: only one that completed a search makes the copy say we collect eBay prices (four runs a day, so 3 days is about 12 rows).
    const runs = await prisma.importRun.findMany({ where: { kind: "ebay", ok: true, finishedAt: { gte: new Date(Date.now() - EBAY_LIVE_DAYS * 86_400_000) } }, select: { summary: true }, orderBy: { finishedAt: "desc" }, take: 40 });
    return runs.some((r) => completedSearches(r.summary) > 0);
  },
  ["ebay-live-v2"],
  { tags: [EBAY_BANNER_TAG], revalidate: TTL.hours6 },
);

/** Store rows, the last publish and whether the eBay pass is live. P status.json + ss/runs.json; the live flag is the one Neon bit and is false whenever Neon cannot answer. */
export async function getSiteStats(): Promise<SiteStats> {
  const [{ stats }, ebayLive] = await Promise.all([readPlaneSiteStats(), loadEbayLive().catch(() => false)]);
  return { ...stats, ebayLive };
}

/** Per-market hero stats: cards, stores (store:* + TCGplayer in the US, never eBay), freshness. P: the catalogue counts and the run file; no Neon. */
export async function getHomeStats(): Promise<HomeStats> {
  const { stats, cat } = await readPlaneSiteStats();
  return homeStatsFrom(stats.storeOffers, cat.pricedByMarket, cat.cards, stats.lastImportAt);
}

export interface PublicReview { id: string; rating: number | null; message: string; displayName: string | null }
/** Reviews below this count stay hidden (RiftCompare's rule): a strip of one quote reads as staged. */
export const MIN_REVIEWS_TO_DISPLAY: 3 = 3;

const loadReviews = unstable_cache(
  async (): Promise<PublicReview[]> =>
    prisma.feedback.findMany({
      where: { status: "APPROVED", consentPublic: true, publishedAt: { not: null }, message: { not: "" } },
      orderBy: { publishedAt: "desc" },
      take: 12,
      // Never widen this to `email`: a reply address, never public.
      select: { id: true, rating: true, message: true, displayName: true },
    }),
  ["approved-reviews-v1"],
  { revalidate: TTL.hours6 },
);

/** Approved, consented public feedback, newest first. N; any error is an empty list. Never widen the select to `email`. */
export async function getApprovedReviews(limit = 6): Promise<PublicReview[]> {
  try {
    return (await loadReviews()).slice(0, limit);
  } catch {
    return [];
  }
}

const loadPromoClaimed = unstable_cache(
  async (): Promise<number> => {
    const row = await prisma.counter.findUnique({ where: { key: PROMO_KEY }, select: { value: true } });
    return row?.value ?? 0;
  },
  ["launch-promo-claimed-v1"],
  { revalidate: TTL.live },
);

/** The launch promotion's live counter for the popup (first 50 new accounts). N Counter `launch-promo`, held 30 s; a read error answers "none left" so the popup hides rather than promising a slot that may not exist. */
export async function getLaunchPromo(): Promise<PromoStatus> {
  if (!LAUNCH_PROMO_ENABLED) return promoStatus(PROMO_SLOTS);
  try {
    return promoStatus(await loadPromoClaimed());
  } catch {
    return promoStatus(PROMO_SLOTS);
  }
}
