// "Price" or "Price + shipping": how the product page's price table ranks (the visitor's choice; the default stays price, the site's
// ranking rule: in stock first, then cheapest). Pure and client-safe: the table's rows re-rank in the browser when the toggle changes.

export type ShipMode = "price" | "total";

export interface RankableRow {
  open: boolean;
  cents: number;
  /** The cheapest measured shipping for the row (cents), or null when unknown. */
  ship: { min: number } | null;
}

/**
 * The rows in the order the mode ranks them. "price": as given (the server's order). "total": the open rows with known shipping by
 * price + their cheapest measured shipping (ties keep the server's order), then the open rows whose shipping is unknown (in price
 * order, as given), then the rest (sold out, not checked) as given.
 */
export function rankRows<T extends RankableRow>(rows: readonly T[], mode: ShipMode): T[] {
  if (mode !== "total") return [...rows];
  const idx = new Map(rows.map((r, i) => [r, i]));
  const known = rows.filter((r) => r.open && r.ship);
  known.sort((a, b) => a.cents + a.ship!.min - (b.cents + b.ship!.min) || idx.get(a)! - idx.get(b)!);
  return [...known, ...rows.filter((r) => r.open && !r.ship), ...rows.filter((r) => !r.open)];
}
