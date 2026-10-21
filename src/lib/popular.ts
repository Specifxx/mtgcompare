// What the owner wants pushed hardest on eBay: the sets people are buying NOW, and the markets that matter most.
// Pure and tiny, shared by the daily eBay import (which searches these first) and the pages (which highlight their eBay link).
//
// EDIT HERE: the hot sets are the owner's call, most wanted first. A set code is the one in sets.ts ("cel30" is 30th
// Celebration). An unreleased set does nothing until it is out (the importer refuses pre-sale listings).

/** The hot sets, most wanted first: 30th Celebration, then the newest Mega Evolution sets, then the evergreen chase sets. */
export const HOT_SETS: readonly string[] = ["cel30", "me5", "me4", "me2pt5", "sv8pt5", "me3", "me2", "sv3pt5"];

/**
 * The words an eBay search uses for a hot set, where sellers do not write the set's name as sets.ts has it: 30th Celebration is
 * listed as "30th Anniversary Celebration", "30th Anniversary" or "30th Celebration", and eBay requires every keyword, so "30th"
 * finds them all. Any other set is searched by its name.
 */
export const HOT_SET_QUERY: Readonly<Record<string, string>> = { cel30: "30th", sv3pt5: "151" };

/** Is this set one of the hot ones? */
export const isHotSet = (code: string | null | undefined): boolean => !!code && HOT_SETS.includes(code);

/** A hot set's rank (0 = the most wanted), or Infinity for any other set: the order the importer spends in. */
export const hotRank = (code: string | null | undefined): number => {
  const i = code ? HOT_SETS.indexOf(code) : -1;
  return i < 0 ? Infinity : i;
};

/** The eBay sites in the owner's priority order: the US first, then the UK and the EU (eBay.de); Australia/NZ and Canada get what is left. */
export const PRIORITY_MARKETPLACES = ["EBAY_US", "EBAY_GB", "EBAY_DE"] as const;
