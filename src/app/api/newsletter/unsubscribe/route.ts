import { NextResponse } from "next/server";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { newsletterSummaryForToken, unsubscribeNewsletter } from "@/lib/newsletter-signup";

export const dynamic = "force-dynamic";

// Token-addressed newsletter unsubscribe, mirroring /api/alerts/unsubscribe —
// RiftCompare's route, ported in wave 2. GET looks up what the token covers (so
// the page can confirm), POST removes the subscriber. POST-to-confirm keeps
// inbox link-prefetchers from unsubscribing people by accident. The token is
// the only credential, so the lookup is select-limited and rate-limited.
export async function GET(req: Request) {
  const rl = rateLimit(`newsletter:unsub:${ipKey(req)}`, 60, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return NextResponse.json(await newsletterSummaryForToken(token), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const rl = rateLimit(`newsletter:unsub:${ipKey(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || token.length > 100) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const ok = await unsubscribeNewsletter(token);
  return NextResponse.json({ ok: true, removed: ok ? 1 : 0 }, { headers: { "Cache-Control": "no-store" } });
}
