// Minimum condition for Best Basket, Buy this list and the deck price watch
// (2026-09-29, owner: "picture a trading card player or collector: what would
// they pay for"). Pure and dependency-light on purpose: a "use client"
// component imports it (tests/client-imports.test.ts).
//
// THE RULE. A store's listing counts only if its condition is at or above the
// member's floor. It runs INSIDE lib/basket-server.ts loadStoreListings,
// BEFORE the cheapest-row-per-(card, store) reduction. After it, a store's Near
// Mint row would already have been dropped in favour of a cheaper Heavily
// Played one and the store would vanish from the plan. A card with nothing at
// the floor anywhere is "not covered" (the optimiser's `unbuyable`), never
// filled with a played copy.
//
// THE GRADE. lib/match.ts conditionRank (NM/Mint or unstated 0, LP 1,
// MP 2, HP 3, damaged 4), the importer's own ordering, so a listing's grade
// here is the one the importer chose it by. An unstated condition reads as
// Near Mint because that is what a store's headline price means.

import { conditionRank } from "./match";

/** "nm" Near Mint only, "lp" Lightly Played or better, "any" no floor. */
export type MinCondition = "nm" | "lp" | "any";

export const MIN_CONDITIONS: readonly MinCondition[] = ["nm", "lp", "any"];

/** What a NEW session or NEW deck watch starts on; "Anything" is one tap away. */
export const DEFAULT_MIN_CONDITION: MinCondition = "lp";

/** The switch's labels. */
export const MIN_CONDITION_LABEL: Record<MinCondition, string> = {
  nm: "NM only",
  lp: "LP or better",
  any: "Anything",
};

/** For a sentence: "priced at Near Mint only". */
export const MIN_CONDITION_PHRASE: Record<MinCondition, string> = {
  nm: "Near Mint only",
  lp: "Lightly Played or better",
  any: "any condition",
};

// The worst rank each floor lets through.
const MAX_RANK: Record<MinCondition, number> = { nm: 0, lp: 1, any: Number.POSITIVE_INFINITY };

/** The first rank below Lightly Played: moderately played, heavily played, damaged. */
export const PLAYED_RANK = 2;

export function isMinCondition(v: unknown): v is MinCondition {
  return v === "nm" || v === "lp" || v === "any";
}

/** A request's floor; anything unrecognised is `fallback` (the API's own default is "any"). */
export function parseMinCondition(v: unknown, fallback: MinCondition = "any"): MinCondition {
  return isMinCondition(v) ? v : fallback;
}

/** A stored DeckWatch.minCondition: null (every row saved before this) means any. */
export function storedMinCondition(v: string | null | undefined): MinCondition {
  return v === "nm" || v === "lp" ? v : "any";
}

/** What to write to DeckWatch.minCondition: "any" is null. */
export function toStoredMinCondition(m: MinCondition): "nm" | "lp" | null {
  return m === "nm" || m === "lp" ? m : null;
}

/** The grade of a store's own condition label (null / unstated = Near Mint). */
export function listingRank(condition: string | null | undefined): number {
  return conditionRank(condition ?? "");
}

/** May a listing with this condition label be used at this floor? */
export function meetsMinCondition(condition: string | null | undefined, floor: MinCondition): boolean {
  return listingRank(condition) <= MAX_RANK[floor];
}

/** Copies in a plan's lines that are below Lightly Played (MP, HP, damaged). */
export function playedCopyCount(lines: { qty: number; condition: string | null | undefined }[]): number {
  let n = 0;
  for (const l of lines) if (listingRank(l.condition) >= PLAYED_RANK) n += l.qty;
  return n;
}

/**
 * The free total's honesty line. Not an entitlement: any account is told when
 * the cheapest copies it was priced on include played ones.
 */
export function playedCopiesNote(n: number): string {
  return `Includes ${n} played ${n === 1 ? "copy" : "copies"} (below Lightly Played)`;
}

/** What Best Basket remembers per member (User.basketPrefs, Json). */
export interface BasketPrefs {
  minCondition?: MinCondition;
}

export function parseBasketPrefs(raw: unknown): BasketPrefs {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return isMinCondition(o.minCondition) ? { minCondition: o.minCondition } : {};
}

/** A member's starting floor: their last choice, else the default for new sessions. */
export function initialMinCondition(prefs: BasketPrefs | null | undefined): MinCondition {
  return prefs?.minCondition ?? DEFAULT_MIN_CONDITION;
}
