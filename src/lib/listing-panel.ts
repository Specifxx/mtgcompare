// The card page's eBay panel and the "Chase cards on eBay" picks, as pure
// shapes and selections (RiftCompare's EbayCardPanel / EbayPicks data model on
// OP's EbayListing and EbayGradedListing tables). The rows are written only by
// scripts/ebay.ts after a COMPLETED search (lib/ebay-import.ts); nothing here
// or on a page calls eBay. Listings are display-only: never ranked into a
// price row, never in alerts or baskets, never counted as a store.
import type { Country } from "./country";

/** One eBay listing tile (Listings tab): a row of EbayListing. */
export interface PanelListing {
  market: string;
  rank: number;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  title: string;
  imageUrl: string | null;
}

/** One slab (Graded tab): a row of EbayGradedListing. */
export interface PanelGraded {
  market: string;
  itemId: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  title: string;
  imageUrl: string | null;
  grader: string;
  grade: string;
}

export interface EbayPanelData {
  listings: PanelListing[];
  graded: PanelGraded[];
}

/** Rows not refreshed within this window are not served (the importer sweeps at 72 h too). */
export const PANEL_MAX_AGE_HOURS = 72;
/** EbayPicks tiles must be this fresh: an old asking price sends a buyer to a dead page. */
export const PICKS_MAX_AGE_HOURS = 48;

export const panelTitle = (s: string, n = 70): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A pick: a chase printing with its rank-0 eBay listing in each market that has one. */
export interface PickCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  setCode: string;
  marketUsd: number;
  /** market → the rank-0 listing (fresh, with an image). */
  listings: Partial<Record<string, { priceCents: number; shippingCents: number | null; currency: string; url: string; title: string; imageUrl: string }>>;
}

/**
 * The picks for a visitor's market: only cards that have a listing THERE, dearest
 * TCGplayer market first, at most `limit`. Never another market's listing under
 * this market's currency.
 */
export function selectPicks(cards: PickCard[], market: Country, limit = 6): (PickCard & { listing: NonNullable<PickCard["listings"][string]> })[] {
  const out: (PickCard & { listing: NonNullable<PickCard["listings"][string]> })[] = [];
  for (const c of [...cards].sort((a, b) => b.marketUsd - a.marketUsd || a.id - b.id)) {
    const listing = c.listings[market];
    if (listing && listing.imageUrl) out.push({ ...c, listing });
    if (out.length >= limit) break;
  }
  return out;
}

/** The printings worth a chase tile: SP, Manga, Parallel, Treasure Rare, Secret Rare. */
export function isChasePrinting(c: { printing: string; rarity: string | null }): boolean {
  return ["sp", "manga", "alt", "treasure"].includes(c.printing) || c.rarity === "SEC";
}

/** One tile of the chase strip: art always, an eBay listing per market when fresh. */
export interface ChaseTile {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  marketUsd: number;
  imageUrl: string;
  listings: Partial<Record<string, { priceCents: number; shippingCents: number | null; currency: string; url: string; imageUrl: string }>>;
}
