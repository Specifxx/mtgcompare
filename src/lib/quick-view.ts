// The card QuickView's data (components/QuickView.tsx, GET /api/card/[slug]) and
// the card page's phone buy path (CardTopBuy, CardStickyBuyBar): one pure place
// that decides "the open offers in a market, cheapest first", so the popup, the
// top buy block, the sticky bar and the price board's #1 row can never disagree.
// tests/quick-view.test.ts pins it.
//
// The payload is market-INDEPENDENT (every market's top rows, every market's
// eBay search) so one cached response serves every visitor and a market switch
// needs no second request. Links are affiliate-tagged HERE, on the server, so
// the environment's partner ids apply (the browser never sees those env vars).
import { affiliateUrl, cardEbayQuery, ebaySearchUrl } from "./affiliate";
import { compareBoardRows, ebayRetailer, postageLine, retailerSubId } from "./board";
import { COUNTRIES, MARKETS, type Country } from "./country";
import { availableFinishes, finishLabel, tcgplayerUrl, type Finish } from "./constants";
import type { CardDetail, HistoryPoint, OfferRow } from "./data";
import { isEbaySource, sourceLabel } from "./stores";

/** Rows per market in the popup; the full page lists the rest ("See all N"). */
export const QUICKVIEW_ROWS = 5;

/**
 * The open offers in one market, cheapest first by ITEM price (compareBoardRows):
 * in stock, in the market's own currency. The price board's rule, verbatim.
 */
export function marketRows<T extends Pick<OfferRow, "market" | "currency" | "inStock" | "priceCents" | "shippingCents" | "source">>(
  offers: T[],
  country: Country,
): T[] {
  const cur = COUNTRIES[country].currency;
  return offers.filter((o) => o.market === country && o.currency === cur && o.inStock).sort(compareBoardRows);
}

/** One buyable row, ready to render: label, data-retailer, tagged href, postage line. */
export interface BuyRow {
  source: string;
  label: string;
  retailer: string;
  priceCents: number;
  shippingCents: number | null;
  condition: string | null;
  href: string;
  ebay: boolean;
  postage: string;
  updatedAt: string;
}

/** An offer as a BuyRow. `loc` is the page path the affiliate sub-id names. */
export function buyRow(o: OfferRow, country: Country, loc: string): BuyRow {
  const ebay = isEbaySource(o.source);
  return {
    source: o.source,
    label: sourceLabel(o.source, country),
    retailer: ebay ? ebayRetailer(o.source, country) : retailerSubId(o.source),
    priceCents: o.priceCents,
    shippingCents: o.shippingCents,
    condition: o.condition,
    href: affiliateUrl(o.url, retailerSubId(o.source), loc),
    ebay,
    postage: postageLine(o, country),
    updatedAt: o.updatedAt,
  };
}

/** The cheapest open offer in a market as a BuyRow, or null (CardTopBuy, the sticky bar). */
export function cheapestBuyRow(offers: OfferRow[], country: Country, loc: string): BuyRow | null {
  const best = marketRows(offers, country)[0];
  return best ? buyRow(best, country, loc) : null;
}

export interface QuickViewMarket {
  /** Open offers in this market (all of them, not just the rows sent). */
  count: number;
  /** An eBay row is among them (then the eBay search is the "more listings" strip, not the fallback). */
  ebayRow: boolean;
  /** The first QUICKVIEW_ROWS of them, cheapest first. */
  rows: BuyRow[];
  /** Affiliate-tagged eBay search for the card on this market's eBay. */
  ebaySearch: string;
  /** Up to 3 graded slabs captured on this market's eBay (best grade first); display only, never a price row. */
  graded: { grader: string; grade: string; priceCents: number; currency: string; url: string }[];
}

export interface QuickViewPayload {
  id: number;
  slug: string;
  name: string;
  variant: string | null;
  number: string | null;
  rarity: string | null;
  printing: string;
  colors: string[];
  cardType: string | null;
  hasImage: boolean;
  set: { code: string; name: string; slug: string; releasedOn: string | null };
  /** The set releases after `today`: nothing ships yet, so eBay copy says "search", never "buy". */
  preRelease: boolean;
  marketUsd: number | null;
  change7d: number | null;
  /** Affiliate-tagged TCGplayer product page. */
  tcgHref: string;
  /** The unit this payload prices (rows, TCGplayer link, market) and the finishes the product has. */
  finish: Finish;
  finishLabel: string;
  finishes: Finish[];
  markets: Record<Country, QuickViewMarket>;
  /** The last QUICKVIEW_HISTORY_DAYS of the card's US price history (the card page's chart series). */
  history: HistoryPoint[];
}

/** Days of price history the popup's chart shows (the card page shows a year). */
export const QUICKVIEW_HISTORY_DAYS = 90;

/**
 * The tail of a card's history for the popup: points on or after `today` minus
 * `days`, with no-data days dropped, so the JSON stays a few KB.
 */
export function quickViewHistory(history: HistoryPoint[], today: string, days = QUICKVIEW_HISTORY_DAYS): HistoryPoint[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  return history.filter((p) => p.day >= from && (p.marketUsd != null || p.lowUsd != null));
}

/** Is a set (YYYY-MM-DD) still unreleased on `today` (YYYY-MM-DD)? */
export function isPreRelease(releasedOn: string | null, today: string): boolean {
  return releasedOn != null && releasedOn > today;
}

/** Shape a card's detail into the popup's small, market-independent JSON. */
export function quickViewPayload(
  c: CardDetail,
  today: string = new Date().toISOString().slice(0, 10),
  history: HistoryPoint[] = [],
  graded: { market: string; grader: string; grade: string; priceCents: number; currency: string; url: string }[] = [],
  finish: Finish = c.headFinish,
): QuickViewPayload {
  const loc = `/card/${c.slug}`;
  const query = cardEbayQuery({ name: c.name, setName: c.set.name, variant: c.label, number: c.label ? c.number : null, foil: finish === "F" });
  const offers = c.offers.filter((o) => o.finish === finish);
  const markets = {} as Record<Country, QuickViewMarket>;
  for (const m of MARKETS) {
    const open = marketRows(offers, m);
    markets[m] = {
      count: open.length,
      ebayRow: open.some((o) => isEbaySource(o.source)),
      rows: open.slice(0, QUICKVIEW_ROWS).map((o) => buyRow(o, m, loc)),
      ebaySearch: ebaySearchUrl(m, query, "quickview"),
      graded: graded
        .filter((g) => g.market === m)
        .slice(0, 3)
        .map(({ grader, grade, priceCents, currency, url }) => ({ grader, grade, priceCents, currency, url })),
    };
  }
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    variant: c.variant,
    number: c.number,
    rarity: c.rarity,
    printing: c.printing,
    colors: c.colors,
    cardType: c.cardType,
    hasImage: c.hasImage,
    set: { code: c.set.code, name: c.set.name, slug: c.set.slug, releasedOn: c.set.releasedOn },
    preRelease: isPreRelease(c.set.releasedOn, today),
    marketUsd: (finish === "N" ? c.n : c.f)?.market ?? (c.headFinish === finish ? c.marketUsd : null),
    change7d: c.headFinish === finish ? c.change7d : (c.units.find((u) => u.finish === finish)?.change7d ?? null),
    tcgHref: affiliateUrl(tcgplayerUrl(c.id, finish), "tcgplayer", loc),
    finish,
    finishLabel: finishLabel(c, finish),
    finishes: availableFinishes(c.mask),
    markets,
    history: quickViewHistory(history, today),
  };
}

/** "Sol Ring (Borderless) 270" — the name a buy surface prints. */
export function cardDisplayName(c: { name: string; variant: string | null; number: string | null }): string {
  return `${c.name}${c.variant ? ` (${c.variant})` : ""}${c.number ? ` ${c.number}` : ""}`;
}
