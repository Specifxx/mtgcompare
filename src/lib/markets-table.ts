// "<card> price by market" as plain data: the comparison of lib/market-comparison.ts (which reads the store registry) resolved and
// formatted on the SERVER for one visitor market, so the card page ships one table per market to its single cached HTML and a
// client island draws the visitor's (components/CardMarketsTableView.tsx). null when fewer than two markets list it.
import type { Country } from "./country";
import { COUNTRIES } from "./country";
import type { OfferRow } from "./data";
import { money } from "./format";
import { compareMarkets, formatCompare, marketSpreadSentence, type MarketQuote } from "./market-comparison";

export interface MarketsTableRow { country: Country; flag: string; label: string; native: string; shipping: string; comparable: string | null; stores: number }
export interface MarketsTableData { summary: string | null; compareCurrency: string; cheapest: Country | null; rows: MarketsTableRow[] }

const shipping = (q: MarketQuote): string =>
  q.shipsFromUs ? "ships from the US · postage at checkout" : q.shippingCents == null ? "postage at checkout" : q.shippingCents === 0 ? "free postage" : `+ ${money(q.shippingCents, q.country)} postage`;

export function marketsTableData(offers: OfferRow[], name: string, country: Country): MarketsTableData | null {
  const cmp = compareMarkets(offers, COUNTRIES[country].currency);
  // One market with a listing is not a comparison.
  if (cmp.quotes.length < 2) return null;
  return {
    summary: marketSpreadSentence(cmp, name),
    compareCurrency: cmp.compareCurrency,
    cheapest: cmp.cheapest?.country ?? null,
    rows: cmp.quotes.map((q) => ({ country: q.country, flag: q.flag, label: q.label, native: money(q.nativeCents, q.country), shipping: shipping(q), comparable: q.currency === cmp.compareCurrency ? null : formatCompare(q.comparableCents, cmp.compareCurrency), stores: q.storeCount })),
  };
}
