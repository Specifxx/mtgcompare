import { sameOrigin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEmailStatus } from "@/lib/data";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { anonymousAlertsEnabled, parseSubscribeBody, subscribeAddress } from "@/lib/alert-subscribe";

// Subscribe an email to price alerts on a set of cards, with no account —
// RiftCompare's /api/alerts/subscribe (the PriceAlertModal's door), ported in
// wave 2 (2026-10-03). BUILT, AND OFF: a 404 unless email is on AND the owner
// has set NEXT_PUBLIC_ANON_ALERTS=1 (lib/alert-subscribe.ts). Sends nothing at
// request time: the confirmation goes from the hourly outbox.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!anonymousAlertsEnabled(await getEmailStatus())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Anti email-bombing: how fast one IP can create subscriptions.
  const rl = rateLimit(`alerts:sub:${ipKey(req)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = parseSubscribeBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const res = await subscribeAddress(body, await getCurrentUser());
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
