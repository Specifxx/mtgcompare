// THE PREMIUM "START" STEP — one contract, shared by the page, every buy button
// and the checkout route (RiftCompare's lib/premium-start.ts, ported in wave
// 2, 2026-10-03).
//
// Sign-in used to be a GATE IN FRONT OF checkout: /login?next=/premium?go=…,
// sign in, land back on /premium and have the cards start checkout. A wall
// (the Plan dialog, a gate) lost the page the visitor was reading. Now the
// provider buttons render ON /premium/start: the OAuth round trip returns to
// it with the same selection, a launcher takes it straight to Stripe, and
// `back` carries the buyer home afterwards.
//
// NO SERVER IMPORTS: the dialog and the pricing cards are client components.
import { sanitizeNextPath } from "./next-param";
import type { Interval, Tier } from "./plans";

export const PREMIUM_START_PATH = "/premium/start";
export const PREMIUM_WELCOME_PATH = "/premium/welcome";

/** Which surface sent the visitor into the start step (analytics only). */
export type StartSrc = "premium-page" | "dialog";

export function parseStartSrc(v: unknown): StartSrc {
  return v === "dialog" ? "dialog" : "premium-page";
}

export type StartPlan = "monthly" | "annual";

/** The SAME rules the checkout route applies, so the page that shows a price and the route that charges it can never disagree. */
export function parseCheckoutSelection(tierRaw: unknown, planRaw: unknown): { tier: Tier; plan: StartPlan } {
  return {
    tier: tierRaw === "plus" ? "plus" : "premium",
    plan: planRaw === "annual" || planRaw === "year" ? "annual" : "monthly",
  };
}

export const planInterval = (plan: StartPlan): Interval => (plan === "annual" ? "year" : "month");
export const intervalPlan = (iv: Interval): StartPlan => (iv === "year" ? "annual" : "monthly");

/**
 * Where to send someone after checkout (or after they cancel at Stripe).
 * sanitizeNextPath already enforces "same-origin absolute path, never
 * protocol-relative, never /api"; this adds the LOOP GUARDS: a `back` at the
 * start step, the welcome page or /login would bounce a paying customer
 * around the funnel instead of returning them to the page they were reading.
 */
export function sanitizeBackPath(v: string | null | undefined): string | null {
  const p = sanitizeNextPath(v);
  if (!p) return null;
  if (p === PREMIUM_START_PATH || p.startsWith(`${PREMIUM_START_PATH}?`)) return null;
  if (p === PREMIUM_WELCOME_PATH || p.startsWith(`${PREMIUM_WELCOME_PATH}?`)) return null;
  if (p === "/login" || p.startsWith("/login?")) return null;
  return p;
}

/** The start-step URL for a chosen tier/plan. `back` is sanitized here too. */
export function premiumStartHref(o: { tier: Tier; plan: StartPlan; back?: string | null; src: StartSrc }): string {
  const q = new URLSearchParams({ tier: o.tier, plan: o.plan, src: o.src });
  const back = sanitizeBackPath(o.back);
  if (back) q.set("back", back);
  return `${PREMIUM_START_PATH}?${q.toString()}`;
}

/** The old `/premium?go=plus-year` links (wave 1): their start-step URL, or null. */
export function goParamToStart(go: string | null | undefined): string | null {
  const m = go ? /^(plus|premium)-(month|year)$/.exec(go) : null;
  return m ? premiumStartHref({ tier: m[1] as Tier, plan: intervalPlan(m[2] as Interval), src: "premium-page" }) : null;
}
