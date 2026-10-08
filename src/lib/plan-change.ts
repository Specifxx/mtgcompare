import type Stripe from "stripe";
import { ourSubscription } from "./plan-subscription";
import { isInterval, type Tier } from "./plans";
import { tierOfSubscription } from "./stripe-entitlement";
import { priceIdFor, stripe } from "./stripe";

// MOVE A SUBSCRIPTION BETWEEN PLUS AND PREMIUM, same interval — the body of
// /api/premium/upgrade and /api/premium/downgrade (RiftCompare's routes,
// ported in wave 2, 2026-10-03), here so tests/plan-change.test.ts can drive it
// against a stub Stripe (a route may export only its handlers).
//
//   upgrade   Plus → Premium, proration_behavior "always_invoice": the
//             prorated difference is billed NOW, so the Premium tools unlock
//             the moment it is confirmed.
//   downgrade Premium → Plus, proration_behavior "create_prorations": the
//             unused part is CREDITED against the next invoice; nothing is
//             charged now and no cash is refunded. Takes effect now.
//
// Only the caller's own MTG Compare subscription (ourSubscription refuses one
// whose Price/metadata isn't site=mtgcompare), only an ACTIVE one (not a trial,
// not past_due), and never one set to end. Idempotent on the TIER read from
// the live Price. ENTITLEMENT IS NEVER WRITTEN HERE: the update fires
// customer.subscription.updated and the webhook (or the daily reconcile)
// restamps tier and period, extend-only (CLAUDE.md, "Plus & Premium").
export type PlanChange = "upgrade" | "downgrade";

export const PRORATION: Record<PlanChange, "always_invoice" | "create_prorations"> = {
  upgrade: "always_invoice",
  downgrade: "create_prorations",
};

const TARGET: Record<PlanChange, Tier> = { upgrade: "premium", downgrade: "plus" };

export interface PlanChangeDeps {
  find: (customerId: string) => Promise<Stripe.Subscription | null>;
  price: (tier: Tier, interval: "month" | "year") => Promise<string | null>;
  update: (id: string, params: Stripe.SubscriptionUpdateParams) => Promise<unknown>;
}

const live: PlanChangeDeps = {
  find: ourSubscription,
  price: priceIdFor,
  update: (id, params) => stripe().subscriptions.update(id, params),
};

export async function changePlan(kind: PlanChange, customerId: string, deps: PlanChangeDeps = live): Promise<{ status: number; body: Record<string, unknown> }> {
  const sub = await deps.find(customerId);
  if (!sub || sub.status !== "active") return { status: 400, body: { error: kind === "upgrade" ? "No active subscription to upgrade." : "No active subscription to change." } };
  if (sub.cancel_at_period_end || sub.cancel_at != null) return { status: 409, body: { error: "Your plan is set to end. Keep it first, then change it." } };
  const item = sub.items.data[0];
  if (!item?.price) return { status: 400, body: { error: "The subscription has no plan to change." } };
  const target = TARGET[kind];
  if (tierOfSubscription(sub) === target) return { status: 200, body: { ok: true, already: true } };
  const iv = item.price.recurring?.interval;
  const interval = isInterval(iv) ? iv : "month";
  const priceId = (await deps.price(target, interval)) ?? (interval === "year" ? await deps.price(target, "month") : null);
  if (!priceId) return { status: 503, body: { error: "That plan isn't set up yet." } };
  await deps.update(sub.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: PRORATION[kind],
    metadata: { ...sub.metadata, tier: target },
  });
  return { status: 200, body: { ok: true } };
}
