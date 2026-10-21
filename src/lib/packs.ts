// How many booster packs a sealed product holds, so a price can be shown per
// pack — the number buyers actually compare a box, an ETB and a bundle on.
// Current-state arithmetic only: no history is involved.
//
// Only products whose pack count is fixed by the product line get a number.
// Collections, tins, UPCs and decks vary per product and return null rather
// than a guess. Sources are noted per entry; verified 2026-09 against
// pokemon.com / pokemoncenter.com product pages.
import { SET_BY_CODE } from "./sets";
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";

// Standard ETB pack count by series (Pokémon Center ETBs hold two more from
// Sword & Shield on). pokemon.com: XY / Sun & Moon / Sword & Shield ETBs
// "8 booster packs"; Scarlet & Violet and Mega Evolution "9 booster packs";
// PC ETB "two more than a standard ETB".
const ETB_BY_SERIES: Record<string, number> = {
  XY: 8,
  "Sun & Moon": 8,
  "Sword & Shield": 8,
  "Scarlet & Violet": 9,
  "Mega Evolution": 9,
};
const PC_ETB_BY_SERIES: Record<string, number> = {
  "Sword & Shield": 10,
  "Scarlet & Violet": 11,
  "Mega Evolution": 11,
};
// Special sets whose (only) ETB holds 10 packs: Generations, Shining Legends,
// Dragon Majesty, Hidden Fates, Champion's Path, Shining Fates, Pokémon GO,
// Crown Zenith. Celebrations is 10 four-card packs + 5 standard packs, so it
// has no honest per-pack price.
const ETB_BY_SET: Record<string, number | null> = {
  g1: 10,
  sm35: 10,
  sm75: 10,
  sm115: 10,
  swsh35: 10,
  swsh45: 10,
  pgo: 10,
  swsh12pt5: 10,
  cel25: null,
};

// Build & Battle Stadium: two kits (4 packs each) plus loose packs — 4 in
// Sword & Shield, 3 in Scarlet & Violet. None seen for Mega Evolution.
const STADIUM_BY_SERIES: Record<string, number> = {
  "Sword & Shield": 12,
  "Scarlet & Violet": 11,
};

const BOOSTER_BOX_PACKS = 36; // English display box; half boxes are refused by the classifier
const BOXES_PER_CASE = 6;
const ETBS_PER_CASE = 10;

/** Packs in one unit of the product, or null when the line doesn't fix it. */
export function packsFor(type: TypeKey, setCode: string | null, name = ""): number | null {
  const series = setCode ? SET_BY_CODE.get(setCode)?.series ?? null : null;
  switch (type) {
    case "booster-box":
      return BOOSTER_BOX_PACKS;
    case "booster-box-case":
      return BOOSTER_BOX_PACKS * BOXES_PER_CASE;
    case "booster-bundle":
      return 6;
    case "sleeved-booster":
    case "booster-pack":
      return 1;
    case "build-battle":
      return 4;
    case "build-battle-stadium":
      return series ? STADIUM_BY_SERIES[series] ?? null : null;
    case "etb": {
      if (setCode && setCode in ETB_BY_SET) return ETB_BY_SET[setCode];
      return series ? ETB_BY_SERIES[series] ?? null : null;
    }
    case "pc-etb":
      // a set whose ETB has no honest count (Celebrations) has none for its Pokémon Center ETB either
      if (setCode && ETB_BY_SET[setCode] === null) return null;
      return series ? PC_ETB_BY_SERIES[series] ?? null : null;
    case "etb-case": {
      const etb = packsFor("etb", setCode);
      return etb ? etb * ETBS_PER_CASE : null;
    }
    case "blister": {
      // The classifier keeps 1-pack and 2-pack blisters apart from the 3-pack
      // by name; the name says which this is. The count is read before
      // anything else: "Checklane 2-Pack Blister" holds two packs. A bare
      // "Checklane Blister" / "Premium Checklane Blister" holds one pack in
      // some sets and two in others (stores print both), so it gets no
      // per-pack price rather than a guess.
      if (/\b2[\s-]*(?:packs?|booster)\b|\btwo[\s-]*packs?\b/i.test(name)) return 2;
      if (/\b3[\s-]*(?:packs?|pk|booster)\b|\bthree[\s-]*packs?\b|\btriple\b/i.test(name)) return 3;
      if (/\b(?:single|1)[\s-]*(?:packs?|booster)\b/i.test(name)) return 1;
      return null;
    }
    default:
      return null; // upc, collection, tin, deck, booster-bundle-case: varies per product
  }
}

/** packsFor() by the product type LABEL a Product row carries ("Booster Box"). */
export function packsForLabel(typeLabel: string, setCode: string | null, name = ""): number | null {
  const t = TYPE_BY_LABEL.get(typeLabel);
  return t ? packsFor(t.key, setCode, name) : null;
}

/** Price per pack in cents, rounded, or null. */
export function perPackCents(priceCents: number | null | undefined, packs: number | null): number | null {
  if (!packs || !priceCents || priceCents <= 0) return null;
  return Math.round(priceCents / packs);
}
