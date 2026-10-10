import { NextResponse } from "next/server";
import { getChaseBanner } from "@/lib/data";
import { EBAY_ROUTE_CACHE, chasePayload } from "@/lib/listing-panel";

// The "Chase cards on eBay right now" strip's data (components/EbayChaseStrip.tsx, CHASE_ENDPOINT): the tiles of the
// one EbayBanner row (at most 100 KB), written to Neon by scripts/ebay.ts from COMPLETED searches and read here, never
// in a public page's server render. getChaseBanner keeps the row six hours (tag ebay-banner, purged after a run that
// wrote) and returns null when there is none or Neon is down: then the strip keeps its art tiles and search links.
export const dynamic = "force-dynamic";

export async function GET() {
  const p = await getChaseBanner();
  return NextResponse.json(chasePayload(p), { headers: { "Cache-Control": p ? EBAY_ROUTE_CACHE.rows : EBAY_ROUTE_CACHE.missing } });
}
