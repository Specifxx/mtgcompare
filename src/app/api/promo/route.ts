import { NextResponse } from "next/server";
import { getLaunchPromo } from "@/lib/data";

// force-dynamic: the counter is read per request (the loader holds it 30 s), never
// at build time, so a build touches no database.
export const dynamic = "force-dynamic";

// The launch promotion's live counter for the signed-out popup. Public and
// identical for everyone, so the CDN may hold it for half a minute.
export async function GET() {
  const status = await getLaunchPromo();
  return NextResponse.json(status, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
