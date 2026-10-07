import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { ADMIN_GRANTS, grantByEmail, parseAdminEmail, parseGrantDays } from "@/lib/admin-billing";
import { isTier } from "@/lib/plans";

export const dynamic = "force-dynamic";

// Manual grant: stacks `days` of Plus or Premium on the account's current
// paid-through date. No Stripe call. Admin session (or script bearer) only.
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  if (!ADMIN_GRANTS) return NextResponse.json({ error: "Manual grants are switched off" }, { status: 403 });
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const email = parseAdminEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter the account's email" }, { status: 400 });
  const days = parseGrantDays(body?.days);
  if (days == null) return NextResponse.json({ error: "Days must be a whole number from 1 to 1830" }, { status: 400 });
  const tier = isTier(body?.tier) ? body.tier : "premium";
  const r = await grantByEmail(email, days, tier);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  adminLog(gate, "grant", { email: r.email, days, tier, before: r.before, after: r.after });
  return NextResponse.json({ ok: true, email: r.email, premiumUntil: r.after.toISOString(), tier: r.tier, tierChanged: r.tierChanged });
}
