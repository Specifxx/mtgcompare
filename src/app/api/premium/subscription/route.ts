import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ourSubscription, summarizeSubscription } from "@/lib/plan-subscription";
import { priceIdFor, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// GET → the caller's own subscription: tier, monthly/yearly, renews or ends,
// and whether the yearly Price exists. Read by /premium's member card and the
// annual-switch offer. Never cached; {subscription: null} whenever there is
// nothing to show (signed out, Stripe not configured, no customer, an error).
const out = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !stripeEnabled() || !user.stripeCustomerId) return out({ subscription: null });
  try {
    const summary = summarizeSubscription(await ourSubscription(user.stripeCustomerId));
    if (!summary) return out({ subscription: null });
    const annualAvailable = summary.interval === "month" ? Boolean(await priceIdFor(summary.tier, "year")) : false;
    return out({ subscription: { ...summary, annualAvailable } });
  } catch (e) {
    console.error("[premium/subscription]", (e as Error).message);
    return out({ subscription: null });
  }
}
