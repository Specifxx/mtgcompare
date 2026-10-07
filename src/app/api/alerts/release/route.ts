import { NextResponse } from "next/server";
import { getEmailStatus } from "@/lib/data";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseReleaseBody, subscribeRelease } from "@/lib/alert-routes";

export const dynamic = "force-dynamic";

// The one-field "email me when {set} lands" signup (lib/release-alerts.ts) —
// RiftCompare's /api/alerts/release, ported in wave 2 (2026-10-03). No account
// needed. A 404 while email is off (the form never renders then either). The
// only write is the visitor's own explicit signup, idempotent per
// (email, set, scope); nothing is sent here.
export async function POST(req: Request) {
  if ((await getEmailStatus()) !== "on") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rl = rateLimit(`alerts:release:${ipKey(req)}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = parseReleaseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (body.honeypot) return NextResponse.json({ ok: true });
  const res = await subscribeRelease(body);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
