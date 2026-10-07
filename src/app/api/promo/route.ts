import { NextResponse } from "next/server";
import { getLaunchPromo } from "@/lib/data";

// The launch promotion's live counter for the signed-out popup. Public and
// identical for everyone, so the CDN may hold it for half a minute.
export async function GET() {
  const status = await getLaunchPromo();
  return NextResponse.json(status, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
