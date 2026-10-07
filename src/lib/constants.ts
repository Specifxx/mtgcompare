// One Piece Card Game vocabulary: colours, rarities, card types, printings and
// set kinds. The UI's filter chips, hubs and badges all read from here.

export const COLORS = {
  Red: { label: "Red", hex: "#e0383e", tagline: "Aggression & rush", slug: "red" },
  Green: { label: "Green", hex: "#21a35f", tagline: "Rest & ramp", slug: "green" },
  Blue: { label: "Blue", hex: "#2f7fd6", tagline: "Bounce & hand control", slug: "blue" },
  Purple: { label: "Purple", hex: "#8d4fd0", tagline: "DON!! manipulation", slug: "purple" },
  Black: { label: "Black", hex: "#7d8794", tagline: "Removal & cost reduction", slug: "black" },
  Yellow: { label: "Yellow", hex: "#e9c22a", tagline: "Life & triggers", slug: "yellow" },
} as const;
export type ColorKey = keyof typeof COLORS;
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];

export function isColor(v: string): v is ColorKey {
  return Object.prototype.hasOwnProperty.call(COLORS, v);
}

export const RARITIES: Record<string, { label: string; order: number; tone: string }> = {
  L: { label: "Leader", order: 0, tone: "text-amber-300" },
  C: { label: "Common", order: 1, tone: "text-slate-300" },
  UC: { label: "Uncommon", order: 2, tone: "text-emerald-300" },
  R: { label: "Rare", order: 3, tone: "text-sky-300" },
  SR: { label: "Super Rare", order: 4, tone: "text-purple-300" },
  SEC: { label: "Secret Rare", order: 5, tone: "text-rose-300" },
  TR: { label: "Treasure Rare", order: 6, tone: "text-amber-200" },
  PR: { label: "Promo", order: 7, tone: "text-lime-300" },
  "DON!!": { label: "DON!!", order: 8, tone: "text-amber-300" },
};
export const RARITY_KEYS = Object.keys(RARITIES).sort((a, b) => RARITIES[a].order - RARITIES[b].order);

export function rarityLabel(r: string | null | undefined): string {
  if (!r) return "—";
  return RARITIES[r]?.label ?? r;
}

export const CARD_TYPES = ["Leader", "Character", "Event", "Stage", "DON!!"] as const;

// A printing is the collector's question: "which version of this card is it?"
// One card number can have several (OP01-120 Shanks: standard, Parallel, Manga).
export const PRINTINGS: Record<string, { label: string; dot: string; order: number }> = {
  standard: { label: "Standard", dot: "#7d8794", order: 0 },
  alt: { label: "Parallel / Alt art", dot: "#e9c22a", order: 1 },
  manga: { label: "Manga", dot: "#e0383e", order: 2 },
  sp: { label: "SP", dot: "#8d4fd0", order: 3 },
  treasure: { label: "Treasure Rare", dot: "#f0b429", order: 4 },
  foil: { label: "Special foil", dot: "#2f7fd6", order: 5 },
  reprint: { label: "Reprint", dot: "#94a3b8", order: 6 },
  promo: { label: "Promo", dot: "#84cc16", order: 7 },
  don: { label: "DON!!", dot: "#f59e0b", order: 8 },
};
export const PRINTING_KEYS = Object.keys(PRINTINGS).sort((a, b) => PRINTINGS[a].order - PRINTINGS[b].order);

export const SET_KINDS: Record<string, { label: string; plural: string; order: number }> = {
  booster: { label: "Booster set", plural: "Booster sets", order: 0 },
  extra: { label: "Extra booster", plural: "Extra boosters", order: 1 },
  premium: { label: "Premium booster", plural: "Premium boosters", order: 2 },
  starter: { label: "Starter deck", plural: "Starter & ultra decks", order: 3 },
  promo: { label: "Promos", plural: "Promotion cards", order: 4 },
  event: { label: "Event cards", plural: "Pre-release & event cards", order: 5 },
  collection: { label: "Collection", plural: "Collections & other", order: 6 },
};

export const SEALED_KINDS = [
  "Booster Box",
  "Booster Case",
  "Booster Pack",
  "Sleeved Booster Pack",
  "Double Pack Set",
  "Starter Deck",
  "Display",
  "Display Case",
  "Premium Collection",
  "Gift Collection",
  "Illustration Box",
  "Tin Pack Set",
  "Devil Fruits Collection",
  "DON!! Pack",
  "Collection",
  "Promo Pack",
] as const;
export type SealedKind = (typeof SEALED_KINDS)[number];

export function sealedKindSlug(k: string): string {
  return k.toLowerCase().replace(/!!/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
