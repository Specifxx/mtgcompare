// The paid plans: names, prices and what each unlocks. Client-safe (no Stripe,
// no Prisma) so the pricing page, the header and the server all read ONE table.
//
// Prices are RiftCompare's (Plus $2.99/mo or $23.99/yr, Premium $4.99/mo or
// $39.99/yr); MTG Compare keeps them (owner's call, CLAUDE.md). scripts/stripe-setup.ts creates the Stripe Prices FROM this table,
// with lookup keys, so what the page says and what Stripe charges cannot drift.
// To change a price: edit PLAN_CENTS and re-run the "Stripe setup" workflow; it
// creates new Prices and moves the lookup keys onto them. Subscribers already
// on the old Price keep it (its metadata still names its tier).
import { FEATURE_RULES, accessFor, gateMatrix, type Feature } from "./premium-gates";
import {
  DECK_WATCH_LIMIT,
  FREE_DEAL_ROWS,
  FREE_PORTFOLIO_LIMIT,
  FREE_WATCHLIST_LIMIT,
  PLUS_TARGET_ALERT_LIMIT,
  PREMIUM_DEMAND_ROWS,
  SEALED_CHECK_CADENCE,
  SEALED_WATCH_LIMIT_PLUS,
  SET_GAP_CHUNK,
} from "./tier-limits";

export type Tier = "plus" | "premium";
export type Interval = "month" | "year";

export const TIERS: Tier[] = ["plus", "premium"];
export const INTERVALS: Interval[] = ["month", "year"];
export const TIER_NAMES: Record<Tier, string> = { plus: "Plus", premium: "Premium" };
export const TIER_RANK: Record<Tier, number> = { plus: 1, premium: 2 };

export const PLAN_CURRENCY = "usd";
export const PLAN_CENTS: Record<Tier, Record<Interval, number>> = {
  plus: { month: 299, year: 2399 },
  premium: { month: 499, year: 3999 },
};

/**
 * Stripe metadata every MTG Compare Price and subscription carries. MTG Compare
 * has its OWN Stripe account (inside the owner's RiftCompare organisation), so
 * this tag and the lookup keys below are the second guard after the account
 * itself: a subscription without it never earns anything here.
 */
export const STRIPE_SITE = "mtgcompare";
export const lookupKey = (tier: Tier, interval: Interval) => `mtgcompare_${tier}_${interval}`;

export function isTier(v: unknown): v is Tier {
  return v === "plus" || v === "premium";
}
export function isInterval(v: unknown): v is Interval {
  return v === "month" || v === "year";
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const planPrice = (tier: Tier, interval: Interval) => usd(PLAN_CENTS[tier][interval]);
export const perMonth = (tier: Tier) => usd(Math.round(PLAN_CENTS[tier].year / 12));
export const annualSavingPct = (tier: Tier) => Math.round((1 - PLAN_CENTS[tier].year / (PLAN_CENTS[tier].month * 12)) * 100);

/** Rows a free account sees in Deal Finder; signed-out visitors see none (defined in lib/tier-limits.ts). */
export { FREE_DEAL_ROWS };

// RiftCompare's taglines (PremiumPricingCards).
export const PLAN_PITCH: Record<Tier, string> = {
  plus: "No ads, and price watches",
  premium: "Plans which stores to buy from",
};

// THE LINEUP — the same entitlements as TIER_COMPARISON's rows, in a few words
// each, four bullets a card (RiftCompare's PremiumPricingCards, wave 2,
// 2026-10-03). Plus LEADS with "No ads on any page" (tests/ad-free-tier.test.ts).
// Every number is the enforced constant. Prices are unchanged. Plus names Deal
// Finder (its tier); Premium names the two tools only it unlocks in full.
export const PLAN_FEATURES: Record<Tier, string[]> = {
  plus: ["No ads on any page", "Deal Finder in full, no watchlist or portfolio limit", `Target alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`, `Sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products`],
  premium: ["Everything in Plus, no ads", "Best Basket: the cheapest store-by-store plan", "Full Rising Cards and Demand Finder", `Deck price watch on up to ${DECK_WATCH_LIMIT} lists`],
};

// THE TIER COMPARISON — RiftCompare's TIER_COMPARISON (TierComparisonTable.tsx),
// ported in wave 2 (2026-10-03): eighteen rows, each a real entitlement whose
// gate lives in code, and every number is the enforced constant from
// lib/tier-limits.ts (never typed here). tests/access-tiers.test.ts and
// tests/premium-tiers.test.ts read the rows against those constants and the
// dashboard's tool list. `false` renders a dash (✗ in the dialog), `true` a
// tick, a string as-is.
//
// The three PAID ANALYTICS rows (Deal Finder, Rising Cards, Demand Finder) are
// not typed: they are written from gateMatrix() (lib/premium-gates.ts), the
// table that also decides who gets how many rows, so the copy and the gate
// cannot disagree (tests/tier-comparison-rows.test.ts reads the cells back).
//
// Magic adaptations: "MTG Compare Index"; no at-RRP row text (SEALED_RRP_MARKETS
// = [], lib/alert-limits.ts); the deck watch "alerts" rather than "emails"
// (email is off until a mailer is configured).
export type TierRow = {
  feature: string;
  account: boolean | string;
  plus: boolean | string;
  premium: boolean | string;
};

type GateCell = number | "all";
const topN = (n: number) => `Top ${n}`;
const topSearched = (n: number) => `Top ${n} searched`;
/**
 * One paid-analytics row, written from the gate: a count of rows is "Top N…", no rows is a dash, everything (`full`) is the
 * row's own wording ("Full list…" or a tick). Deal Finder's everything includes the store picker and "only my cards".
 */
function paidRow(feature: Feature, name: string, o: { top: (n: number) => string; full: string | true }): TierRow {
  const m = gateMatrix().find((x) => x.feature === feature)!;
  const cell = (c: GateCell): string | boolean => (c === "all" ? o.full : c > 0 ? o.top(c) : false);
  return { feature: name, account: cell(m.free), plus: cell(m.plus), premium: cell(m.premium) };
}

export const TIER_COMPARISON: TierRow[] = [
  { feature: "Compare prices across every store", account: true, plus: true, premium: true },
  { feature: "Full card database, charts & search", account: true, plus: true, premium: true },
  { feature: "Deck & list pricer, trade calculator & box EV", account: true, plus: true, premium: true },
  { feature: "MTG Compare Index & weekly price movers", account: true, plus: true, premium: true },
  { feature: "Watchlist & new-low alerts", account: `${FREE_WATCHLIST_LIMIT} cards`, plus: "Unlimited", premium: "Unlimited" },
  { feature: "Portfolio — value, P&L, CSV & replacement cost", account: `${FREE_PORTFOLIO_LIMIT} cards`, plus: "Unlimited", premium: "Unlimited" },
  { feature: "Set tracker — what your binder is missing and the cheapest listing to finish", account: `Up to ${FREE_PORTFOLIO_LIMIT} cards`, plus: "Whole sets, no limit", premium: "Whole sets, no limit" },
  paidRow("deal-finder", "Deal Finder", { top: topN, full: "Full list + only my cards" }),
  paidRow("rising", "Rising Cards", { top: topN, full: "Full list" }),
  { feature: "Target-price alerts after every price update", account: false, plus: `Up to ${PLUS_TARGET_ALERT_LIMIT}`, premium: "Unlimited" },
  { feature: "Best Basket — cheapest delivered order for a list", account: false, plus: false, premium: "Store-by-store plan" },
  { feature: "Buy this list — deck or watchlist, skipping cards you own", account: false, plus: false, premium: "Store-by-store plan" },
  { feature: "Finish this set — store-by-store plan for what's missing, postage included", account: false, plus: false, premium: `Store-by-store plan, up to ${SET_GAP_CHUNK} cards` },
  { feature: "Minimum condition — NM only or LP or better, in the plan and the deck watch", account: false, plus: false, premium: true },
  paidRow("demand", "Demand Finder — most searched & viewed cards", { top: topSearched, full: true }),
  { feature: `Sealed watches — restock and price alerts, checked ${SEALED_CHECK_CADENCE}`, account: false, plus: `Up to ${SEALED_WATCH_LIMIT_PLUS}`, premium: "Unlimited" },
  { feature: "Deck price watch — an alert when a deck's delivered total drops", account: false, plus: false, premium: true },
  // Kept LAST (RiftCompare): the most broadly understood reason to pay at all.
  { feature: "Ad-free experience", account: false, plus: true, premium: true },
];

/** One line of the "three paid tools" table on /premium (and of docs/premium-gates.md): who sees how much of a tool, in words. */
export interface PaidToolRow { feature: Feature; label: string; path: string; from: string; signedOut: string; free: string; plus: string; premium: string }

/**
 * The paid tools' who-sees-what table, written from gateMatrix(): the SAME matrix that
 * cuts a loader's rows, so /premium, the docs and the gate cannot disagree. A zero is
 * not a row: signed out Deal Finder gets the real deal COUNT, signed out Rising Cards a
 * locked preview; Demand Finder's everything is the Premium lists (searches and views).
 */
export function paidToolRows(): PaidToolRow[] {
  const cell = (feature: Feature, n: GateCell): string => {
    if (n === "all") return feature === "rising" ? "Full list" : feature === "demand" ? `Top ${PREMIUM_DEMAND_ROWS} searched & viewed` : "Every deal";
    if (n === 0) return feature === "deal-finder" ? "Deal count" : "Preview";
    return feature === "demand" ? topSearched(n) : topN(n);
  };
  return gateMatrix().map((m) => ({
    feature: m.feature,
    label: FEATURE_RULES[m.feature].label,
    path: FEATURE_RULES[m.feature].path,
    from: TIER_NAMES[FEATURE_RULES[m.feature].minTier],
    signedOut: cell(m.feature, m.signedOut),
    free: cell(m.feature, m.free),
    plus: cell(m.feature, m.plus),
    premium: cell(m.feature, m.premium),
  }));
}

/**
 * How much of Deal Finder a visitor gets (RiftCompare: "Deal Finder gives free
 * visitors nothing", 2026-09-22). The limit is applied in the QUERY, never with
 * CSS, so locked rows never reach the page's HTML.
 *
 * Kept for the callers that still ask it in this shape; the rule itself is
 * lib/premium-gates.ts accessFor("deal-finder", …) and this only renames its
 * answer ("preview" is the free account's top rows). New code calls the gate.
 */
export type DealAccess = "none" | "top3" | "full";
export function dealAccess(signedIn: boolean, tier: Tier | null): DealAccess {
  const a = accessFor("deal-finder", { signedIn, tier });
  return a === "full" ? "full" : a === "preview" ? "top3" : "none";
}
