// The "Best price" row's treatment (owner, 2026-11-18, DECISIONS.md "A plain best price on a plain store"). The loud marking (the raised
// ground and green edge of `.or-hl`, the green badge) is kept for a best price that is one of OUR paid rows (eBay, TCGplayer, Amazon, an
// affiliate/partner store). A plain store that is simply the cheapest gets a small neutral "Best price" chip and the price, nothing more,
// with a short hint to also check the paid rows that exist. Pure: the row's classes and the hint's words are decided here and tested.

/** The fields of a row (OfferRows.tsx StoreRowData) that say whether it is paid. */
export interface BestRowFacts {
  kind?: "tcgplayer" | "amazon";
  sponsored: boolean;
}

/** True when the row earns us nothing: a store row with no pinned `kind` and no affiliate link. */
export function isPlainBest(d: BestRowFacts): boolean {
  return !d.kind && !d.sponsored;
}

/**
 * The hint beside a plain "Best price" chip, naming only the rows the list really has (eBay's row is always there in the pinned table;
 * TCGplayer's only where the table has one). Null when the list has neither: then there is nothing to point at, and no hint is drawn.
 * Never says another row is cheaper.
 */
export function bestHint(has: { ebay: boolean; tcgplayer: boolean }): string | null {
  const names = [has.ebay ? "eBay" : null, has.tcgplayer ? "TCGplayer" : null].filter((n): n is string => n != null);
  return names.length ? `Prices and stock change: also check ${names.join(" and ")}` : null;
}
