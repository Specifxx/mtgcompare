// The price comparison of one market as plain data (OP Compare's board-model.ts, for Magic): everything PriceBoard used to work
// out while drawing — the open rows cheapest first, the sold-out stores, the played-copy notes, the postage line, the store
// label and policy link, the affiliate-tagged href and its click id — resolved on the SERVER, so the card page can ship every
// market's board to one cached HTML and a client island draws the visitor's (components/card/CardMarket.tsx). The store registry,
// the board helpers and the matcher's vocabularies never reach the browser. components/PriceBoardView.tsx draws a model;
// components/PriceBoard.tsx is the one-market server wrapper the sealed page and the others keep using.
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { OfferRow } from "./data";
import { affiliateUrl, ebaySearchUrl, isPaidLink } from "./affiliate";
import { ebayRetailer, postageLine, retailerSubId } from "./board";
import { isEbaySource, sourceLabel, storeForSource } from "./stores";
import { playedDiscounts, playedDiscountText } from "./played-discount";
import { marketRows } from "./quick-view";

/** One open row. Empty flags are left out of the payload (one card page ships up to six boards). */
export interface BoardRow {
  source: string;
  label: string;
  priceCents: number;
  /** Affiliate-tagged where the retailer has a programme; a store's own URL otherwise. */
  href: string;
  /** data-retailer of the click beacon. */
  retailer: string;
  condition?: string;
  /** TCGplayer's own lowest listing ("lowest listing"). */
  tcg?: true;
  /** An eBay listing: blue button, "Cheapest matching listing we found", no stock dot. */
  ebay?: true;
  postage: string;
  policyUrl?: string;
  /** "12% under the cheapest NM here" (lib/played-discount.ts). */
  played?: string;
  updatedAt: string;
  paid?: true;
}
export interface BoardSold { source: string; label: string; priceCents: number; updatedAt: string; href: string; retailer: string }
export interface BoardModel {
  rows: BoardRow[];
  /** One sold-out row per store (never eBay), newest observation first. */
  sold: BoardSold[];
  /** The oldest open row's update time ("oldest listing 3h ago"). */
  oldest: string | null;
  /** No open row here: each other market's cheapest in-stock price. */
  elsewhere: { m: Country; cents: number }[];
  hasEbayRow: boolean;
  /** EPN-tagged search on this market's eBay ("<page>-board"). */
  ebaySearch: string;
}

export function boardModel(offers: OfferRow[], country: Country, o: { page: string; ebayQuery: string }): BoardModel {
  const c = COUNTRIES[country];
  const here = offers.filter((x) => x.market === country && x.currency === c.currency);
  const open = marketRows(offers, country);
  const soldBySource = new Map<string, OfferRow>();
  for (const x of here.filter((y) => !y.inStock && !isEbaySource(y.source))) {
    const cur = soldBySource.get(x.source);
    if (!cur || x.updatedAt > cur.updatedAt) soldBySource.set(x.source, x);
  }
  // A played copy against the cheapest Near Mint one in this market (the open rows the page already holds, so no new query).
  const played = playedDiscounts(open.map((x) => ({ id: `${x.source}-${x.market}`, condition: x.condition, isFoil: false, priceCents: x.priceCents })));
  const rows: BoardRow[] = open.map((x) => {
    const isEbay = isEbaySource(x.source);
    const store = storeForSource(x.source);
    const pd = played.get(`${x.source}-${x.market}`);
    const r: BoardRow = {
      source: x.source,
      label: sourceLabel(x.source, country),
      priceCents: x.priceCents,
      href: affiliateUrl(x.url, retailerSubId(x.source), o.page),
      retailer: isEbay ? ebayRetailer(x.source, country) : retailerSubId(x.source),
      postage: postageLine(!isEbay && x.shippingCents == null && store?.shippingCents != null ? { ...x, shippingCents: store.shippingCents } : x, country),
      updatedAt: x.updatedAt,
    };
    if (x.condition) r.condition = x.condition;
    if (x.source === "tcgplayer") r.tcg = true;
    if (isEbay) r.ebay = true;
    if (store?.policyUrl) r.policyUrl = store.policyUrl;
    if (pd) r.played = playedDiscountText(pd);
    if (isPaidLink(x.url)) r.paid = true;
    return r;
  });
  const sold = [...soldBySource.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((x) => ({ source: x.source, label: sourceLabel(x.source, country), priceCents: x.priceCents, updatedAt: x.updatedAt, href: affiliateUrl(x.url, retailerSubId(x.source), o.page), retailer: isEbaySource(x.source) ? ebayRetailer(x.source, country) : retailerSubId(x.source) }));
  const oldest = open.length ? open.reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b)).updatedAt : null;
  const elsewhere = open.length
    ? []
    : MARKETS.filter((m) => m !== country)
        .map((m) => {
          const best = offers.filter((x) => x.market === m && x.inStock).sort((a, b) => a.priceCents - b.priceCents)[0];
          return best ? { m, cents: best.priceCents } : null;
        })
        .filter((x): x is { m: Country; cents: number } => x != null);
  return { rows, sold, oldest, elsewhere, hasEbayRow: rows.some((r) => r.ebay), ebaySearch: ebaySearchUrl(country, o.ebayQuery, `${o.page}-board`) };
}
