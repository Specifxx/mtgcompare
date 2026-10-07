// How many watched cards may carry a TARGET PRICE ("Notify me at $X"), per
// tier — RiftCompare's lib/alert-limits.ts, ported in wave 2 (2026-10-03).
// Plain watches are free for every account — up to FREE_WATCHLIST_LIMIT
// distinct cards on a free account, unlimited on any paid tier
// (lib/free-limits.ts); the target trigger is the paid one, and only Plus has
// a ceiling. Premium's "unlimited" is the ladder the rest of the category uses
// (MTGStocks, Pricempire, Market Movers).
//
// Shared by the PATCH route that sets a target (the enforcement) and every
// surface that quotes the number (tier table, pricing cards, watchlist), so
// the promise and the check can never drift apart. The tier constants other
// tracks enforce are re-exported from lib/tier-limits.ts, their one home.
export const PLUS_TARGET_ALERT_LIMIT = 25;

export function targetAlertLimit(tier: "plus" | "premium" | null | undefined): number {
  if (tier === "premium") return Number.POSITIVE_INFINITY;
  if (tier === "plus") return PLUS_TARGET_ALERT_LIMIT;
  return 0;
}

// ── Deck price watches and sealed watches ──────────────────────────────────
//
// A DECK PRICE WATCH (a saved list priced delivered after every import, alerted
// at a target or on a material drop) is Premium only, up to DECK_WATCH_LIMIT
// per account: each is a bounded Offer read per run, so "unlimited" would let
// one account set the run's egress.
export const DECK_WATCH_LIMIT = 10;

export function deckWatchLimit(tier: "plus" | "premium" | null | undefined): number {
  return tier === "premium" ? DECK_WATCH_LIMIT : 0;
}

// A SEALED WATCH (restock, target and drop alerts for one sealed product in one
// market) is Plus and Premium: Plus up to SEALED_WATCH_LIMIT_PLUS, Premium
// unlimited — the same ladder as targets. The run reads the self-cached sealed
// catalogue once per market whatever the count, so unlimited costs nothing extra.
export const SEALED_WATCH_LIMIT_PLUS = 10;

export function sealedWatchLimit(tier: "plus" | "premium" | null | undefined): number {
  if (tier === "premium") return Number.POSITIVE_INFINITY;
  if (tier === "plus") return SEALED_WATCH_LIMIT_PLUS;
  return 0;
}

// HOW OFTEN A SEALED WATCH IS CHECKED, as copy. OP Compare's store import runs
// twice a day (import-prices.yml), and the sealed alert pass follows it. Never
// "instant", never "first in line": a Discord stock bot polls faster than a
// price site can, and the copy says so. One definition, so the table, the FAQ
// and the watch form cannot drift apart.
export const SEALED_CHECK_CADENCE = "twice a day";

// WHERE "AT RRP" EXISTS. RiftCompare publishes an RRP for AU, US and UK
// (lib/msrp.ts); OP Compare has no MSRP table yet, so NO market offers an at-RRP
// alert — restock, target and drop alerts work in every market. When an MSRP
// table lands, list its markets here and every surface follows.
export const SEALED_RRP_MARKETS: readonly string[] = [];
export const SEALED_RRP_ONLY = SEALED_RRP_MARKETS.length ? `${SEALED_RRP_MARKETS.join("/")} only` : "not available yet";
export const SEALED_CHECK_SENTENCE = `Sealed products are checked ${SEALED_CHECK_CADENCE}, so stock may have moved since. A Discord stock bot may be faster.`;

/** Does this market have an RRP to alert at? (None do until an MSRP table exists.) */
export function sealedRrpAvailable(market: string): boolean {
  return SEALED_RRP_MARKETS.includes(market);
}

// Premium's "unlimited" sealed watches still stop at a sanity ceiling, so one
// account cannot fill the watch table (and the paid run's read cap, which is
// oldest-first) with junk rows. `sealedWatchLimit` stays the marketing ladder
// (Infinity = "Unlimited"); this is the enforcement.
export const SEALED_WATCH_HARD_CAP = 200;

export function sealedWatchCeiling(tier: "plus" | "premium" | null | undefined): number {
  return Math.min(sealedWatchLimit(tier), SEALED_WATCH_HARD_CAP);
}
