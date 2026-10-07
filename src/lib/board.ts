// Pure helpers for the price board (components/PriceBoard.tsx), pinned by
// tests/ebay-board.test.ts. eBay rows sit beside the stores, ranked by ITEM
// price like every row and never moved because they are eBay; their postage
// is shown only as eBay states it, and never as "delivered" when unknown.
import type { Country } from "./country";
import { money } from "./format";
import { isEbaySource } from "./stores";

export interface BoardOffer {
  source: string;
  priceCents: number;
  shippingCents: number | null;
}

/** Item price first; delivered price only breaks ties. No source is preferred. */
export function compareBoardRows(a: BoardOffer, b: BoardOffer): number {
  return a.priceCents - b.priceCents || a.priceCents + (a.shippingCents ?? 0) - (b.priceCents + (b.shippingCents ?? 0));
}

/** The postage text under a row. */
export function postageLine(o: BoardOffer, country: Country): string {
  if (o.source === "ebay_us") return "ships from the US · postage at checkout";
  if (o.shippingCents == null) return "postage at checkout";
  if (o.shippingCents === 0) return "free postage";
  return `+ ${money(o.shippingCents, country)} postage · ≈ ${money(o.priceCents + o.shippingCents, country)} delivered`;
}

/** data-retailer for an eBay row: "ebay_<mkt>" or "ebay_us" (CA rows derived from the US search). */
export function ebayRetailer(source: string, country: Country): string {
  return source === "ebay_us" ? "ebay_us" : `ebay_${country.toLowerCase()}`;
}

/** The affiliate sub-id a row's link is re-tagged with at render (customid oc-<mkt>-<subId>-<page>-product for eBay). */
export function retailerSubId(source: string): string {
  if (source === "tcgplayer") return "tcgplayer";
  if (isEbaySource(source)) return source; // "ebay" | "ebay_us"
  return source.replace("store:", "");
}

/**
 * JSON-LD Offer entries for the eBay rows inside a page's AggregateOffer:
 * seller "eBay", and shippingDetails only when eBay stated the postage.
 */
export function ebayJsonLdOffers(
  rows: (BoardOffer & { url: string })[],
  currency: string,
  shipsTo: string,
): Record<string, unknown>[] {
  return rows
    .filter((o) => isEbaySource(o.source))
    .map((o) => ({
      "@type": "Offer",
      price: (o.priceCents / 100).toFixed(2),
      priceCurrency: currency,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "eBay" },
      ...(o.shippingCents != null
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: (o.shippingCents / 100).toFixed(2), currency },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: shipsTo },
            },
          }
        : {}),
    }));
}
