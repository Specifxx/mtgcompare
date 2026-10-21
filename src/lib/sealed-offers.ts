// "Can you actually buy this offer right now?" — one definition for every page.
// Ported from Rift Compare (src/lib/sealed-offers.ts, DECISIONS.md "Sold-out
// pre-orders ranked as the cheapest", 2026-09-24).
//
// Three states, not two, because a stored row can also simply be OLD: a store
// whose read failed keeps its previous rows (the importer only replaces a
// store's rows after a successful read). Past OFFER_STALE_H we no longer know,
// and say "Unknown" rather than "In stock".
//
// Pure and dependency-free: used by server pages and client components alike.
export const OFFER_STALE_H = 72;
export const OFFER_STALE_MS = OFFER_STALE_H * 3600_000;

export type OfferStock = "open" | "soldout" | "unknown";

export interface SealedOffer {
  priceCents: number;
  inStock: boolean;
  /** ISO timestamp (or Date) of the importer's last successful read of this row. */
  lastSeen?: string | Date | null;
}

function seenMs(o: SealedOffer): number {
  if (!o.lastSeen) return NaN;
  return o.lastSeen instanceof Date ? o.lastSeen.getTime() : Date.parse(o.lastSeen);
}

export function offerStock(o: SealedOffer, now: number = Date.now()): OfferStock {
  const seen = seenMs(o);
  if (Number.isFinite(seen) && now - seen > OFFER_STALE_MS) return "unknown";
  return o.inStock ? "open" : "soldout";
}

const STATE_RANK: Record<OfferStock, number> = { open: 0, unknown: 1, soldout: 2 };

/** Open offers first (cheapest first), then unknown, then sold out. Non-mutating. */
export function rankOffers<T extends SealedOffer>(offers: readonly T[], now: number = Date.now()): T[] {
  return [...offers].sort(
    (a, b) => STATE_RANK[offerStock(a, now)] - STATE_RANK[offerStock(b, now)] || a.priceCents - b.priceCents,
  );
}

/** The cheapest offer you can actually order, or null. Never a sold-out or stale row. */
export function headlineOffer<T extends SealedOffer>(offers: readonly T[], now: number = Date.now()): T | null {
  let best: T | null = null;
  for (const o of offers) {
    if (offerStock(o, now) !== "open") continue;
    if (!best || o.priceCents < best.priceCents) best = o;
  }
  return best;
}

/** Distinct stores with an open offer. */
export function openStoreCount(offers: readonly (SealedOffer & { store: string })[], now: number = Date.now()): number {
  return new Set(offers.filter((o) => offerStock(o, now) === "open").map((o) => o.store)).size;
}

/** Badge text. An open offer on an unreleased set is a pre-order. */
export function offerStockLabel(state: OfferStock, preorder: boolean): string {
  if (state === "open") return preorder ? "Pre-order" : "In stock";
  if (state === "soldout") return "Sold out";
  return "Not checked recently";
}
