// The cross-market gap rule of the published records (v1/mk/records.json, `gaps`): "is this card cheaper in another
// market?", decided for ONE unit (a product and finish) and one home market at a time. Pure: the publisher
// (src/lib/import.ts writeViews) asks it for every tracked unit and every market and keeps the largest savings;
// /market/records and the "Are Magic cards cheaper abroad?" guide only read the rows it kept. tests/market-gaps.test.ts.
//
// A row compares the SAME unit in both markets and quotes what a local buyer can really pay (DECISIONS.md, "Cross-market
// gaps compare one unit, count TCGplayer's low in the US and skip outlier asks", 2026-10-14):
//   * local = the cheapest fresh in-stock store copy in the home market; in the United States TCGplayer's own lowest
//             listing of the unit is a local option too (a US buyer can order there), so the cheaper of the two;
//   * away  = the cheapest fresh in-stock STORE copy in another market (never TCGplayer's listing, never an eBay ask),
//             converted at the reference rate;
//   * the unit's TCGplayer MARKET price is the sanity reference. A unit without one gets no row. A local price more than
//     GAP_HOME_MAX_MARKET times the market (converted) is one store's ask, not the market's price, and the unit gets no
//     row in that market: the live board of 2026-10-14 led with a foil Metalworker (UDS) at US$3,934, one US store's
//     moderately played copy at 3.6x the unit's US$1,100 market, while TCGplayer's own lowest listing was US$1,500. An
//     away price under GAP_AWAY_MIN_MARKET times the market is usually a played copy or a mismatched printing, not a
//     cheaper market, and that market is passed over. In the United States a market price at or below the converted
//     away price means the card is not cheaper abroad;
//   * then the board's floors: a local price of at least GAP_MIN_HOME_CENTS, a gap of GAP_MIN_PCT to GAP_MAX_PCT of the
//     local price and a saving of at least GAP_MIN_SAVING_CENTS, all in the home currency.
// Condition is not compared: each side is the cheapest in-stock copy its stores list, whatever condition they state.
import { MARKETS, currencyOf, type Country } from "./country";
import { toUsdCents, usdCentsToCountry } from "./fx";

/** The cheapest local price must be at least this (home currency minor units). */
export const GAP_MIN_HOME_CENTS = 500;
/** A gap is between these percentages of the local price (above the maximum it is almost always two different things). */
export const GAP_MIN_PCT = 15;
export const GAP_MAX_PCT = 70;
/** The saving must be at least this (home currency minor units). */
export const GAP_MIN_SAVING_CENTS = 500;
/** A local price above this multiple of the unit's TCGplayer market (converted) is an outlier ask: the unit gets no row in that market. */
export const GAP_HOME_MAX_MARKET = 2;
/** An away price below this multiple of the unit's TCGplayer market (converted) is not a market price: that market is passed over. */
export const GAP_AWAY_MIN_MARKET = 0.5;

/** One unit's inputs, as the publisher holds them. */
export interface GapUnit {
  /** The cheapest fresh in-stock STORE price in each market, in that market's own currency, MARKETS order (un/ `smin`); null where no store has it. */
  storeMin: readonly (number | null)[];
  /** TCGplayer's MARKET price of the unit, US cents (px marketN / marketF); null for a low-only unit. */
  marketUsd: number | null;
  /** TCGplayer's own lowest listing of the unit, US cents (px lowN / lowF), any condition; a local option in the United States only. */
  tcgLowUsd: number | null;
}

/** The best gap of a unit for one home market. `localCents` is in the home currency; `awayCents` in the away market's own. */
export interface GapPick {
  localCents: number;
  away: Country;
  awayCents: number;
  /** The away price converted into the home currency at the reference rate. */
  awayConverted: number;
  saving: number;
  /** The saving as a percentage of the local price, one decimal. */
  pct: number;
}

/** What a buyer in `home` can pay for the unit locally: the cheapest store, and in the United States TCGplayer's own lowest listing too. null when there is neither. */
export function localPrice(u: GapUnit, home: Country): number | null {
  const store = u.storeMin[MARKETS.indexOf(home)] ?? null;
  const tcg = home === "US" ? u.tcgLowUsd : null;
  return store == null ? tcg : tcg == null ? store : Math.min(store, tcg);
}

/** The largest saving a store in another market offers on this unit against the home market, or null when no market passes the rule (header comment). */
export function unitGap(u: GapUnit, home: Country): GapPick | null {
  if (u.marketUsd == null || !(u.marketUsd > 0)) return null;
  const local = localPrice(u, home);
  if (local == null || local < GAP_MIN_HOME_CENTS) return null;
  const ref = usdCentsToCountry(u.marketUsd, home);
  if (local > GAP_HOME_MAX_MARKET * ref) return null;
  let best: GapPick | null = null;
  MARKETS.forEach((away, ai) => {
    if (away === home) return;
    const awayCents = u.storeMin[ai];
    if (awayCents == null) return;
    const awayConverted = usdCentsToCountry(toUsdCents(awayCents, currencyOf(away)), home);
    if (awayConverted < GAP_AWAY_MIN_MARKET * ref) return;
    if (home === "US" && ref <= awayConverted) return;
    const saving = local - awayConverted;
    const pct = Math.round((saving / local) * 1000) / 10;
    if (pct < GAP_MIN_PCT || pct > GAP_MAX_PCT || saving < GAP_MIN_SAVING_CENTS) return;
    if (!best || saving > best.saving) best = { localCents: local, away, awayCents, awayConverted, saving, pct };
  });
  return best;
}
