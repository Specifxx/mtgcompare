// The card and sealed pages' price-history chart in the VISITOR'S market: the
// cheapest listing there in its own currency (history v2 carries every market's
// low, lib/history.ts), plus TCGplayer's US market price as a reference line
// converted at the indicative rate. v1 days have no other market's low, so an
// AU chart starts when v2 history does (and says so) rather than inventing a past.
import { COUNTRIES, MARKETS, type Country } from "./country";
import type { Finish } from "./constants";
import type { HistoryPoint, Quote } from "./data";
import { usdCentsToCountry } from "./fx";
import type { Headline } from "./price";

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

// ── Last known price (owner, 2026-10-18) ──────────────────────────────────────────────────────────────────────────────
// A unit with no current price in the visitor's market is shown at the last price its OWN history holds: muted, labelled
// "Last known price" and dated. DISPLAY ONLY. It is never a ranking, sort, filter, index, TOP, chase, movers, deal, alert,
// basket, deck, collection or eBay-reference input, never a "cheapest"/"from" claim, never in JSON-LD, a title, a meta
// description, a share image or a sitemap, and never a plane field. tests/last-known-price.test.ts allows the `lastKnown`
// names only in the files that draw it (DECISIONS.md, "Last known price").

/** The last price a unit's own series holds in one market, in the shape the live headline (price.ts `headline`) would have shown it that day. */
export interface LastKnownPrice {
  /** Market-currency cents. */
  cents: number;
  /** YYYY-MM-DD: the most recent day of the series with a price in this market. */
  day: string;
  /** "listing": the market's own cheapest listing that day; "reference": TCGplayer's US market converted at the indicative rate (shown with ≈, as the live reference is). */
  kind: "listing" | "reference";
}

/**
 * May the unit on show carry a last known price? Only when it has NO current price in this market: no listing here (stores,
 * and TCGplayer's own low in the US), no TCGplayer market and no TCGplayer low (a "low only" unit has a current, if thin,
 * price). A THIN row (outside the relevant quarter, DECISIONS 2026-10-17) shows no price by policy, so it qualifies only when
 * the whole card has no current TCGplayer quote on either finish and no live listing anywhere: a card that LOST its price,
 * never one whose current price the page withholds.
 */
export function lastKnownEligible(
  card: { thin: boolean; n: Quote | null; f: Quote | null },
  finish: Finish,
  current: Pick<Headline, "kind">,
  listedAnywhere: boolean,
): boolean {
  if (current.kind !== "none") return false;
  const q = finish === "N" ? card.n : card.f;
  if (q?.market != null || q?.low != null) return false;
  if (!card.thin) return true;
  const quoted = (x: Quote | null): boolean => x?.market != null || x?.low != null;
  return !quoted(card.n) && !quoted(card.f) && !listedAnywhere;
}

/**
 * The most recent day of the unit's own series (visitorHistory of getUnitHistory({ id, finish })) with a price in the
 * visitor's market, read the way the live headline reads a day: the market's own low first, else TCGplayer's market in the
 * market's currency. Null when the unit has a current price (`current.kind` is not "none") or the series holds no price.
 * The series is ONE unit's in ONE market: another finish, another printing or another market's low is never consulted.
 */
export function lastKnownPrice(current: Pick<Headline, "kind">, vh: VisitorHistory): LastKnownPrice | null {
  if (current.kind !== "none") return null;
  let best: LastKnownPrice | null = null;
  for (let i = 0; i < vh.low.points.length; i++) {
    const p = vh.low.points[i]!, m = vh.market.points[i];
    const low = p.y != null && p.y > 0 ? p.y : null;
    const ref = m && m.x === p.x && m.y != null && m.y > 0 ? m.y : null;
    if ((low == null && ref == null) || (best && best.day >= p.x)) continue;
    best = low != null ? { cents: low, day: p.x, kind: "listing" } : { cents: ref!, day: p.x, kind: "reference" };
  }
  return best;
}
