import { featureOrder } from "./release";

// What the owner wants pushed hardest on eBay: the sets people are buying NOW, and the markets that matter most.
// Pure and tiny, shared by the daily eBay import (which searches these first) and the pages (which highlight their eBay link).
//
// EDIT HERE: the hot sets are the owner's call, most wanted first. A set code is the one in sets.ts ("trk" is Star Trek). An
// unreleased set does nothing until it is out (the importer refuses pre-sale listings).

/** The hot sets, the owner's list (pages feature them in hotSetsByFeature order: the newest released set first, never a pre-order). */
export const HOT_SETS: readonly string[] = ["trk", "fra", "hob", "msh", "sos", "ecl", "tla", "fin"];

/**
 * The words an eBay search uses for a hot set, where sellers do not write the set's name as sets.ts has it: The Hobbit is listed
 * as "The Hobbit", "Hobbit" or "LOTR Hobbit", and eBay requires every keyword, so "Hobbit" finds them all; Avatar: The Last
 * Airbender is often just "Avatar". Any other set is searched by its name.
 */
export const HOT_SET_QUERY: Readonly<Record<string, string>> = { hob: "Hobbit", tla: "Avatar" };

/** Is this set one of the hot ones? */
export const isHotSet = (code: string | null | undefined): boolean => !!code && HOT_SETS.includes(code);

/**
 * The hot sets in the order pages feature them (release.ts featureOrder): the newest released set first, the set on pre-order
 * second, then the owner's order. By date, so it moves on by itself on release day.
 */
export const hotSetsByFeature = (today: string = new Date().toISOString().slice(0, 10)): string[] => featureOrder(HOT_SETS, today);

/** A hot set's rank in the owner's order (0 = the most wanted), or Infinity for any other set: the order the eBay importer spends in. */
export const hotRank = (code: string | null | undefined): number => {
  const i = code ? HOT_SETS.indexOf(code) : -1;
  return i < 0 ? Infinity : i;
};

/** A hot set's rank in featuring order (hotSetsByFeature), or Infinity: the order pages lead with. */
export const featureRank = (code: string | null | undefined, today?: string): number => {
  const i = code ? hotSetsByFeature(today).indexOf(code) : -1;
  return i < 0 ? Infinity : i;
};

/** The eBay sites in the owner's priority order: the US first, then the UK and the EU (eBay.de); Australia/NZ and Canada get what is left. */
export const PRIORITY_MARKETPLACES = ["EBAY_US", "EBAY_GB", "EBAY_DE"] as const;
