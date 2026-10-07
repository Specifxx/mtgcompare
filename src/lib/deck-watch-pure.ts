// The dependency-free half of the deck price watch (lib/deck-watch.ts), safe to
// import from a "use client" component. lib/deck-watch.ts pulls in prisma,
// alert-actions (node:crypto) and the email code; a client component that
// imported it from there made webpack fail on `node:crypto` and every page
// carrying DeckBuilder or BestBasket answered 500 (found 2026-09-29 with
// `next dev`; typecheck, lint and the unit tests could not see it).
// tests/client-imports.test.ts now fails any "use client" file that imports
// the server-only watch modules.

/** A target in minor units: one whole unit to a very large deck. */
export const DECK_TARGET_MIN_CENTS = 100;
export const DECK_TARGET_MAX_CENTS = 100_000_00;

/**
 * The default target Best Basket offers: today's total rounded DOWN to a
 * friendly figure — the nearest $10 under it for a big list, $5, then $1 —
 * so the first email is a real drop, never today's price again.
 */
export function friendlyTargetCents(totalCents: number): number {
  const step = totalCents >= 30_000 ? 1000 : totalCents >= 5_000 ? 500 : 100;
  const down = Math.floor((totalCents - 1) / step) * step;
  return Math.max(DECK_TARGET_MIN_CENTS, Math.min(DECK_TARGET_MAX_CENTS, down));
}

export function clampDeckTargetCents(cents: number): number {
  return Math.max(DECK_TARGET_MIN_CENTS, Math.min(DECK_TARGET_MAX_CENTS, Math.round(cents)));
}

/**
 * May the list just priced be saved as a deck watch? A watch re-prices the WHOLE
 * saved list every run (lib/deck-watch.ts priceDeckList has no ownership input),
 * so a result priced with "skip copies I already own" is a smaller list than
 * the one that would be watched: its total, and the default target seeded from
 * it, would never match the watch's own totals and the watch would silently
 * never fire. Nothing to watch either when the plan bought nothing.
 */
export function canWatchPricedResult(r: { skippedOwned?: number | null; coveredCopies: number }): boolean {
  return r.coveredCopies > 0 && !(r.skippedOwned && r.skippedOwned > 0);
}
