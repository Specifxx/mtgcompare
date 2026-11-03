// One line → its best catalogue match. CDN-cached six hours.
import { NextResponse } from "next/server";
import { bestMatch } from "@/lib/lookup";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  return NextResponse.json({ match: bestMatch(q) }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
