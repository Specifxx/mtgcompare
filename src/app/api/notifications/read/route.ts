import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { markRead, parseReadBody } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// POST { id } | { all: true } — mark one notification, or the whole feed, read.
// Scoped to the signed-in account's own rows either way.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`notifications-read:${user.id}`, 120, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const which = parseReadBody(await req.json().catch(() => null));
  if (!which) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const updated = await markRead(user.id, which);
  return NextResponse.json({ ok: true, updated }, { headers: { "Cache-Control": "no-store" } });
}
