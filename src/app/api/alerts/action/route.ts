import { NextResponse } from "next/server";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyAlertAction } from "@/lib/alert-actions";
import { applyAlertActionToken } from "@/lib/alert-routes";

// RiftCompare's /api/alerts/action, ported in wave 2 (2026-10-03). The token is
// signed with a key derived from EMAIL_LINK_SECRET (lib/alert-actions.ts): with
// it unset every token is refused (fail closed).
//
// POST — apply one signed one-tap action from a price-alert email (stop
// watching, snooze 30 days, set / lower a target). The logic, the signature
// check (403) and the target rules (Plus only, targetAlertLimit enforced) are
// lib/alert-actions.ts performAlertAction; this is only the transport.
//
// POST ACTS, GET NEVER DOES, on purpose: mail scanners and link prefetchers GET
// every link in a message. The email links to the /alerts/action confirmation
// page, whose button posts here; a GET here only redirects to that page.
//
// Three request shapes:
//   • the confirmation page's plain HTML form (form-encoded `t`) — answered
//     with a 303 back to that page carrying the outcome, so it works with no
//     JavaScript at all;
//   • JSON { token } — answered with JSON and the real status;
//   • the RFC 8058 one-click POST from a deck or sealed watch email's
//     List-Unsubscribe header (2026-09-29): the token rides the URL's `?t=`
//     and the body is the fixed "List-Unsubscribe=One-Click". That token is
//     always the STOP of that one deck or sealed watch — what a mail client's
//     "Unsubscribe" button has to do — and never a card token, and never the
//     address-wide pause a card digest's one-click does, because these emails
//     are per watch. (It was a 30-day snooze at first; a member who tapped
//     Gmail's Unsubscribe was still subscribed. DECISIONS.md, 2026-09-29,
//     "Watch emails: List-Unsubscribe stops".) Answered with JSON.
// A bad, tampered or expired token is a 403 either way.
//
// GET answers with a redirect to the /alerts/action confirmation page and
// changes nothing: List-Unsubscribe's URL is what a client without one-click
// support opens in a browser, and a scanner that GETs it must stay harmless.
//
// Addressed by the signed token alone, like the unsubscribe link: the tap
// comes from a mail client with no session cookie.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const to = new URL(t ? `/alerts/action?t=${encodeURIComponent(t)}` : "/alerts/action", req.url);
  return NextResponse.redirect(to, { status: 303, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const rl = rateLimit(`alerts:action:${ipKey(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const type = req.headers.get("content-type") ?? "";
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  let token: string | null = null;
  let oneClick = false;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const t = form?.get("t");
    token = typeof t === "string" ? t : null;
    if (!token && form?.get("List-Unsubscribe") === "One-Click") {
      // The mail client's one-click POST: the token is in the URL.
      token = new URL(req.url).searchParams.get("t");
      oneClick = true;
    }
  } else {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : null;
  }

  const headers = { "Cache-Control": "no-store" };
  if (oneClick) {
    // One-click may only STOP one deck or sealed watch: exactly the token the
    // watch emails name in their List-Unsubscribe header. A card token, a
    // snooze or a target token forwarded into a one-click POST is refused.
    const v = verifyAlertAction(token);
    if (!v.ok || v.kind === "price" || v.action !== "stop") return NextResponse.json({ error: "This link is not valid for one-click." }, { status: 403, headers });
  }
  const result = await applyAlertActionToken(token);
  if (isForm && !oneClick && result.outcome !== "invalid" && token) {
    const back = new URL(`/alerts/action?t=${encodeURIComponent(token)}&r=${result.outcome}`, req.url);
    return NextResponse.redirect(back, { status: 303, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}
