import { sameOrigin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { DECK_DAILY_LIMIT, PUBLISHED_DECKS_TAG, checkPublishText, commanderDeckPath } from "@/lib/published-decks";
import { publishDeck, publishesToday } from "@/lib/published-decks-server";

export const dynamic = "force-dynamic";

// Publish a deck from /deck. Signed-in accounts only — every published deck is
// attributed to someone. Spam protection, in order of how much it does:
// sign-in; a per-account cap of DECK_DAILY_LIMIT publishes per 24h counted in
// the database (global, unlike the in-memory limiter); a burst limit of 3 per
// 10 minutes; a honeypot; no links in the title or description; the list must
// be a real Commander-style deck (its commander, the format's size, singleton,
// the commander's colour identity, legal cards: lib/commander-rules.ts). The
// library is revalidated on demand so the deck appears at once.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to publish a deck." }, { status: 401 });

  const rl = rateLimit(`deck-publish:${user.id}`, 3, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  if (typeof body?.website === "string" && body.website.trim()) return NextResponse.json({ ok: true, slug: null });

  const text = checkPublishText(body?.title, body?.description);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const list = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  if (!list.trim()) return NextResponse.json({ error: "Paste and price your list first." }, { status: 400 });

  try {
    if ((await publishesToday(user.id)) >= DECK_DAILY_LIMIT) {
      return NextResponse.json({ error: `You can publish up to ${DECK_DAILY_LIMIT} decks a day.` }, { status: 429 });
    }
    const res = await publishDeck({ title: text.title, description: text.description, text: list, userId: user.id, authorName: user.displayName || null, source: "user", format: typeof body?.format === "string" ? body.format : null });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    revalidateTag(PUBLISHED_DECKS_TAG);
    revalidatePath("/decks");
    revalidatePath(commanderDeckPath(res.commanderSlug));
    return NextResponse.json({ ok: true, slug: res.slug });
  } catch {
    return NextResponse.json({ error: "Couldn't publish right now — please try again." }, { status: 500 });
  }
}
