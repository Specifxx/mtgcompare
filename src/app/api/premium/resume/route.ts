import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ourSubscription } from "@/lib/plan-subscription";
import { sameOrigin } from "@/lib/admin-guard";
import { stripe, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST → "Keep Plus/Premium": turn renewal back ON for the caller's own
// subscription that is set to end (RiftCompare's /api/premium/resume, without
// its intro-coupon branch: MTG Compare has no intro offer). It clears the
// cancellation and nothing else: nothing is charged now and the next renewal
// date is unchanged. A GET does nothing (405 by omission).
//
// Entitlement is NOT written here. The update fires
// customer.subscription.updated and the webhook (or the daily reconcile)
// stamps the period, extend-only, as for every other change.
const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Cross-site request refused." });
  const user = await getCurrentUser();
  if (!user) return json(401, { error: "Sign in first." });
  if (!stripeEnabled()) return json(503, { error: "Subscriptions aren't open yet." });
  if (!user.stripeCustomerId) return json(404, { error: "No subscription on this account." });
  try {
    const sub = await ourSubscription(user.stripeCustomerId);
    if (!sub) return json(400, { error: "This subscription has already ended. Start a new one from this page." });
    if (!sub.cancel_at_period_end && sub.cancel_at == null) return json(200, { ok: true, already: true });
    await stripe().subscriptions.update(sub.id, {
      cancel_at_period_end: false,
      ...(sub.cancel_at != null ? { cancel_at: "" } : {}),
      metadata: { keptAt: new Date().toISOString(), keptVia: "resume" },
    });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[premium/resume]", (e as Error).message);
    return json(502, { error: "Couldn't turn renewal back on. You can do it from the billing portal instead." });
  }
}
