// src/lib/premium-gates.ts (owner WP18, FROZEN). WHO SEES WHAT in the three Premium tools, in one pure module: no I/O, no clock, no React, client-safe.
// Deal Finder (Plus and Premium), Rising Cards and Demand Finder (Premium) are the paid analytics of MTG Compare (owner addendum 2026-10-08, section 10 of the contract).
// Everything else stays free: names, images, oracle text, legalities, search, set browsing, prices and history on the free window (C13; Scryfall's "no paywall" rule).
//
// THE RULE THAT MAKES THE GATE REAL: rows are limited where they are LOADED, never hidden afterwards.
//   1. A page computes `access = accessFor(feature, viewer)` on the server.
//   2. It asks its loader for `rowLimit(feature, access)` rows (0 = do not even query) and passes NOTHING else down: a locked preview component takes no data props.
//   3. If a loader has to slice a larger cached result, it does so with `gate()` here, on the server, before anything is serialised into HTML or an RSC payload.
//   4. No CSS (`blur`, `hidden`, `opacity`, `overflow`) ever stands between a viewer and a row they may not have. tests/premium-gates.test.ts walks the three pages and their loaders for all of this.
// The underlying PRICES are public data (published as JSON, section 12); what is gated is our computed ranking, filters, paging and member integrations. Rankings built from DEMAND counters are never published in clear
// (section 14.5): the loader decrypts them only for a viewer whose access is `full`, or reads the clear preview slice for everyone else.
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "./tier-limits";

export type GateTier = "plus" | "premium";                                  // plans.ts Tier; duplicated as a literal so this module imports nothing but tier-limits (tests assert equality)
export const GATE_TIER_RANK: Record<GateTier, number> = { plus: 1, premium: 2 };
export type Feature = "deal-finder" | "rising" | "demand";
export const FEATURES: readonly Feature[] = ["deal-finder", "rising", "demand"];
/** none: no row at all (an ask for an account); preview: the first N rows of the DEFAULT ranking; full: everything the tier unlocks. */
export type Access = "none" | "preview" | "full";
/** What a request knows about its visitor. `tier` comes from tierOf(user) (an admin is "premium"); null = no paid tier. */
export interface Viewer { signedIn: boolean; tier: GateTier | null }
export const SIGNED_OUT: Viewer = { signedIn: false, tier: null };

export interface FeatureRule {
  /** The cheapest tier that gets `full`. */
  minTier: GateTier;
  /** Rows of the default ranking a signed-in viewer below minTier gets. 0 = none. */
  freePreviewRows: number;
  /** Rows a signed-out visitor gets. 0 = none (Rising, Deal Finder); Demand Finder shows everyone the strip /movers already shows. */
  signedOutRows: number;
  /** Full-access row ceiling (a design bound: the loader never returns more). */
  fullRows: number;
  path: string;
  label: string;
  /** PlanButton `surface` for the upgrade ask: gate:<feature>. */
  surface: string;
  /** Views of the tool that are free for everyone (Deal Finder's "Cheapest on eBay" is eBay-sourced and always free). */
  freeViews: readonly string[];
}
export const FEATURE_RULES: Record<Feature, FeatureRule> = {
  "deal-finder": { minTier: "plus", freePreviewRows: FREE_DEAL_ROWS, signedOutRows: 0, fullRows: Number.POSITIVE_INFINITY, path: "/tools/deal-finder", label: "Deal Finder", surface: "gate:deal-finder", freeViews: ["ebay"] },
  rising: { minTier: "premium", freePreviewRows: FREE_RISING_ROWS, signedOutRows: 0, fullRows: 40, path: "/tools/rising", label: "Rising Cards", surface: "gate:rising", freeViews: [] },
  demand: { minTier: "premium", freePreviewRows: FREE_DEMAND_ROWS, signedOutRows: FREE_DEMAND_ROWS, fullRows: PREMIUM_DEMAND_ROWS, path: "/tools/demand", label: "Demand Finder", surface: "gate:demand", freeViews: [] },
};

export function accessFor(feature: Feature, viewer: Viewer): Access {
  const r = FEATURE_RULES[feature];
  if (viewer.tier && GATE_TIER_RANK[viewer.tier] >= GATE_TIER_RANK[r.minTier]) return "full";
  const rows = viewer.signedIn ? r.freePreviewRows : r.signedOutRows;
  return rows > 0 ? "preview" : "none";
}
/** How many rows a loader may return for this access (0 = do not query at all). Infinity is capped by the feature's own fullRows. */
export function rowLimit(feature: Feature, access: Access, viewer?: Viewer): number {
  const r = FEATURE_RULES[feature];
  if (access === "full") return r.fullRows;
  if (access === "none") return 0;
  return viewer && !viewer.signedIn ? r.signedOutRows : r.freePreviewRows;
}
/** What a CACHED public page (the home page, /movers, the tools hub: the same HTML for everyone) may show of a ranking: a teaser, never more than a free account gets on the tool page itself. Deal Finder: one row plus the REAL total (OP's Today's Top Deals);
 *  Rising Cards: the top 3 picks (the clear preview slice the publisher writes); Demand Finder: the strip /movers already shows (top 10 searched over 7 days). The teaser is read from the clear preview slices, never from an encrypted shard. */
export const TEASER_ROWS: Record<Feature, number> = { "deal-finder": 1, rising: 3, demand: 10 };
export const teaserRows = (feature: Feature): number => Math.min(TEASER_ROWS[feature], Math.max(FEATURE_RULES[feature].freePreviewRows, FEATURE_RULES[feature].signedOutRows));
/** Is this view of the tool free for everyone? (Deal Finder: "ebay".) Anything else follows accessFor. */
export const isFreeView = (feature: Feature, view: string): boolean => FEATURE_RULES[feature].freeViews.includes(view);
export interface Gated<T> { rows: T[]; /** rows the viewer may see */ shown: number; /** rows that exist in the ranking */ total: number; /** total - shown */ hidden: number; access: Access }
/** The ONE place a ranking is cut for a viewer. `total` is the true length (a count is not a row, and it is what makes the upsell honest: "37 more picks"). */
export function gate<T>(feature: Feature, access: Access, rows: readonly T[], viewer?: Viewer): Gated<T> {
  const limit = Math.min(rowLimit(feature, access, viewer), rows.length);
  const out = rows.slice(0, limit);
  return { rows: out, shown: out.length, total: rows.length, hidden: rows.length - out.length, access };
}
/** Filters, sorting, paging, store pickers, scope switches and "only my cards" exist only at `full`; at any other access a request that names one is answered with the DEFAULT view (never a 403: a shared link must still open). */
export const allowsRefinement = (access: Access): boolean => access === "full";

/** The matrix as data, for the /premium and tier-comparison copy tests and for docs/premium-gates.md (WP18 generates it from here). */
export function gateMatrix(): { feature: Feature; signedOut: number; free: number; plus: number | "all"; premium: number | "all" }[] {
  return FEATURES.map((f) => {
    const at = (viewer: Viewer): number | "all" => { const a = accessFor(f, viewer); return a === "full" ? "all" : rowLimit(f, a, viewer); };
    return { feature: f, signedOut: at(SIGNED_OUT) as number, free: at({ signedIn: true, tier: null }) as number, plus: at({ signedIn: true, tier: "plus" }), premium: at({ signedIn: true, tier: "premium" }) };
  });
}
