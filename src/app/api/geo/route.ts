import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { COUNTRIES, normalizeCountry } from "@/lib/country";

// Geo-detection for first-time visitors (RiftCompare's /api/geo). The root
// layout reads no cookie or header (a dynamic read there would make every
// route per-request), so CountryProvider asks this once after mount when no
// `country` cookie exists. A route handler being dynamic does not affect page
// caching.
export const dynamic = "force-dynamic";

export async function GET() {
  const country = normalizeCountry(headers().get("x-vercel-ip-country"));
  return NextResponse.json(
    { country, currency: COUNTRIES[country].currency },
    // Private per-visitor result; the browser may reuse it for the session.
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
