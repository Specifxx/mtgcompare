import { NextResponse } from "next/server";
import { adminLog, requireAdminApi } from "@/lib/admin";
import { stripeEnabled } from "@/lib/stripe";
import { runStripeReconcile } from "@/lib/stripe-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Sync Stripe subscriptions now": the daily reconcile, on demand. Same code,
// same rules (extend-only, never matched by email).
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  if (!stripeEnabled()) return NextResponse.json({ skipped: "STRIPE_SECRET_KEY not set" });
  try {
    const r = await runStripeReconcile();
    adminLog(gate, "reconcile", { seen: r.seen, stamped: r.stamped, unmatched: r.unmatched });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reconcile failed" }, { status: 500 });
  }
}
