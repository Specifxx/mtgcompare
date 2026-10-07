// Cross-currency comparison of one card's (or sealed product's) price across
// every market we track (RiftCompare's lib/market-comparison.ts, over OP's
// OfferRow). Pure: arithmetic over the offers the page has already loaded.
//
// THE HONESTY RULES, which are not optional:
//  1. NATIVE FIGURES ARE THE REAL ONES: each `nativeCents` is a live listing in
//     the market's own currency, the number a visitor can act on.
//  2. CONVERTED FIGURES ARE INDICATIVE, NEVER QUOTES: lib/fx.ts is a hand-set
//     table. A converted figure exists so two markets can be ranked.
//  3. A CHEAPER MARKET IS NOT A BUYING INSTRUCTION: stores ship within their own
//     market and nothing here models international postage, duty or import tax.
//  4. ONLY OPEN LISTINGS IN THE MARKET'S OWN CURRENCY COUNT (the price board's
//     rule), and an eBay row is never counted as a store. A Canadian `ebay_us`
//     row is labelled "ships from the US" because it is exactly that.
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { OfferRow } from "./data";
import { convertUsdCents, toUsdCents } from "./fx";
import { money } from "./format";
import { marketRows } from "./quick-view";
import { isStoreSource, sourceLabel } from "./stores";

export interface MarketQuote {
  country: Country;
  label: string;
  /** With its article, for prose: "the United States". */
  place: string;
  flag: string;
  currency: string;
  /** Cheapest open item price in `currency`. */
  nativeCents: number;
  /** Postage on that listing when known (eBay only). null = at checkout. */
  shippingCents: number | null;
  /** Who is selling the cheapest copy: "TCGplayer", a store, "eBay US"... */
  seller: string;
  /** The cheapest copy ships from outside the market (CA's `ebay_us` rows). */
  shipsFromUs: boolean;
  /** `nativeCents` in the comparison currency. INDICATIVE ONLY. */
  comparableCents: number;
  /** Distinct in-stock stores (never eBay) in this market. */
  storeCount: number;
}

export interface MarketComparison {
  quotes: MarketQuote[];
  compareCurrency: string;
  cheapest: MarketQuote | null;
  dearest: MarketQuote | null;
  /** How much dearer the priciest market is than the cheapest, whole percent. */
  spreadPct: number | null;
}

/** Convert cents between two ISO currencies through USD (indicative). */
export function convertCents(cents: number, from: string, to: string): number {
  if (from === to) return cents;
  return convertUsdCents(toUsdCents(cents, from), to);
}

/** Rank every market's cheapest open listing in one currency (ITEM price, like every row). */
export function compareMarkets(offers: OfferRow[], compareCurrency: string): MarketComparison {
  const quotes: MarketQuote[] = [];
  for (const code of MARKETS) {
    const rows = marketRows(offers, code);
    const best = rows[0];
    if (!best) continue;
    const info = COUNTRIES[code];
    quotes.push({
      country: code,
      label: info.label,
      place: info.place,
      flag: info.flag,
      currency: info.currency,
      nativeCents: best.priceCents,
      shippingCents: best.source.startsWith("ebay") ? best.shippingCents : null,
      seller: sourceLabel(best.source, code),
      shipsFromUs: best.source === "ebay_us",
      comparableCents: convertCents(best.priceCents, info.currency, compareCurrency),
      storeCount: new Set(rows.filter((r) => isStoreSource(r.source)).map((r) => r.source)).size,
    });
  }
  quotes.sort((a, b) => a.comparableCents - b.comparableCents || a.country.localeCompare(b.country));
  const cheapest = quotes[0] ?? null;
  const dearest = quotes.length > 1 ? quotes[quotes.length - 1] : null;
  const spreadPct =
    cheapest && dearest && cheapest.comparableCents > 0
      ? Math.round(((dearest.comparableCents - cheapest.comparableCents) / cheapest.comparableCents) * 100)
      : null;
  return { quotes, compareCurrency, cheapest, dearest, spreadPct };
}

/** The comparison as one plain sentence for the server-rendered HTML; null with nothing to compare. */
export function marketSpreadSentence(cmp: MarketComparison, name: string): string | null {
  const { cheapest, dearest, spreadPct, compareCurrency } = cmp;
  if (!cheapest || !dearest || spreadPct == null) return null;
  const native = (q: MarketQuote) => money(q.nativeCents, q.country);
  const converted = (q: MarketQuote) => (q.currency === compareCurrency ? "" : ` (≈ ${formatCompare(q.comparableCents, compareCurrency)})`);
  return (
    `${name} is cheapest in ${cheapest.place} at ${native(cheapest)}${converted(cheapest)} ` +
    `and dearest in ${dearest.place} at ${native(dearest)}${converted(dearest)}, ` +
    `a ${spreadPct}% spread across the ${cmp.quotes.length} markets stocking it. ` +
    `Each seller bills in its own currency; converted figures are indicative only.`
  );
}

/** Format cents in an ISO currency with OP's market symbols. */
export function formatCompare(cents: number, currency: string): string {
  const code = MARKETS.find((m) => COUNTRIES[m].currency === currency) ?? "US";
  return money(cents, code);
}

/** "A$14.00 in Australia, £6.50 in the United Kingdom and US$8.20 in the United States". */
export function marketPriceListSentence(cmp: MarketComparison): string | null {
  if (!cmp.quotes.length) return null;
  const parts = cmp.quotes.map((q) => `${money(q.nativeCents, q.country)} in ${q.place}`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const TRACKED_MARKET_COUNT = MARKETS.length;

/** "the United States, Australia, the United Kingdom, Singapore, Canada and the EU". */
export function trackedMarketPlaces(): string {
  const places = MARKETS.map((c) => COUNTRIES[c].place);
  return `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
}
