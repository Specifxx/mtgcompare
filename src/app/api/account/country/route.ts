import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { setPreferredCountry } from "@/lib/accounts";
import { COUNTRY_COOKIE, isCountry } from "@/lib/country";

export const dynamic = "force-dynamic";

// POST { country } — the signed-in account's market (RiftCompare's
// /api/account/country): sets the `country` cookie (what every page reads)
// and User.preferredCountry (the welcome checklist's "Set your market" step,
// and the market a new device can start from). Wave 2.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { country?: unknown } | null;
  if (!isCountry(body?.country)) return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  await setPreferredCountry(user.id, body.country);
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(COUNTRY_COOKIE, body.country, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return res;
}
