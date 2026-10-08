// src/lib/match.ts (owner WP03; the entry points and their types are FROZEN by the contract, the bodies are WP03's, specified by design/stores-brief.md section 5 and its real titles).
// Critique 4: the matcher API was not declared, but wave-A code (the importer, the eBay pass) calls it. A listing is matched to ONE (product, finish) or not at all; ambiguity is a skip, never a guess.
import type { Finish, TreatmentKey } from "./constants";

/** One row per catalogue product the matcher may emit. Built by the importer from the TCGCSV + Scryfall files it already holds IN MEMORY (the importer reads nothing from Neon). */
export interface MatchRow {
  id: number;                          // productId
  groupId: number;
  /** folded name forms of nameForms(): TCG base name, Scryfall name, front face, each face, flavor name. */
  names: readonly string[];
  sc: string | null;                   // Scryfall set code (the group's majority code for an unjoined product)
  setNames: readonly string[];         // Scryfall set name and TCG group name with prefix variants, folded
  nkey: string | null;                 // Scryfall collector number key (TCG Number only as a fallback)
  treat: readonly TreatmentKey[];
  /** which finishes the product has (PRICE_MASK.HASN / HASF) and whether it is the etched family member */
  hasN: boolean;
  hasF: boolean;
  etched: boolean;
  rootId: number | null;
  cls: number;
}
export interface SealedRef { id: number; name: string; setCode: string | null; kind: string }
export type CardIndex = ReadonlyMap<string, readonly unknown[]>;        // opaque to callers; built only by buildCardIndex
export type NameIndex = ReadonlyMap<string, number>;                    // -1 = more than one product
export interface StoreMatchIndexes { cards: CardIndex; names: NameIndex; sealed: readonly SealedRef[] }
export declare function buildCardIndex(rows: readonly MatchRow[]): CardIndex;
export declare function buildNameIndex(rows: readonly MatchRow[]): NameIndex;
export interface StoreListingInput {
  title: string;
  skus: readonly (string | null | undefined)[];
  tags?: readonly string[] | string | null;
  productType?: string | null;
  /** the variant's option values / title, for finish and language ("Near Mint Foil", "English / Foil") */
  variantTitle?: string | null;
  options?: readonly string[];
  /** the store's explicitFoil convention */
  explicitFoil?: boolean;
}
export type StoreMatchPath = "sku" | "set-number" | "name-set" | "sealed";
/** The matched unit: a product AND the finish the LISTING sells (decided from the variant, the SKU, then the title; never from the headline). */
export interface StoreMatch { id: number; finish: Finish; path: StoreMatchPath }
export interface StoreMiss { miss: string }
export declare function matchStoreProduct(listing: StoreListingInput, ix: StoreMatchIndexes): StoreMatch | StoreMiss;
/** eBay (WP05) title matching: the name and set, and the finish words, WITHOUT a store's SKU/variant paths. */
export declare function matchCardTitle(title: string, idx: CardIndex): { id: number; finish: Finish | null } | StoreMiss;
export declare function titleNamesSet(title: string, setCode: string | null | undefined, setName: string | null | undefined): boolean;
/** KEPT from OP with their signatures (imported by store-import, import, the eBay modules and basket-condition): WP03 keeps the bodies that survive the move to (set, number, finish) matching. */
export interface StoreVariant { title: string; price: string; available: boolean }
export declare function bestVariant(variants: StoreVariant[]): { priceCents: number; condition: string | null } | null;
export declare function anyVariant(variants: StoreVariant[]): number | null;
export declare function plausibleSinglePrice(priceUsdCents: number, marketUsdCents: number | null): boolean;
export declare function plausibleSealedPrice(priceUsdCents: number, marketUsdCents: number | null): boolean;
export declare function foreignByTags(tags: string[] | string | null | undefined, productType?: string | null): boolean;
export declare function canonSet(name: string): string;
export declare function cardNumbersIn(title: string): string[];
export declare function skuCardNumber(skus: (string | null | undefined)[]): string | null;
export declare function matchByName(title: string, idx: NameIndex): number | null;
export declare function matchCardBySku(title: string, skus: (string | null | undefined)[], idx: CardIndex): { id: number } | { miss: string };
export declare function matchSealedTitle(title: string, sealed: readonly SealedRef[]): { id: number } | { miss: string };
export declare function setCodesIn(title: string): string[];
/** OP's, kept: condition ranking and labels (NM, LP, MP, HP, DMG; a store that states none is `null`, never NM). */
export declare function conditionRank(label: string): number;
export declare function conditionLabel(label: string | null | undefined): string | null;
/** The one-row-per-(store, product, finish) rule applied BEFORE any batch write (critique budget 5): in stock first, best condition first, lowest price, lowest path. */
export interface OfferDraft { productId: number; finish: Finish; priceCents: number; inStock: boolean; condition: string | null; path: string }
export declare function collapseOffers(drafts: readonly OfferDraft[]): { rows: OfferDraft[]; collapsed: number };
