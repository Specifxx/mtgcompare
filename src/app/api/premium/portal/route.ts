import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkoutErrorText } from "@/lib/checkout-params";
import { SITE_URL } from "@/lib/site";
import { portalConfigurationId, stripe, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST → {url} of the Stripe Customer Portal: cancel, change card, invoices, switch plan.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!stripeEnabled() || !user.stripeCustomerId) return NextResponse.json({ error: "No subscription on this account." }, { status: 404 });
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${SITE_URL}/account`,
      configuration: await portalConfigurationId(),
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[portal]", (e as Error).message);
    return NextResponse.json({ error: checkoutErrorText(e, user.isAdmin, "The billing portal could not open. Please try again.") }, { status: 502 });
  }
}
