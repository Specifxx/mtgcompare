// "Does this card have a price to show, and if not, why?" (RiftCompare's
// lib/card-price-state.ts, over OP's OfferRow). PRESENTATION ONLY: a card page
// is always indexable, and nothing here decides robots or the sitemap.
//
// A card with no open listing is not a shell. The page still has the card's art,
// its rules text, a printings rail and an About section; this adds the honest
// explanation of the missing price and the ways forward (a watch, the in-stock
// printings, the set), instead of an empty table.
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { OfferRow } from "./data";
import { isStoreSource } from "./stores";

/** Set kinds distributed through events and promotions rather than retail packs. */
const NO_RETAIL_KINDS = new Set(["promo", "event"]);

/** This printing is only ever handed out (events, pre-releases, promo kits), never sold in a shop. */
export function hasNoRetailChannel(setKind: string, printing: string): boolean {
  return NO_RETAIL_KINDS.has(setKind) || printing === "promo";
}

export interface CardPriceState {
  /** Any open listing, in any market. */
  hasListings: boolean;
  /** An open listing in the visitor's market. */
  inMarket: boolean;
  /** Distinct STORES (never eBay) with a copy in stock in the OTHER markets. */
  otherMarketStores: number;
  /** The markets (other than the visitor's) with an open listing. */
  otherMarkets: Country[];
  /** This printing has no retail channel, so "no price" carries no signal. */
  noRetailChannel: boolean;
  /** No open listing and no market price: the "no live listings" section applies. */
  isEmpty: boolean;
}

export function priceState(
  offers: Pick<OfferRow, "market" | "currency" | "inStock" | "source">[],
  country: Country,
  opts: { marketUsd: number | null; setKind: string; printing: string },
): CardPriceState {
  const open = offers.filter((o) => o.inStock && o.currency === COUNTRIES[o.market as Country]?.currency);
  const inMarket = open.some((o) => o.market === country);
  const otherMarkets = MARKETS.filter((m) => m !== country && open.some((o) => o.market === m));
  const otherMarketStores = new Set(open.filter((o) => o.market !== country && isStoreSource(o.source)).map((o) => `${o.market}:${o.source}`)).size;
  return {
    hasListings: open.length > 0,
    inMarket,
    otherMarketStores,
    otherMarkets,
    noRetailChannel: hasNoRetailChannel(opts.setKind, opts.printing),
    isEmpty: open.length === 0 && opts.marketUsd == null,
  };
}

/**
 * The most recent price a sold-out listing held in this market, for the "Last
 * seen" tile: only a row we actually observed (never an eBay row: an eBay
 * "sold out" means nothing, and data.ts drops stale ones already).
 */
export function lastSeen(
  offers: Pick<OfferRow, "market" | "currency" | "inStock" | "source" | "priceCents" | "updatedAt">[],
  country: Country,
): { priceCents: number; at: string; source: string } | null {
  const cur = COUNTRIES[country].currency;
  const gone = offers.filter((o) => o.market === country && o.currency === cur && !o.inStock && !o.source.startsWith("ebay"));
  if (!gone.length) return null;
  const latest = gone.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return { priceCents: latest.priceCents, at: latest.updatedAt, source: latest.source };
}

/** "3 stores in other markets" sub-line for the in-stock stat; null when there are none. */
export function elsewhereLine(state: Pick<CardPriceState, "otherMarketStores" | "otherMarkets">): string | null {
  if (state.otherMarketStores <= 0) return null;
  return `${state.otherMarketStores} ${state.otherMarketStores === 1 ? "store" : "stores"} in other markets`;
}
