import { NextResponse } from "next/server";
import { currentEntitlement } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { accessOf } from "@/lib/data/plane/entitlement";
import { accessFor } from "@/lib/premium-gates";
import { getMemberSavings } from "@/lib/top-deals";

export const dynamic = "force-dynamic";

// The homepage's "Biggest savings" rows beyond the one everybody gets. The
// cached homepage carries only that one row (components/home/home-data.ts), so
// the rest are limited on the server, here: Plus or better, asked of the loader
// with the session's Entitlement. Uncached itself (per reader).
export async function GET() {
  const who = await currentEntitlement();
  if (accessOf("deal-finder", who) !== "full") {
    const signedIn = accessFor("deal-finder", who.viewer) === "preview" && who.viewer.signedIn;
    return NextResponse.json({ error: signedIn ? "Biggest savings is part of Plus." : "Sign in first.", code: "tier_required" }, { status: signedIn ? 402 : 401 });
  }
  const country = getCountry();
  return NextResponse.json({ country, savings: await getMemberSavings(country, who) }, { headers: { "Cache-Control": "no-store" } });
}
