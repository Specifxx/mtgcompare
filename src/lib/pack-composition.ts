// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS IN A MAGIC BOOSTER PACK, SLOT BY SLOT, AND WHAT IS PUBLISHED
// ─────────────────────────────────────────────────────────────────────────────
// Unlike a game whose publisher keeps its pull rates private, Wizards of the
// Coast publishes the slot structure of its boosters. This module holds those
// structures as a per-product slot table: a booster type has slots, a slot says
// how many cards it yields and which pools they come from, with weights.
//
// WHAT IS NOT HERE. A figure appears only if Wizards published it for that
// product (`sourced: true`, with the article named in `source`). Where the
// publication gives a structure but no split (the wildcard slots of a Play
// Booster can be any rarity and any treatment), the slot is listed with
// `pools: []`: it is shown, it adds nothing to the expected value by default,
// and the calculator lets the visitor assign a rate. Collector, Set, Jumpstart
// and Commander products vary set by set and are not modelled here at all; the
// sealed page shows the contents text the store catalogue gives for them.
// Nothing below is a community estimate.

/** Pool keys a slot can draw from (lib/box-ev.ts holds the pools' definitions). */
export type SlotPool = "Common" | "Uncommon" | "Rare" | "Mythic" | "Land";

export interface SlotMix { pool: SlotPool; weight: number }

export interface PackSlot {
  key: string;
  label: string;
  /** How many cards of this slot are in every pack. */
  count: number;
  /** The pools one card of this slot is drawn from, with weights that sum to 1. Empty: Wizards publishes no split, so no value is assumed. */
  pools: readonly SlotMix[];
  note: string;
  /** Wizards states this outright for the product. */
  sourced: boolean;
}

export interface BoosterType {
  key: "play" | "draft";
  label: string;
  /** The product-name words that put a sealed box in this type (lower case). */
  match: RegExp;
  /** Playable cards per pack (an art, token or ad card is not counted). */
  cardsPerPack: number;
  /** The usual pack count of a booster box of this type; a product's own `packCount` wins. */
  defaultPacks: number;
  slots: readonly PackSlot[];
  /** Where the structure is published. */
  source: { title: string; url: string } | null;
  sourceNote: string;
}

/** The Murders at Karlov Manor announcement: rare 6 of 7 times, mythic 1 of 7. */
export const NUTS_AND_BOLTS_PLAY_BOOSTERS = { title: "Nuts & Bolts #16: Play Boosters (Wizards of the Coast)", url: "https://magic.wizards.com/en/news/making-magic/nuts-and-bolts-16-play-boosters" } as const;

export const PLAY_BOOSTER: BoosterType = {
  key: "play",
  label: "Play Booster",
  match: /play booster/,
  cardsPerPack: 14,
  defaultPacks: 30,
  source: NUTS_AND_BOLTS_PLAY_BOOSTERS,
  sourceNote: "Structure as announced with Murders at Karlov Manor; later sets keep the 14-card layout with small changes (the common count, the land slot), so check the set's own collecting article.",
  slots: [
    { key: "common", label: "Common", count: 7, pools: [{ pool: "Common", weight: 1 }], sourced: true, note: "Six commons and a seventh common slot (which can hold a The List reprint; that part is not valued)." },
    { key: "uncommon", label: "Uncommon", count: 3, pools: [{ pool: "Uncommon", weight: 1 }], sourced: true, note: "Always an uncommon of the main set." },
    { key: "rare", label: "Rare or mythic", count: 1, pools: [{ pool: "Rare", weight: 6 / 7 }, { pool: "Mythic", weight: 1 / 7 }], sourced: true, note: "A rare 6 out of 7 times and a mythic rare 1 out of 7." },
    { key: "land", label: "Land", count: 1, pools: [{ pool: "Land", weight: 1 }], sourced: true, note: "A basic or common land of the main set." },
    { key: "wild", label: "Wildcard (non-foil)", count: 1, pools: [], sourced: true, note: "Any rarity, and possibly a Booster Fun variant. No split is published, so it adds nothing here until you set a rate." },
    { key: "foil", label: "Wildcard (traditional foil)", count: 1, pools: [], sourced: true, note: "Any rarity, guaranteed traditional foil. No split is published, so it adds nothing here until you set a rate." },
  ],
};

/** The 15-card Draft Booster that Play Boosters replaced. */
export const DRAFT_BOOSTER: BoosterType = {
  key: "draft",
  label: "Draft Booster",
  match: /draft booster/,
  cardsPerPack: 15,
  defaultPacks: 36,
  source: null,
  sourceNote: "The long-standing layout of Draft Boosters. The split of the rare slot is not taken from a Wizards figure, so it starts at the Play Booster's published 6 in 7 and you can edit it.",
  slots: [
    { key: "common", label: "Common (with the land slot)", count: 10, pools: [{ pool: "Common", weight: 1 }], sourced: false, note: "Ten commons; one of the ten slots could hold a basic land in older sets." },
    { key: "uncommon", label: "Uncommon", count: 3, pools: [{ pool: "Uncommon", weight: 1 }], sourced: false, note: "Three uncommons." },
    { key: "rare", label: "Rare or mythic", count: 1, pools: [{ pool: "Rare", weight: 6 / 7 }, { pool: "Mythic", weight: 1 / 7 }], sourced: false, note: "One rare or mythic rare." },
  ],
};

export const BOOSTER_TYPES: readonly BoosterType[] = [PLAY_BOOSTER, DRAFT_BOOSTER];

/** The booster type a sealed box or pack is made of, from its name; null for products Wizards' published structures do not cover (Collector, Set, Jumpstart, Commander...). */
export function boosterTypeOf(productName: string): BoosterType | null {
  const n = productName.toLowerCase();
  if (/collector|set booster|jumpstart|commander|bundle|prerelease|secret lair/.test(n)) return null;
  return BOOSTER_TYPES.find((b) => b.match.test(n)) ?? null;
}

export const cardsInPack = (b: BoosterType): number => b.slots.reduce((n, s) => n + s.count, 0);

/**
 * The pack as prose: "7 common, 3 uncommon, 1 rare or mythic, 1 land, 1 wildcard (non-foil), 1 wildcard (traditional foil)".
 */
export const packSummary = (b: BoosterType): string => b.slots.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");
