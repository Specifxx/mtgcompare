// The card grading scale a binder entry is recorded in, what each grade is worth
// against a Near Mint price, and what a binder entry is worth in its finish (a Foil
// copy is valued at the Foil unit's market price, a Normal copy at the Normal
// unit's). Conditions and finishes are collection concepts, so they live beside
// the collection code. Client-safe: no server imports.
import type { Country } from "./country";
import type { Finish } from "./constants";
import { usdCentsToCountry } from "./fx";

export interface ConditionInfo {
  key: string;
  label: string;
  full: string;
  color: string;
}

// Card grading scale used across TCG marketplaces.
export const CONDITIONS: Record<string, ConditionInfo> = {
  NM: { key: "NM", label: "NM", full: "Near Mint", color: "#30a46c" },
  LP: { key: "LP", label: "LP", full: "Lightly Played", color: "#86b300" },
  MP: { key: "MP", label: "MP", full: "Moderately Played", color: "#f5a524" },
  HP: { key: "HP", label: "HP", full: "Heavily Played", color: "#f5793b" },
  DMG: { key: "DMG", label: "DMG", full: "Damaged", color: "#e5484d" },
};

export const CONDITION_KEYS = Object.keys(CONDITIONS);

// Relative value multipliers applied to a card's reference price per condition.
export const CONDITION_MULTIPLIER: Record<string, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.55,
  DMG: 0.4,
};

export const isConditionKey = (v: unknown): v is string => typeof v === "string" && Object.prototype.hasOwnProperty.call(CONDITIONS, v);

/** A copy's value: the price × the condition multiplier, rounded per copy. */
export function unitValue(price: number | null | undefined, condition: string): number | null {
  return price != null ? Math.round(price * (CONDITION_MULTIPLIER[condition] ?? 1)) : null;
}

// Normalise a free-text condition (a CSV column, a store's variant title) into
// one of the five grades, or null when it genuinely can't be told (the binder never reads eBay).
export function normaliseCondition(raw: string | null | undefined): keyof typeof CONDITIONS | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t || t === "default title") return null;
  if (/near\s*mint|\bnm\b|\bmint\b/.test(t)) return "NM";
  if (/light(ly)?\s*play|\blp\b/.test(t)) return "LP";
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return "MP";
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return "HP";
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return "DMG";
  return null;
}

/** The quotes of a product's two finishes (data CardLite satisfies it); null = no row of that finish. */
export interface FinishQuotes {
  n: { market: number | null; low: number | null } | null;
  f: { market: number | null; low: number | null } | null;
}

/** The finish a binder row is held in. */
export const finishOfRow = (isFoil: boolean): Finish => (isFoil ? "F" : "N");

/**
 * A product's TCGplayer MARKET price in US cents for one finish. Market only: a unit with a single thin listing and no market
 * ("low only") has no value to put in a total, so it is unpriced here rather than valued at an asking price (track.ts marketOnlyCents).
 */
export function finishMarketCents(card: FinishQuotes, isFoil: boolean): number | null {
  const q = isFoil ? card.f : card.n;
  return q?.market != null && q.market > 0 ? q.market : null;
}

/** One copy's value in the visitor's currency: the finish's US market price converted, times the condition multiplier. null = unpriced. */
export function copyValueCents(card: FinishQuotes, isFoil: boolean, condition: string, country: Country): number | null {
  const usd = finishMarketCents(card, isFoil);
  return usd == null ? null : Math.round(usdCentsToCountry(usd, country) * (CONDITION_MULTIPLIER[condition] ?? 1));
}

/** The finish facts of a binder row's card as the editor and the share page carry them (collection-server CollectionCardInfo): the US market price of each finish, null = no row of that finish or low-only. */
export interface FinishInfo {
  hasN: boolean;
  hasF: boolean;
  marketN: number | null;
  marketF: number | null;
}

/** copyValueCents for a card already reduced to its FinishInfo (client components). */
export function infoCopyValueCents(info: FinishInfo, isFoil: boolean, condition: string, country: Country): number | null {
  return copyValueCents({ n: info.hasN ? { market: info.marketN, low: null } : null, f: info.hasF ? { market: info.marketF, low: null } : null }, isFoil, condition, country);
}
