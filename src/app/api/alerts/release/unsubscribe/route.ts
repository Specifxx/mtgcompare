import { NextResponse } from "next/server";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { stopReleaseAlerts } from "@/lib/alert-routes";

export const dynamic = "force-dynamic";

// Stops every release alert for the address behind `token`. POST only: the
// email's link opens /alerts/release, which POSTs here, and mail clients'
// RFC 8058 one-click Unsubscribe POSTs here directly. Never on GET, so a link
// scanner prefetching the email cannot unsubscribe anyone. (RiftCompare's
// route, wave 2.)
export async function POST(req: Request) {
  const rl = rateLimit(`alerts:release-unsub:${ipKey(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  let token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) {
    const body = await req.json().catch(() => null);
    token = typeof body?.token === "string" ? body.token : "";
  }
  if (!token || token.length > 100) return NextResponse.json({ error: "Missing token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const removed = await stopReleaseAlerts(token);
  return NextResponse.json({ ok: true, removed }, { headers: { "Cache-Control": "no-store" } });
}
