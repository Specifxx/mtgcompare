// Official US MSRP (The Pokémon Company International's list prices), so US
// pages can say "below MSRP" — a fact about today's listing, not history.
//
// US only: TPCi publishes US MSRP (Pokémon Center list prices and its news
// posts); no other region has an official, published RRP, so the site never
// prints one there. Two tiers are on shelves at once since the late-2025
// increase: Scarlet & Violet-era sets and Mega Evolution-era sets. Earlier
// series carried different prices (a Sword & Shield pack at $3.99, its ETB at $39.99) and
// are left out rather than guessed.
import { SET_BY_CODE } from "./sets";
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";

export const RRP_AS_OF = "2026-09";

const TIERS: Record<string, Partial<Record<TypeKey, number>>> = {
  // Pokémon Center list prices, 2023–2025: booster pack $4.49, booster display
  // box $161.64 (36 × $4.49), booster bundle $26.94, ETB $49.99, PC ETB $59.99.
  // ($3.99 a pack was the Sword & Shield price; the series change raised it.)
  "Scarlet & Violet": {
    "booster-pack": 449,
    "sleeved-booster": 449,
    "booster-box": 16164, // 36 × $4.49
    "booster-bundle": 2694, // 6 × $4.49
    etb: 4999,
    "pc-etb": 5999,
    "build-battle": 2999,
  },
  // pokemon.com Mega Evolution product pages, TCGplayer ME buyer's guide
  // ("$4.49 per booster pack"), Pokémon Center's $59.99 ME PC ETB, 30th
  // Celebration list prices, 2025–2026: the same list prices as Scarlet & Violet.
  "Mega Evolution": {
    "booster-pack": 449,
    "sleeved-booster": 449,
    "booster-box": 16164, // 36 × $4.49
    "booster-bundle": 2694, // 6 × $4.49
    etb: 4999,
    "pc-etb": 5999,
    "build-battle": 2999,
  },
};

/** US MSRP in cents for a set product, or null when TPCi publishes none we trust. */
export function usMsrpCents(type: TypeKey, setCode: string | null): number | null {
  if (!setCode) return null;
  const series = SET_BY_CODE.get(setCode)?.series;
  if (!series) return null;
  return TIERS[series]?.[type] ?? null;
}

/** usMsrpCents() by the product type LABEL a Product row carries; null outside the US. */
export function usMsrpForCard(market: string, typeLabel: string, setCode: string | null): number | null {
  if (market !== "US") return null;
  const t = TYPE_BY_LABEL.get(typeLabel);
  return t ? usMsrpCents(t.key, setCode) : null;
}

/** The one-line disclosure that goes wherever an MSRP is printed. */
export const RRP_NOTE = `MSRP is TPCi's US list price (as of ${RRP_AS_OF}); stores set their own.`;
