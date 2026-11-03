// Price sanity for the rows the import builds itself (TCGplayer and eBay).
// Store rows are checked as they match (scripts/import-all.ts, step 1); these
// two were trusted as they came, and showed a US$1.00 TCGplayer "low" on a
// US$150 booster box and a booster-box listing as a booster pack on eBay.

/** TCGplayer's "low" is its single cheapest listing, junk included. Under half
 *  the market price it is a mislisting or a damaged copy, not a price anyone
 *  can count on: show the market price instead. Below US$3 (the store rule's
 *  floor) a cent-level low is normal and stays. */
export function tcgplayerOfferCents(lows: number[], ref: number | null | undefined): number | null {
  const low = lows.length ? Math.min(...lows) : null;
  if (low == null) return ref ?? null;
  if (ref != null && ref >= 300 && low < ref * 0.5) return ref;
  return low;
}

/** The USD price an eBay row is judged against: TCGplayer's reference, or for a
 *  product TCGplayer doesn't price yet (a launch-week pack) the cheapest
 *  in-stock store price. Null means nothing to judge by. */
export function ebayReferenceUsd(ref: number | null | undefined, storeUsd: number[]): number | null {
  if (ref != null) return ref;
  return storeUsd.length ? Math.min(...storeUsd) : null;
}

/** An eBay row is shown only against a reference, and only within a quarter to
 *  four times it (the store rule): outside that it is another product. */
export function ebayTrusted(usd: number, reference: number | null): boolean {
  return reference != null && usd >= reference * 0.25 && usd <= reference * 4;
}
