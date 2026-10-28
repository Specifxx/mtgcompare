// Which product pages Google is asked to index, and which the sitemap lists. Ported from DexCompare (2026-10-28), whose Search Console
// on 2026-10-25 showed 5,332 URLs "Crawled - currently not indexed" and 194 indexed from a sitemap that listed every comparable product.
// Pure: tests/index-tiers.test.ts.
//
// THREE TIERS, from the import's ProductStat row for the product in one market:
//   • strong: something to compare here. In stock at two or more stores; or in stock at one that three or more list; or a headline
//     product (a play, collector, draft or set booster box, a bundle, a Commander deck) that three or more stores list, in stock or not: people search for those
//     even when they are sold out. In the sitemap, indexable.
//   • thin: fewer than two listings to compare (one store, or only the marketplace, or one store and nothing else). Noindex and out
//     of the sitemap: the page is one row of a store's shelf inside the site's template, which is what Google declined to index.
//     It stays reachable (links, the region chips) for a visitor who wants it.
//   • middle: everything else (sold out at the two or more stores that list it; in stock at one of two). Indexable but out of the
//     sitemap for now: Google finds them through the set, type and store pages. Promote them by loosening `productTier` once the
//     strong pages are indexed; the sitemap and the page's robots tag both follow this one function, so they cannot disagree.
//
// A listing is a store that lists the product (listedStores, which never counts TCGplayer) or an open marketplace offer
// (marketplaceOpen: TCGplayer in the US). Nothing here is a guess: every number is a count the import wrote.

import { MOVE_TYPES } from "./stock";

export type IndexTier = "strong" | "middle" | "thin";

/** The product types searched for by name even when sold out (lib/stock.ts MOVE_TYPES, the headline formats). */
export const HEADLINE_TYPES: readonly string[] = MOVE_TYPES;

export interface TierStat {
  inStockStores: number;
  listedStores: number;
  marketplaceOpen: boolean;
}

/** Listings a visitor can compare: the stores that list it, plus an open marketplace offer. */
export const listings = (s: TierStat): number => s.listedStores + (s.marketplaceOpen ? 1 : 0);

export function productTier(s: TierStat, productType: string): IndexTier {
  if (listings(s) < 2) return "thin";
  if (s.inStockStores >= 2) return "strong";
  if (s.inStockStores >= 1 && s.listedStores >= 3) return "strong";
  if (HEADLINE_TYPES.includes(productType) && s.listedStores >= 3) return "strong";
  return "middle";
}

/** Noindex: no stats row in this market, or a thin one. */
export const productNoindex = (s: TierStat | null | undefined, productType: string): boolean => !s || productTier(s, productType) === "thin";

/** In the sitemap: strong only. */
export const productInSitemap = (s: TierStat, productType: string): boolean => productTier(s, productType) === "strong";

/**
 * Set and type pages: in the sitemap from MIN_HUB_PRODUCTS comparable products in the market (a set with one or two products here is a
 * thin page that mostly repeats those products' own). Fewer, but some: indexable, out of the sitemap. None at all: a 404 (the page has
 * nothing to show; it used to be an empty 200 that Search Console called a soft 404).
 */
export const MIN_HUB_PRODUCTS = 3;
