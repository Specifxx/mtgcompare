// What a store's measured shipping says about ONE item at a given price (the product page's rows). Pure: the snapshot is passed in
// (src/lib/shipping.ts reads src/data/shipping-rates.json, written weekly by scripts/probe-shipping-rates.ts).
//
// A store's measurement is a few single-item carts (its cheapest item, then items near 40/80/150/300 in its currency), each quoted to
// several addresses. For a row priced P, per address:
//   • the measured item at or just under P gives the rate ("below");
//   • if the measured item just over P was quoted DIFFERENTLY (a free-over-$X threshold, or a bigger parcel) the rate at P lies between
//     the two, so the address gets that range: never one end of it presented as a fact;
//   • under the store's cheapest measured item there is nothing to read from (a free quote there may be a threshold), so that address
//     is unknown.
// The row's figure is the range across the addresses that have one. No addresses → null → "Shipping at checkout".

import type { ShippingPoint, StoreShipping } from "./shipping-probe";

export interface ShipQuote {
  /** The cheapest measured postage for one item at this price, across the addresses (cents, the store's currency). */
  minCents: number;
  /** The dearest. Equal to minCents when every address was quoted the same. */
  maxCents: number;
  /** The smallest measured item price, above this one, at which every measured address was quoted free: "free at $X". Null: none. */
  freeAtCents: number | null;
  /** Addresses with a figure, of the market's measured addresses. */
  addresses: number;
  ofAddresses: number;
  measuredAt: string;
}

export function quoteAt(s: StoreShipping, addressIds: readonly string[], priceCents: number): ShipQuote | null {
  if (!(priceCents > 0)) return null;
  const pts = [...s.points].sort((a, b) => a.subtotalCents - b.subtotalCents);
  let min = Infinity;
  let max = -Infinity;
  let n = 0;
  for (const a of addressIds) {
    let below: ShippingPoint | null = null;
    let above: ShippingPoint | null = null;
    for (const p of pts) {
      if (p.rates[a] == null) continue;
      if (p.subtotalCents <= priceCents) below = p;
      else if (!above) above = p;
    }
    if (!below) continue;
    const lo = below.rates[a] as number;
    let aMin = lo;
    let aMax = lo;
    if (above && below.subtotalCents < priceCents && (above.rates[a] as number) !== lo) {
      aMin = Math.min(lo, above.rates[a] as number);
      aMax = Math.max(lo, above.rates[a] as number);
    }
    min = Math.min(min, aMin);
    max = Math.max(max, aMax);
    n++;
  }
  if (!n) return null;
  let freeAtCents: number | null = null;
  if (max > 0) {
    for (const p of pts) {
      if (p.subtotalCents <= priceCents) continue;
      const vals = addressIds.map((a) => p.rates[a]).filter((c): c is number => c != null);
      if (vals.length && vals.every((c) => c === 0)) {
        freeAtCents = p.subtotalCents;
        break;
      }
    }
  }
  return { minCents: min, maxCents: max, freeAtCents, addresses: n, ofAddresses: addressIds.length, measuredAt: s.measuredAt };
}

/** The row's shipping, as data the browser renders and ranks by (StoreRowData.ship). */
export interface ShipCell {
  /** Cheapest measured postage, cents: what "Price + shipping" adds. */
  min: number;
  max: number;
  /** "+ $9.95 shipping", "+ $9.95–$14.95 shipping", "Free shipping", "Free–$9.95 shipping" */
  text: string;
  /** " · free at $150" (shown where there is room), or "" */
  hint: string;
  /** The full sentence (the cell's tooltip). */
  title: string;
}

export function shipCell(q: ShipQuote | null, fmt: (cents: number) => string, where: string): ShipCell | null {
  if (!q) return null;
  const range = q.minCents === q.maxCents;
  const text =
    q.maxCents === 0
      ? "Free shipping"
      : range
        ? `+ ${fmt(q.minCents)} shipping`
        : q.minCents === 0
          ? `Free–${fmt(q.maxCents)} shipping`
          : `+ ${fmt(q.minCents)}–${fmt(q.maxCents)} shipping`;
  const hint = q.freeAtCents != null ? ` · free at ${fmt(q.freeAtCents)}` : "";
  const span = range ? (q.maxCents === 0 ? "free" : fmt(q.minCents)) : `${q.minCents === 0 ? "free" : fmt(q.minCents)} to ${fmt(q.maxCents)} depending on where you are`;
  const title =
    `Shipping for one item around this price, measured from the store's own checkout to ${q.addresses} ${q.addresses === 1 ? "address" : "addresses"} in ${where}: ${span}.` +
    (q.freeAtCents != null ? ` Free at ${fmt(q.freeAtCents)} and over.` : "") +
    " The store's checkout is final.";
  return { min: q.minCents, max: q.maxCents, text, hint, title };
}

export const SHIP_UNKNOWN = "Shipping at checkout";
