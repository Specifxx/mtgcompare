import { NextResponse } from "next/server";
import { stampFromSubscription } from "@/lib/premium";
import { stripe } from "@/lib/stripe";
import { subscriptionIdFromInvoice } from "@/lib/stripe-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe → MTG Compare. Subscribe the endpoint (https://mtgcompare.app/api/stripe/
// webhook) to exactly these events:
//   checkout.session.completed, checkout.session.async_payment_succeeded,
//   invoice.paid, invoice.payment_succeeded,
//   customer.subscription.created, customer.subscription.updated
// Every path re-reads the live subscription and stamps it extend-only, so
// duplicates and out-of-order deliveries are harmless. A failure returns 500 so
// Stripe retries; the daily reconcile (/api/cron/stripe-reconcile) backs it up.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const meta = (obj.metadata ?? {}) as Record<string, string>;
        if (meta.kind !== "mc_premium" || typeof obj.subscription !== "string") break;
        const sub = await stripe().subscriptions.retrieve(obj.subscription);
        const r = await stampFromSubscription(sub, meta.userId ?? (obj.client_reference_id as string | null));
        console.log(`[stripe] ${event.type} ${sub.id}: ${r}`);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const subId = subscriptionIdFromInvoice(obj);
        if (!subId) break;
        const sub = await stripe().subscriptions.retrieve(subId);
        console.log(`[stripe] ${event.type} ${subId}: ${await stampFromSubscription(sub)}`);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        console.log(`[stripe] ${event.type} ${String(obj.id)}: ${await stampFromSubscription(obj)}`);
        break;
    }
  } catch (e) {
    console.error(`[stripe] ${event.type} failed:`, (e as Error).message);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
