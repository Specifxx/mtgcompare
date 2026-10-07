// One definition of "can you actually buy this sealed offer right now?", shared
// by /sealed's quick view and tiles and the sealed page (RiftCompare's
// lib/sealed-offers.ts, ported verbatim; OP's `Offer.updatedAt` is `lastSeen`).
//
// WHY IT EXISTS: a table that takes the first row of every listing, sold out or
// not, as "the cheapest" advertises a box nobody can order. The stored data can
// be right (a store's row stored inStock=false) while the headline price is not,
// so every surface asks these functions instead of reading rows[0].
//
// Three states, not two, because a stored row can also simply be OLD: a store
// whose scrape failed keeps yesterday's rows (sealed-import.ts only replaces a
// store's rows after a successful read), and some EU rows were a month stale.
// Past STORE_ROWS_MAX_AGE_H (the same threshold the singles importer expires
// rows at) we no longer know, and say "Unknown" rather than "open".
//
// Pure and dependency-free so it can be imported from client components (the
// sealed quick view) and unit-tested without a database. That is why the 72h is
// restated here rather than imported from lib/data.ts (STALE_MS, the same 72 h);
// tests/sealed-offers.test.ts pins the two together.
export const OFFER_STALE_H = 72;

export type OfferStock = "open" | "soldout" | "unknown";

export interface SealedOffer {
  priceCents: number;
  inStock: boolean;
  /** ISO timestamp of the importer's last successful read of this row. */
  lastSeen?: string | null;
}

export const OFFER_STALE_MS = OFFER_STALE_H * 3600_000;

export function offerStock(o: SealedOffer, now: number = Date.now()): OfferStock {
  const seen = o.lastSeen ? Date.parse(o.lastSeen) : NaN;
  // A row without a timestamp predates this field (an old cache entry): trust
  // the stored flag rather than blanking every price until the cache turns over.
  if (Number.isFinite(seen) && now - seen > OFFER_STALE_MS) return "unknown";
  return o.inStock ? "open" : "soldout";
}

const STATE_RANK: Record<OfferStock, number> = { open: 0, unknown: 1, soldout: 2 };

/** Open offers first (cheapest first), then unknown, then sold out. Stable, non-mutating. */
export function rankOffers<T extends SealedOffer>(offers: readonly T[], now: number = Date.now()): T[] {
  return [...offers].sort(
    (a, b) => STATE_RANK[offerStock(a, now)] - STATE_RANK[offerStock(b, now)] || a.priceCents - b.priceCents,
  );
}

/** The cheapest offer you can actually place an order at, or null. Never a sold-out or stale row. */
export function headlineOffer<T extends SealedOffer>(offers: readonly T[], now: number = Date.now()): T | null {
  let best: T | null = null;
  for (const o of offers) {
    if (offerStock(o, now) !== "open") continue;
    if (!best || o.priceCents < best.priceCents) best = o;
  }
  return best;
}

/** Distinct stores with an open offer — what "N stores taking pre-orders" may count. */
export function openStoreCount(offers: readonly (SealedOffer & { retailer: string })[], now: number = Date.now()): number {
  return new Set(offers.filter((o) => offerStock(o, now) === "open").map((o) => o.retailer)).size;
}

/** Badge text. A pre-order that is open is "Pre-order open"; shipped stock is "In stock". */
export function offerStockLabel(state: OfferStock, preorder: boolean): string {
  if (state === "open") return preorder ? "Pre-order open" : "In stock";
  if (state === "soldout") return "Sold out";
  return "Unknown";
}

/**
 * True when EVERY store we track lists this product and says it is sold out,
 * on a fresh read: /sealed's "Sold out at every store we track" badge.
 *
 * Stricter than "no open offer": a row we haven't read inside OFFER_STALE_H is
 * "unknown", not sold out, so one stale store keeps the badge off. That is what
 * lets the badge say "every store" and mean it. No listings at all is not "sold
 * out everywhere" either: it is "we don't track it here".
 */
export function soldOutEverywhere(offers: readonly SealedOffer[], now: number = Date.now()): boolean {
  return offers.length > 0 && offers.every((o) => offerStock(o, now) === "soldout");
}
