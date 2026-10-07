import { NextResponse } from "next/server";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { alertEmailSummaryForToken, applyAlertEmailModeForToken } from "@/lib/alert-routes";
import { parseUnsubscribeBody } from "@/lib/alert-mute";

export const dynamic = "force-dynamic";

// The footer and List-Unsubscribe target of every price-alert email, addressed
// by the address's unsubToken (no session: the click comes from a mail client).
// RiftCompare's /api/alerts/unsubscribe, ported in wave 2 (2026-10-03).
//
// PAUSE, NOT DELETE, BY DEFAULT (lib/alert-mute.ts):
//   • POST form-encoded "List-Unsubscribe=One-Click" with ?token= — RFC 8058
//     one-click from the inbox's own Unsubscribe button. PAUSES alert email
//     (AlertMute), keeps every watch. No confirm step: it is reversible.
//   • POST JSON { token, mode } — the /unsubscribe page. mode "pause" (the
//     default), "resume", "delete" (every watch — the page's separate,
//     explicit button) or "remove" (one watch, with alertId).
//   • GET ?token= — what the token covers, for the page.

export async function GET(req: Request) {
  const rl = rateLimit(`alerts:unsub-read:${ipKey(req)}`, 60, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const summary = await alertEmailSummaryForToken(token.slice(0, 200));
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const rl = rateLimit(`alerts:unsub:${ipKey(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";
  const headers = { "Cache-Control": "no-store" };

  // RFC 8058 one-click: whatever ?mode= says, this path can only pause — an
  // inbox button must never delete a watchlist.
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const token = (url.searchParams.get("token") ?? "").slice(0, 200);
    const res = await applyAlertEmailModeForToken(token, "pause", { source: "one-click" });
    return NextResponse.json(res.body, { status: res.status, headers });
  }

  const parsed = parseUnsubscribeBody(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  const res = await applyAlertEmailModeForToken(parsed.token, parsed.mode, { alertId: parsed.alertId, source: "page" });
  return NextResponse.json(res.body, { status: res.status, headers });
}
