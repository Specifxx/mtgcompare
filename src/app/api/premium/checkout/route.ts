import { sameOrigin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordCheckoutStart } from "@/lib/beacons";
import { checkoutParams } from "@/lib/checkout-params";
import { isPlanClickSurface } from "@/lib/nudge-surface";
import { isInterval, isTier } from "@/lib/plans";
import { isPremium } from "@/lib/premium";
import { planInterval, sanitizeBackPath } from "@/lib/premium-start";
import { SITE_URL } from "@/lib/site";
import { priceIdFor, stripe, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// POST {tier, interval | plan, surface?, back?} → {url} of a hosted Stripe
// Checkout page. `surface` (validated, lib/nudge-surface.ts) and `back`
// (sanitized, lib/premium-start.ts) ride on the Session and subscription
// metadata, and the start is recorded as PremiumClick{source:"checkout"}
// (RiftCompare's checkout attribution, wave 2).
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!stripeEnabled()) return NextResponse.json({ error: "Subscriptions aren't open yet." }, { status: 503 });
  // A member changes plan in place (/premium's member card), never with a second subscription.
  if (isPremium(user) && !user.isAdmin) return NextResponse.json({ error: "You're already a member — change your plan from the membership page." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { tier?: unknown; interval?: unknown; plan?: unknown; surface?: unknown; back?: unknown };
  const tier = isTier(body.tier) ? body.tier : "premium";
  const interval = isInterval(body.interval) ? body.interval : body.plan === "annual" || body.plan === "monthly" ? planInterval(body.plan) : "month";
  const surface = isPlanClickSurface(body.surface) ? body.surface : null;
  const back = typeof body.back === "string" ? sanitizeBackPath(body.back) : null;
  try {
    const priceId = await priceIdFor(tier, interval);
    if (!priceId) return NextResponse.json({ error: "Subscriptions aren't open yet." }, { status: 503 });
    const session = await stripe().checkout.sessions.create(checkoutParams({ priceId, tier, interval, user, siteUrl: SITE_URL, surface, back }));
    await recordCheckoutStart(surface, tier, user.id).catch(() => {});
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[checkout]", (e as Error).message);
    return NextResponse.json({ error: "Checkout could not start. Please try again." }, { status: 502 });
  }
}
