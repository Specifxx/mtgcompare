import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSealedWatch, listSealedWatches, sealedDb } from "@/lib/sealed-watch";

// SEALED WATCHES (Plus and Premium): one sealed product in the viewer's market.
// Entitlement (402 without a paid tier), the Plus cap (409) and ownership live
// in lib/sealed-watch.ts; this is transport.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await listSealedWatches(sealedDb, user);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`sealed-watch:${user.id}`, 60, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const res = await createSealedWatch(sealedDb, user, body, getCountry());
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
