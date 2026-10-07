import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/admin-guard";
import { applyTargetPrice, deleteWatch, watchDb } from "@/lib/watchlist-server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function cardIdOf(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

// DELETE — stop watching one card, in every market.
//
// The path segment is a CARD id, not a row id: the heart knows the card it
// renders for and nothing else, and "unwatch this card" means every market.
// Scoping the delete by userId IS the authorisation check — another account's
// row is simply not matched, so nothing can probe who watches what. 404 when
// nothing was removed; the client treats that as success.
export async function DELETE(req: Request, { params }: { params: { cardId: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const cardId = cardIdOf(params.cardId);
  if (cardId == null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const removed = await deleteWatch(user.id, cardId);
  if (removed === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removed }, { headers: noStore });
}

// PATCH { market, targetCents: number | null } — set or clear the TARGET
// PRICE on one watch (Plus 25, Premium unlimited). Everything past the session
// and the rate limit is lib/watchlist-server.ts applyTargetPrice.
export async function PATCH(req: Request, { params }: { params: { cardId: string } }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`alerts:target:${user.id}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const cardId = cardIdOf(params.cardId);
  if (cardId == null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await applyTargetPrice(watchDb, user, cardId, await req.json().catch(() => null));
  return NextResponse.json(result.body, { status: result.status, headers: noStore });
}
