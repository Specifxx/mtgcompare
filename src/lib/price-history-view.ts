// The card and sealed pages' price-history chart in the VISITOR'S market: the
// cheapest listing there in its own currency (history v2 carries every market's
// low, lib/history.ts), plus TCGplayer's US market price as a reference line
// converted at the indicative rate. v1 days have no other market's low, so an
// AU chart starts when v2 history does (and says so) rather than inventing a past.
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { HistoryPoint } from "./data";
import { usdCentsToCountry } from "./fx";

export interface HistorySeries {
  points: { x: string; y: number | null }[];
}

export interface VisitorHistory {
  currency: string;
  /** "Price history (AUD · lowest price)" */
  title: string;
  low: HistorySeries;
  market: HistorySeries;
  /** Days with a low in this market. */
  lowDays: number;
  /** First day with a low in this market, for the "starts" note. */
  lowSince: string | null;
}

export function visitorHistory(history: HistoryPoint[], country: Country): VisitorHistory {
  const idx = MARKETS.indexOf(country);
  const currency = COUNTRIES[country].currency;
  const low = history.map((p) => ({ x: p.day, y: (p.lows ? p.lows[idx] : idx === 0 ? p.lowUsd : null) ?? null }));
  const market = history.map((p) => ({ x: p.day, y: p.marketUsd == null ? null : usdCentsToCountry(p.marketUsd, country) }));
  const withLow = low.filter((p) => p.y != null);
  return {
    currency,
    title: `Price history (${currency} · lowest price)`,
    low: { points: low },
    market: { points: market },
    lowDays: withLow.length,
    lowSince: withLow[0]?.x ?? null,
  };
}
