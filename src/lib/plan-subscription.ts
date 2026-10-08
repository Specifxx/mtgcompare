// The signed-in member's own Stripe subscription, for /premium's member card
// and the annual-switch offer (RiftCompare's /api/premium/subscription and
// /api/premium/switch-to-annual). Reading or changing it NEVER writes
// entitlement: User.premiumUntil / premiumTier stay the webhook's, the daily
// reconcile's and the admin routes' (CLAUDE.md, "Plus & Premium"). A switch to
// yearly fires customer.subscription.updated, and the webhook stamps the new
// period end from there.
import type Stripe from "stripe";
import { isInterval, type Interval, type Tier } from "./plans";
import { stripe } from "./stripe";
import { isOurSubscription, periodEndFromSubscription, tierOfSubscription } from "./stripe-entitlement";

export interface SubscriptionSummary {
  tier: Tier;
  interval: Interval | null;
  status: string;
  /** Next renewal (or, with cancelAtPeriodEnd, the last paid day), ISO. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whole 30-day months since the subscription started. */
  monthsActive: number;
}

/** Pure: what the member card and the annual offer need from one subscription. */
export function summarizeSubscription(sub: unknown, now = Date.now()): SubscriptionSummary | null {
  if (!sub || typeof sub !== "object" || !isOurSubscription(sub)) return null;
  const s = sub as { status?: unknown; created?: unknown; cancel_at_period_end?: unknown; cancel_at?: unknown; items?: { data?: { price?: { recurring?: { interval?: unknown } } }[] } };
  const iv = s.items?.data?.[0]?.price?.recurring?.interval;
  const created = typeof s.created === "number" ? s.created * 1000 : now;
  const end = periodEndFromSubscription(sub);
  return {
    tier: tierOfSubscription(sub),
    interval: isInterval(iv) ? iv : null,
    status: typeof s.status === "string" ? s.status : "unknown",
    periodEnd: end ? end.toISOString() : null,
    cancelAtPeriodEnd: s.cancel_at_period_end === true || (typeof s.cancel_at === "number" && s.cancel_at > 0),
    monthsActive: Math.max(0, Math.floor((now - created) / (30 * 86_400_000))),
  };
}

/** The customer's live MTG Compare subscription (active or past_due), with its Price expanded. */
export async function ourSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10, expand: ["data.items.data.price"] });
  return subs.data.find((s) => (s.status === "active" || s.status === "past_due" || s.status === "trialing") && isOurSubscription(s)) ?? null;
}
