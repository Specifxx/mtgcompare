import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ourSubscription } from "@/lib/plan-subscription";
import { sameOrigin } from "@/lib/admin-guard";
import { tierOfSubscription } from "@/lib/stripe-entitlement";
import { priceIdFor, stripe, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST → switch the caller's monthly subscription to the yearly Price of the
// same tier, in one click, prorated: Stripe invoices the year now with credit
// for the unused part of the month (proration_behavior "always_invoice").
// RiftCompare's /api/premium/switch-to-annual.
//
// Entitlement is NOT written here. The update fires
// customer.subscription.updated and the webhook (or the daily reconcile)
// stamps the new period end, extend-only, as for every other change.
const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Cross-site request refused." });
  const user = await getCurrentUser();
  if (!user) return json(401, { error: "Sign in first." });
  if (!stripeEnabled()) return json(503, { error: "Subscriptions aren't open yet, so there is no plan to switch." });
  if (!user.stripeCustomerId) return json(404, { error: "No subscription on this account." });
  try {
    const sub = await ourSubscription(user.stripeCustomerId);
    if (!sub || sub.status !== "active") return json(400, { error: "No active subscription to switch." });
    // Never bill a year up front to a subscription set to end.
    if (sub.cancel_at_period_end || sub.cancel_at != null) return json(409, { error: "Your plan is set to end. Keep it first, then switch to yearly." });
    const item = sub.items.data[0];
    if (!item) return json(400, { error: "The subscription has no plan to switch." });
    if (item.price.recurring?.interval === "year") return json(200, { ok: true, already: true });
    const tier = tierOfSubscription(sub);
    const target = await priceIdFor(tier, "year");
    if (!target) return json(503, { error: "Yearly billing isn't set up for this plan yet." });
    await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, price: target }],
      proration_behavior: "always_invoice",
      metadata: { ...sub.metadata, interval: "year" },
    });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[premium/switch-to-annual]", (e as Error).message);
    return json(502, { error: "Couldn't switch your plan. You can change it from the billing portal instead." });
  }
}
