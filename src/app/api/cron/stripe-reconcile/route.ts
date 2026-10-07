import { NextResponse } from "next/server";
import { runStripeReconcile } from "@/lib/stripe-reconcile";
import { stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily, from Vercel Cron (vercel.json), which sends "Authorization: Bearer
// $CRON_SECRET". Fails CLOSED: without CRON_SECRET nobody can run it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!stripeEnabled()) return NextResponse.json({ skipped: "STRIPE_SECRET_KEY not set" });
  const r = await runStripeReconcile();
  if (r.unmatched.length) console.warn("[reconcile] subscriptions with no OP Compare user:", r.unmatched.join(", "));
  return NextResponse.json(r);
}
