import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setAccountAlertPause } from "@/lib/alert-routes";

// POST { paused } — the signed-in account's own "Pause alert emails" switch on
// /watching (rendered by the member track, and only while email is on): the
// account-side twin of the email footer's token page. Writes or deletes the
// AlertMute row for the account's address, which is the address its
// PriceAlert rows are written with. The watchlist itself is untouched.
// RiftCompare's /api/alerts/pause, ported in wave 2 (2026-10-03).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`alerts:pause:${user.id}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as { paused?: unknown } | null;
  if (typeof body?.paused !== "boolean") return NextResponse.json({ error: "Send { paused: boolean }" }, { status: 400 });

  await setAccountAlertPause(user.email, body.paused);
  return NextResponse.json({ ok: true, paused: body.paused }, { headers: { "Cache-Control": "no-store" } });
}
