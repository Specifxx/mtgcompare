// Suggested retail prices (MSRP) of sealed Magic products, in US dollars.
//
// EMPTY ON PURPOSE. A row exists only for an MSRP that Wizards of the Coast or
// a first-party retailer announced and that someone checked against that
// announcement: `source` names it and `checkedOn` dates the check. Nothing here
// is inferred from a street price or copied from a reseller. Until the owner
// supplies verified rows, every lookup answers null and no page shows an
// "at RRP" figure or a gap to one (tests/msrp.test.ts pins the shape).

export interface MsrpRow {
  /** TCGplayer product id of the sealed product. */
  productId: number;
  /** US dollars, in cents. */
  usdCents: number;
  /** The announcement the figure comes from. */
  source: { title: string; url: string };
  /** YYYY-MM-DD the figure was checked against `source`. */
  checkedOn: string;
}

export const MSRP: readonly MsrpRow[] = [];

const BY_ID: ReadonlyMap<number, MsrpRow> = new Map(MSRP.map((r) => [r.productId, r] as const));

/** The verified MSRP of a sealed product, or null (the usual answer). */
export function msrpOf(productId: number): MsrpRow | null {
  return BY_ID.get(productId) ?? null;
}
