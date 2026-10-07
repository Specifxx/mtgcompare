import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/admin-guard";
import { getCurrentUser } from "@/lib/auth";
import { recordPlanClick } from "@/lib/beacons";
import { parsePlanClick } from "@/lib/nudge-surface";
import { HOUR, ipKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Premium-interest beacon (RiftCompare's /api/premium/click): someone clicked a
// Plus/Premium call to action, and on which surface (lib/nudge-surface.ts), so
// /admin/premium shows interest ahead of, and independent of, subscribing.
// Always 204; an unknown surface is coerced to "dialog", never written as-is.
const NO_CONTENT = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  try {
    // Our own pages only (sendBeacon and fetch both send Sec-Fetch-Site/Origin).
    if (!sameOrigin(req)) return NO_CONTENT();
    if (!rateLimit(`plan-click:${ipKey(req)}`, 60, HOUR).ok) return NO_CONTENT();
    const text = await req.text();
    if (text.length > 1_000) return NO_CONTENT();
    const { surface, tier } = parsePlanClick(JSON.parse(text));
    const user = await getCurrentUser(); // no DB read without a session cookie
    await recordPlanClick(surface, tier, user?.id ?? null);
  } catch {
    /* never fail a beacon */
  }
  return NO_CONTENT();
}
