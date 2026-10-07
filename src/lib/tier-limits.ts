// THE ONE HOME of every tier constant a wave-2 track enforces and the member
// track's tier table quotes (wave2-plan §3, Track 0 item 8). A route, a gate,
// a tier table, an FAQ and a pricing card all read these, so the promise and
// the check can never drift apart. No other module redeclares them; the free
// watchlist/portfolio and alert numbers live beside their helpers and are
// re-exported here. Client-safe: no server imports.
//
// Prices, tier features and the trial are the owner's call (CLAUDE.md, "Plus &
// Premium"): changing a number here changes what a tier gets, so it needs the
// owner's word, a DECISIONS entry and the tier-table copy in the same change.

/**
 * Rows a free account sees in Deal Finder; signed-out visitors see none.
 * Defined HERE (and re-exported by lib/plans.ts, wave 1's home for it) since
 * the member track: plans.ts builds TIER_COMPARISON from these constants, so
 * this module must not import plans.ts back (a cycle would read them before
 * they exist).
 */
export const FREE_DEAL_ROWS = 3;

/** Rising Cards rows a free or Plus account sees before the Premium gate (owner, 2026-10-07). */
export const FREE_RISING_ROWS = 3;

/** Demand Finder rows: free accounts, then Premium (RiftCompare lib/demand-finder.ts). */
export const FREE_DEMAND_ROWS = 10;
export const PREMIUM_DEMAND_ROWS = 25;

/** Cards per request when the set checklist asks which cards are owned. */
export const SET_GAP_CHUNK = 200;

export {
  FREE_WATCHLIST_LIMIT,
  FREE_PORTFOLIO_LIMIT,
  FREE_LIMITS,
  FREE_LIMIT_STATUS,
} from "./free-limits";

export {
  PLUS_TARGET_ALERT_LIMIT,
  DECK_WATCH_LIMIT,
  SEALED_WATCH_LIMIT_PLUS,
  SEALED_WATCH_HARD_CAP,
  SEALED_CHECK_CADENCE,
  SEALED_RRP_MARKETS,
  targetAlertLimit,
  deckWatchLimit,
  sealedWatchLimit,
  sealedWatchCeiling,
} from "./alert-limits";
