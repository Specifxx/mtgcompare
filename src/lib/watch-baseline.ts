import { isCountry, type Country } from "./country";
import { money } from "./format";

// "WATCHING FROM" on /watching and in the drawer (components/Watchlist.tsx) —
// RiftCompare's lib/watch-baseline.ts, ported in wave 2 (2026-10-03).
//
// The figure is PriceAlert.startPriceCents — the price when the watch was
// created, written once and never by the alert run — in the WATCH'S OWN market
// currency (an AU watch reads A$ whatever market the viewer is browsing). Rows
// without one fall back to lastPriceCents, which the run advances on every
// move; those are labelled as the last check rather than passed off as a
// start price.
//
// The %-change is shown only when the watch's market IS the viewer's market:
// `now` is the viewer's price, and comparing an A$ start with a US$ price is a
// number with no meaning. It is also null when either end is missing — a card
// with no current price shows the baseline alone rather than a fake 0%.
export function watchBaseline(
  it: { market: string; startPriceCents: number | null; lastPriceCents: number | null },
  viewerCountry: string,
  now: number | null,
): { label: string; text: string | null; delta: number | null } {
  const cents = it.startPriceCents ?? it.lastPriceCents;
  const label = it.startPriceCents != null ? "watching from" : "at the last check";
  const market: Country = isCountry(it.market) ? it.market : "US";
  const text = cents != null ? money(cents, market) : null;
  const delta =
    it.market === viewerCountry && cents != null && cents > 0 && now != null ? Math.round(((now - cents) / cents) * 100) : null;
  return { label, text, delta };
}

// ── The live chips (OP Compare: delivery is in-app while email is off) ──────
// RiftCompare tells a member a target was met, or a card hit a new low, by
// email. OP Compare sends no email until a mailer is configured
// (getEmailStatus), so the watchlist itself says it, computed from the same
// cached catalogue price the row shows: "At your target" when today's price in
// the watch's market is at or under the target, "New low since you started"
// when it is under the start price. Both need the watch's market to be the
// viewer's market (`now` is the viewer's price), for the same reason as the
// delta above.
export function watchChips(
  it: { market: string; startPriceCents: number | null; targetCents: number | null },
  viewerCountry: string,
  now: number | null,
): { atTarget: boolean; newLow: boolean } {
  if (now == null || it.market !== viewerCountry) return { atTarget: false, newLow: false };
  return {
    atTarget: it.targetCents != null && now <= it.targetCents,
    newLow: it.startPriceCents != null && now < it.startPriceCents,
  };
}

// ── The baseline a NEW watch is seeded with ─────────────────────────────────
// RiftCompare seeds startPriceCents from its ALERT PRICE (lib/alert-price.ts):
// the cheapest in-stock copy at a real store or TCGplayer's cheapest listing,
// fresh, never eBay. OP Compare's Card.low<MKT> includes eBay, so it is never
// the seed; this picks from the card's Offer rows by the same rule. Pure, so
// the eBay exclusion is pinned by a test (tests/watch-baseline.test.ts); the
// read is lib/watchlist-server.ts alertBaselineCents. To be replaced by the
// collection-alerts track's alert-price helper at integration if it lands.
export const ALERT_FRESH_MS = 36 * 60 * 60 * 1000;

export interface BaselineOffer {
  source: string;
  priceCents: number;
  inStock: boolean;
  updatedAt: Date;
}

/** Is this Offer source one a price alert may name? A tracked store or TCGplayer — never eBay. */
export function isAlertSource(source: string): boolean {
  return source.startsWith("store:") || source === "tcgplayer";
}

/** Cheapest eligible, in-stock, fresh offer in cents, or null when none. */
export function pickBaselineCents(offers: readonly BaselineOffer[], now = Date.now()): number | null {
  let best: number | null = null;
  for (const o of offers) {
    if (!isAlertSource(o.source) || !o.inStock || o.priceCents <= 0) continue;
    if (now - o.updatedAt.getTime() > ALERT_FRESH_MS) continue;
    if (best == null || o.priceCents < best) best = o.priceCents;
  }
  return best;
}
