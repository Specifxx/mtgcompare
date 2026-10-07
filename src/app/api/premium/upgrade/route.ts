import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { changePlan } from "@/lib/plan-change";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST → Plus → Premium, same interval, billed the prorated difference now (always_invoice).
// RiftCompare's /api/premium/upgrade. The logic, the site=opcompare check and the
// idempotency are lib/plan-change.ts. Entitlement is NOT written here: the
// webhook restamps the tier from customer.subscription.updated.
const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Cross-site request refused." });
  const user = await getCurrentUser();
  if (!user) return json(401, { error: "Sign in first." });
  const rl = rateLimit(`plan-upgrade:${user.id}`, 10, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  if (!stripeEnabled()) return json(503, { error: "Subscriptions aren't open yet." });
  if (!user.stripeCustomerId) return json(404, { error: "No subscription on this account." });
  try {
    const res = await changePlan("upgrade", user.stripeCustomerId);
    return json(res.status, res.body);
  } catch (e) {
    console.error("[premium/upgrade]", (e as Error).message);
    return json(502, { error: "Couldn't change your plan — you can also change it from the billing portal, or contact us." });
  }
}
