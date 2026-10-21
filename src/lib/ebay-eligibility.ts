// Which products earn their OWN eBay listings (an "item" feed), and at what price. Pure and tiny: the importer
// (ebay-import.ts) plans by it and the product page (app/[region]/p/[slug]) places its strip by it, so the two cannot
// disagree about what "eligible" means. Reference prices and thresholds use the importer's rough FX table
// (sealed-title.ts FLOOR_FX) and are never shown.
import type { PlanRow } from "./ebay-store";
import { roughUsdCents, type TypeKey } from "./sealed-title";

export const ITEM_CORE_USD = 50; // gated types need this much to be eligible
export const ITEM_FLOOR_USD = 25; // never below this, extension included
/**
 * A reference price above this, for a type whose real prices are modest, is a placeholder ask ("CA$9,999" on a blister, a
 * sold-out "$10,000" tin: the 2026-10 data has hundreds) and not the product's price. Such a key is not eligible: an eBay search
 * for it would find nothing relevant, and ranked by price it would eat the day's calls ahead of real products.
 */
export const GATED_MAX_USD = 600;


/** Always worth their own listings (when they clear US$25): the products whose price is real money. */
export const ALWAYS_TYPES: ReadonlySet<TypeKey> = new Set<TypeKey>(["booster-box", "booster-box-case", "etb", "pc-etb", "etb-case", "booster-bundle-case", "upc", "build-battle-stadium"]);
/** Worth them only at US$50 or more (core), or between US$25 and 50 when the budget reaches (extension). */
export const GATED_TYPES: ReadonlySet<TypeKey> = new Set<TypeKey>(["collection", "tin", "deck", "booster-bundle", "build-battle", "blister"]);
// booster-pack and sleeved-booster are never eligible.

export type Tier = "core" | "extension" | "no";

/** The reference price in US dollars (cents/100), from the market's cheapest OPEN price, else its cheapest listed (sold-out) one. null = unknown. */
export function referenceUsd(row: Pick<PlanRow, "market" | "openCents" | "anyCents">): number | null {
  const cents = row.openCents ?? row.anyCents;
  return cents == null || cents <= 0 ? null : roughUsdCents(cents, row.market) / 100;
}

export function tierOf(type: TypeKey, usd: number | null): Tier {
  if (usd == null || usd < ITEM_FLOOR_USD) return "no";
  if (ALWAYS_TYPES.has(type)) return "core";
  if (GATED_TYPES.has(type)) return usd > GATED_MAX_USD ? "no" : usd >= ITEM_CORE_USD ? "core" : "extension";
  return "no";
}
