import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { isPremium } from "@/lib/premium";
import { getMemberSavings } from "@/lib/top-deals";

export const dynamic = "force-dynamic";

// The homepage's "Biggest savings" rows beyond the one everybody gets. The
// cached homepage carries only that one row (lib/top-deals.ts), so the rest
// are limited on the server, here: Plus or better, checked per request.
// Backed only by the self-cached data.ts loaders; uncached itself (per reader).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!isPremium(user)) return NextResponse.json({ error: "Biggest savings is part of Plus.", code: "tier_required" }, { status: 402 });
  const country = getCountry();
  return NextResponse.json({ country, savings: await getMemberSavings(country) }, { headers: { "Cache-Control": "no-store" } });
}
