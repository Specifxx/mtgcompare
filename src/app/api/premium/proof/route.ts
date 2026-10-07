import { NextResponse } from "next/server";
import { isCountry, normalizeCountry } from "@/lib/country";
import { getCountry } from "@/lib/get-country";
import { dealCount } from "@/lib/top-deals";

export const dynamic = "force-dynamic";

// The Premium proof line's number: how many cards are on today's default Deal
// Finder list ("Underpriced vs TCGplayer", every store + eBay) in a market — the
// same total a free account's "N more cards on this list" counts. Public, no
// user data. Backed only by the self-cached data.ts loaders (getDealInputs,
// getCatalog). ?country= picks a market explicitly (CDN-cacheable); without it
// the visitor's own market cookie decides, so the answer is private.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("country");
  const explicit = raw != null && raw !== "";
  const country = explicit ? normalizeCountry(raw) : getCountry();
  const headers: Record<string, string> = explicit
    ? { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    : { "Cache-Control": "private, max-age=300", Vary: "Cookie" };
  const dealCountValue = isCountry(country) ? await dealCount(country) : 0;
  // `deals` is what PremiumProofLine and the slide-in read; `dealCount` is the
  // same number under the Deal Finder work's original name.
  return NextResponse.json({ country, deals: dealCountValue, dealCount: dealCountValue }, { headers });
}
