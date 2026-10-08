import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { changePlan } from "@/lib/plan-change";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST → Premium → Plus, same interval, the unused part credited to the next invoice (create_prorations).
// RiftCompare's /api/premium/downgrade. The logic, the site=mtgcompare check and the
// idempotency are lib/plan-change.ts. Entitlement is NOT written here: the
// webhook restamps the tier from customer.subscription.updated.
const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Cross-site request refused." });
  const user = await getCurrentUser();
  if (!user) return json(401, { error: "Sign in first." });
  if (!stripeEnabled()) return json(503, { error: "Subscriptions aren't open yet." });
  if (!user.stripeCustomerId) return json(404, { error: "No subscription on this account." });
  try {
    const res = await changePlan("downgrade", user.stripeCustomerId);
    return json(res.status, res.body);
  } catch (e) {
    console.error("[premium/downgrade]", (e as Error).message);
    return json(502, { error: "Couldn't change your plan — you can also change it from the billing portal, or contact us." });
  }
}
