// Price per booster pack, by product type: the set page's "cheapest way to buy <set> packs" strip, and every page that
// compares a box with an ETB or a bundle by what a pack costs (the product page's value check, the deals and cheapest-packs
// pages). Pure: no database, so it works on cards a page already loaded, and in the browser.
import type { ProductCardData } from "./data";
import { cardOpen } from "./compact";
import { packsForLabel, perPackCents } from "./packs";

// The pack-bearing types a buyer weighs against each other, in the order the
// strip shows them. Anything whose pack count varies per product (tins,
// collections) has no honest per-pack price and is left out.
export const PACK_TYPES = ["Booster Box", "Elite Trainer Box", "Pokémon Center Elite Trainer Box", "Booster Bundle", "Blister", "Sleeved Booster", "Booster Pack", "Build & Battle Box"];

/** One type's cheapest open product per pack: the product, its price per pack (cents) and the packs it holds. */
export interface PerPackPick {
  p: ProductCardData;
  perPack: number;
  packs: number;
}

/** Per type, the OPEN product with the lowest price per pack — from the set's products, already loaded. */
export function cheapestPerPackByType(products: ProductCardData[]): PerPackPick[] {
  const best = new Map<string, { p: ProductCardData; perPack: number; packs: number }>();
  for (const p of products) {
    if (!cardOpen(p) || !PACK_TYPES.includes(p.productType)) continue;
    const packs = packsForLabel(p.productType, p.setCode, p.name);
    const perPack = perPackCents(p.lowestPriceCents, packs);
    if (perPack == null || !packs) continue;
    const cur = best.get(p.productType);
    if (!cur || perPack < cur.perPack) best.set(p.productType, { p, perPack, packs });
  }
  return PACK_TYPES.filter((t) => best.has(t)).map((t) => best.get(t)!);
}
