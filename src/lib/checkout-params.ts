// The Stripe Checkout Session for a subscription, as a pure function so
// tests/premium.test.ts and tests/checkout-params.test.ts can pin it. Ported
// from RiftCompare without its trial and intro-offer branches (DECISIONS.md,
// "Premium: ported, minus the trial").
//
// Wave 2 (2026-10-03): checkout ATTRIBUTION and the RETURN PATH. `surface` (the
// wall, nudge or limit that sent the buyer, validated by isPlanClickSurface)
// and `back` (where they were, sanitizeBackPath) ride on the Session AND the
// subscription metadata; success lands on /premium/welcome with `back`, and a
// cancel at Stripe returns to `back` (else /premium).
import { STRIPE_SITE, TIER_NAMES, type Interval, type Tier } from "./plans";

// Some Stripe account-level errors (the business name not set, a portal not
// saved: one-time, Dashboard-only steps with no API equivalent) embed a
// dashboard URL right in the message text. Only the OWNER should ever see such
// a message, and only a Stripe address in it is ever turned into a link: the
// text comes from an error response, and a link built from free text must not
// be able to point anywhere else (components/StripeErrorNotice).
const STRIPE_HOST = /^(?:[a-z0-9-]+\.)*stripe\.com$/i;

/** The Stripe dashboard URL inside a message, without trailing punctuation, or null. Pure. */
export function stripeUrlIn(message: string): string | null {
  const match = message.match(/https?:\/\/\S+/);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)]+$/, "");
  try {
    const u = new URL(url);
    return u.protocol === "https:" && STRIPE_HOST.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** What a failed Stripe call tells the caller: the real message to an admin when it names a Dashboard step, otherwise `generic`. Pure. */
export function checkoutErrorText(err: unknown, isAdmin: boolean, generic: string): string {
  const message = err instanceof Error ? err.message : "";
  return isAdmin && stripeUrlIn(message) ? message : generic;
}

export interface CheckoutInput {
  priceId: string;
  tier: Tier;
  interval: Interval;
  user: { id: string; email: string; stripeCustomerId: string | null };
  siteUrl: string;
  /** A validated surface (isPlanClickSurface), or null. */
  surface?: string | null;
  /** A sanitized same-origin path (sanitizeBackPath), or null. */
  back?: string | null;
}

export function checkoutParams(i: CheckoutInput) {
  const meta: Record<string, string> = { site: STRIPE_SITE, kind: "mc_premium", userId: i.user.id, tier: i.tier, interval: i.interval };
  if (i.surface) meta.surface = i.surface;
  if (i.back) meta.back = i.back;
  const backQ = i.back ? `&back=${encodeURIComponent(i.back)}` : "";
  return {
    mode: "subscription" as const,
    line_items: [{ price: i.priceId, quantity: 1 }],
    ...(i.user.stripeCustomerId ? { customer: i.user.stripeCustomerId } : { customer_email: i.user.email }),
    client_reference_id: i.user.id,
    metadata: meta,
    subscription_data: { metadata: meta, description: `MTG Compare ${TIER_NAMES[i.tier]}` },
    allow_promotion_codes: true,
    success_url: `${i.siteUrl}/premium/welcome?session_id={CHECKOUT_SESSION_ID}${backQ}`,
    cancel_url: `${i.siteUrl}${i.back ?? "/premium"}`,
  };
}
