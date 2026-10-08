import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin-guard";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { addToCollection, collectionItems } from "@/lib/collection-server";

// ─────────────────────────────────────────────────────────────────────────────
// The signed-in account's binder ("My Collection"). Every database read and write
// is in lib/collection-server.ts; this file keeps the session read, the
// same-origin check, the rate limit and the response. Session cookie ⇒ never
// cacheable.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

// GET: the collection, newest edit first (capped at 2,000 rows), each row with
// its card from the CACHED catalogue (no join): slug, name, number, variant,
// printing, rarity, set code, image and the per-market lowest price.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ items: await collectionItems(user.id) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Couldn't load your collection right now — please try again." }, { status: 500, headers: noStore });
  }
}

// POST { cardId, condition?, isFoil?, quantity?, costBasisCents?, costBasisIsTotal?, note? }:
// add a card (or more copies of it). 402 at the free limit, 409 full or busy.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`collection:add:${user.id}`, 120, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  try {
    const res = await addToCollection(user, await req.json().catch(() => null));
    return NextResponse.json(res.body, { status: res.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Couldn't save that right now — please try again." }, { status: 500 });
  }
}
