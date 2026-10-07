import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/admin-guard";
import { getCatalog } from "@/lib/data";
import { alertsPaused, createWatch, listWatches, targetCount, watchDb, watchedCardIds } from "@/lib/watchlist-server";

// ─────────────────────────────────────────────────────────────────────────────
// The signed-in account's watchlist (RiftCompare's /api/alerts/watchlist,
// ported in wave 2, 2026-10-03). Every database read and write is in
// lib/watchlist-server.ts; this file keeps the session read, the rate limit
// and the response. Session cookie ⇒ never cacheable.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// GET — every card this account watches, newest first.
//
// ?ids=1 — card ids only. lib/use-watchlist.ts calls this on EVERY signed-in
// page view (the header heart and every tile's heart), and all it builds is a
// Set of card ids. Only the watchlist itself (Watchlist.tsx: /watching and the
// drawer) needs the full shape.
//
// ?targets=1 — how many watches carry a target price ("N of 25 used" for a
// target field rendered away from the watchlist). One indexed count.
//
// The full list carries each row's card from the CACHED catalogue (no join):
// the CardLite a CardTile renders, plus its set code.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const sp = new URL(req.url).searchParams;

  if (sp.get("ids") === "1") {
    return NextResponse.json({ items: await watchedCardIds(user.id) }, { headers: noStore });
  }
  if (sp.get("targets") === "1") {
    return NextResponse.json({ used: await targetCount(user.id) }, { headers: noStore });
  }

  const [rows, paused, cat] = await Promise.all([listWatches(user.id), alertsPaused(user.email), getCatalog()]);
  const items = rows
    .map((r) => {
      const card = cat.byId.get(r.cardId);
      if (!card) return null;
      return { ...r, card: { ...card, setCode: cat.setById.get(card.setId)?.code ?? "" } };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  return NextResponse.json({ items, paused }, { headers: noStore });
}

// POST { cardId, market } — watch one card. 402 at the free limit.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`alerts:watch:${user.id}`, 60, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const result = await createWatch(watchDb, user, await req.json().catch(() => null));
  return NextResponse.json(result.body, { status: result.status, headers: noStore });
}
