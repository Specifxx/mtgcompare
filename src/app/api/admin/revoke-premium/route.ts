import { NextResponse } from "next/server";
import { adminJsonBody, adminLog, requireAdminApi } from "@/lib/admin";
import { ADMIN_GRANTS, parseAdminEmail, revokeByEmail } from "@/lib/admin-billing";

export const dynamic = "force-dynamic";

// Manual revoke: clears premiumUntil ONLY — never isAdmin, the tier, the Stripe
// customer or Stripe itself. The response carries the caveats the UI shows.
export async function POST(req: Request) {
  const gate = await requireAdminApi(req, { mutation: true });
  if (gate instanceof NextResponse) return gate;
  if (!ADMIN_GRANTS) return NextResponse.json({ error: "Manual grants are switched off" }, { status: 403 });
  const body = await adminJsonBody(req);
  if (body instanceof NextResponse) return body;
  const email = parseAdminEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter the account's email" }, { status: 400 });
  const r = await revokeByEmail(email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  adminLog(gate, "revoke", { email: r.email, before: r.was, beforeTier: r.wasTier, after: null });
  return NextResponse.json({ ok: true, email: r.email, was: r.was?.toISOString() ?? null, wasTier: r.wasTier, stillAdmin: r.stillAdmin, hasStripeCustomer: r.hasStripeCustomer });
}
