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
  const meta: Record<string, string> = { site: STRIPE_SITE, kind: "oc_premium", userId: i.user.id, tier: i.tier, interval: i.interval };
  if (i.surface) meta.surface = i.surface;
  if (i.back) meta.back = i.back;
  const backQ = i.back ? `&back=${encodeURIComponent(i.back)}` : "";
  return {
    mode: "subscription" as const,
    line_items: [{ price: i.priceId, quantity: 1 }],
    ...(i.user.stripeCustomerId ? { customer: i.user.stripeCustomerId } : { customer_email: i.user.email }),
    client_reference_id: i.user.id,
    metadata: meta,
    subscription_data: { metadata: meta, description: `OP Compare ${TIER_NAMES[i.tier]}` },
    allow_promotion_codes: true,
    success_url: `${i.siteUrl}/premium/welcome?session_id={CHECKOUT_SESSION_ID}${backQ}`,
    cancel_url: `${i.siteUrl}${i.back ?? "/premium"}`,
  };
}
