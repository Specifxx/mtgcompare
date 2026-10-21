// The product families the editorial pages group products by (src/content/live.ts has the reads). Pure: no database, no React, so
// the registries, the share-card routes and the tests import it freely.
//
// Products are grouped by their own name ("… Play Booster Box", "… Collector Booster Display"), not by the product type table, so a
// page reads the same whichever type key the importer files a product under. A family states a pack count only where every product
// of it has the same one (a Collector Booster box: 12 packs; a Draft Booster box: 36; a Set Booster box: 30). A Play Booster box
// held 36 packs in the first sets and 30 in later ones, so its count is read from the product's own name when the name says it
// ("30 packs"), and is otherwise left out: no per-pack price is ever guessed.
import type { ProductCardData } from "../lib/data";
import type { Market } from "../lib/regions";
import { REGION_LIST } from "../lib/regions";

export type MarketCard = ProductCardData & { market: Market };

export interface Family {
  key: FamilyKey;
  /** Singular, as a table row names it. */
  label: string;
  plural: string;
  /** What the product name must contain (case-insensitive): the capped read's filter. */
  query: string;
  /** The whole test on the product name. */
  match: RegExp;
  /** Packs in every product of the family, or null when it differs (or is not a pack product). */
  packs: number | null;
}

export type FamilyKey = "play-box" | "collector-box" | "draft-box" | "set-box" | "bundle" | "commander" | "play-pack" | "collector-pack" | "prerelease";

const BOX = String.raw`(?:booster\s+)?(?:box|display)\b`;

export const FAMILIES: readonly Family[] = [
  { key: "play-box", label: "Play Booster Box", plural: "Play Booster Boxes", query: "Play Booster", match: new RegExp(String.raw`\bplay\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: null },
  { key: "collector-box", label: "Collector Booster Box", plural: "Collector Booster Boxes", query: "Collector Booster", match: new RegExp(String.raw`\bcollector\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 12 },
  { key: "draft-box", label: "Draft Booster Box", plural: "Draft Booster Boxes", query: "Draft Booster", match: new RegExp(String.raw`\bdraft\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 36 },
  { key: "set-box", label: "Set Booster Box", plural: "Set Booster Boxes", query: "Set Booster", match: new RegExp(String.raw`\bset\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 30 },
  { key: "bundle", label: "Bundle", plural: "Bundles", query: "Bundle", match: /\bbundle\b(?!.*\bcase\b)/i, packs: null },
  { key: "commander", label: "Commander Deck", plural: "Commander Decks", query: "Commander", match: /\bcommander\s+deck\b|\bcommander\b.*\bprecon\b/i, packs: null },
  { key: "play-pack", label: "Play Booster pack", plural: "Play Booster packs", query: "Play Booster", match: /\bplay\s+booster\b(?!.*\b(?:box|display|case|bundle)\b)/i, packs: 1 },
  { key: "collector-pack", label: "Collector Booster pack", plural: "Collector Booster packs", query: "Collector Booster", match: /\bcollector\s+booster\b(?!.*\b(?:box|display|case|bundle)\b)/i, packs: 1 },
  { key: "prerelease", label: "Prerelease Pack", plural: "Prerelease Packs", query: "Prerelease", match: /\bprerelease\s+(?:pack|kit)\b/i, packs: null },
];

export const FAMILY: Readonly<Record<FamilyKey, Family>> = Object.fromEntries(FAMILIES.map((f) => [f.key, f])) as Record<FamilyKey, Family>;

/** The booster-box families, in the order the pages list them. */
export const BOX_FAMILIES: readonly FamilyKey[] = ["play-box", "collector-box", "draft-box", "set-box"];

/** The family a product name belongs to (the first that matches, boxes before packs), or null. */
export function familyOf(name: string): Family | null {
  return FAMILIES.find((f) => f.match.test(name)) ?? null;
}

/** Packs in a product: the family's fixed count, else the count its own name states ("30 Packs", "36-pack"), else null. */
export function packsOf(p: Pick<ProductCardData, "name">, fam: Family | null = familyOf(p.name)): number | null {
  if (fam?.packs != null) return fam.packs;
  const m = /\b(\d{1,2})[-\s]*(?:booster\s+)?packs?\b/i.exec(p.name);
  const n = m ? Number(m[1]) : null;
  return n && n >= 2 && n <= 48 ? n : null;
}

/** Price per pack in the product's own currency (cents), or null where the pack count is not known. */
export function perPackOf(p: Pick<ProductCardData, "name" | "lowestPriceCents">): number | null {
  const packs = packsOf(p);
  return packs && p.lowestPriceCents != null && p.lowestPriceCents > 0 ? Math.round(p.lowestPriceCents / packs) : null;
}

/** Buyable now: a store has it in stock, or TCGplayer does. */
export const isOpenCard = (p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">) => p.inStockStores > 0 || p.marketplaceOpen;

/** "12 stores", "4 stores + TCGplayer", "TCGplayer" or "—". */
export function whereText(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">): string {
  if (p.inStockStores > 0) return `${p.inStockStores} store${p.inStockStores === 1 ? "" : "s"}${p.marketplaceOpen ? " + TCGplayer" : ""}`;
  return p.marketplaceOpen ? "TCGplayer" : "—";
}

const cheapestFirst = (a: ProductCardData, b: ProductCardData) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0);

/** Per market, the cheapest open product of a family among `cards` (in REGION_LIST order; never sorted by price: currencies differ). */
export function cheapestPerMarket(cards: readonly MarketCard[], key: FamilyKey, keep: (p: MarketCard) => boolean = () => true): { market: Market; p: MarketCard | null }[] {
  return REGION_LIST.map((r) => ({
    market: r.market,
    p: cards.filter((c) => c.market === r.market && familyOf(c.name)?.key === key && isOpenCard(c) && keep(c)).sort(cheapestFirst)[0] ?? null,
  }));
}

