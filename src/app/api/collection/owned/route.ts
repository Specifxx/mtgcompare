import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCatalog } from "@/lib/data";
import { ownedBySet, ownedDb } from "@/lib/set-owned";

export const dynamic = "force-dynamic";

// GET /api/collection/owned?set=op-01 — which cards of ONE set the signed-in
// account holds, as {cardId: copies} (any condition). RiftCompare's route,
// wave 2.
//
// The set page's client overlay reads this (components/SetOwned.tsx) instead of
// the page reading the session: the public /sets/[slug] page is shared by every
// visitor, and a cookie read there would make it per-request for everyone. A
// signed-out visitor is known from /api/me and never calls this.
//
// Authenticated and never cached (no-store): the answer is one account's binder.
// One groupBy scoped by userId, narrow, capped (lib/set-owned.ts).
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });

  const slug = new URL(req.url).searchParams.get("set")?.trim().toLowerCase() ?? "";
  const set = slug ? (await getCatalog()).setBySlug.get(slug) : undefined;
  if (!set) return NextResponse.json({ error: "Unknown set" }, { status: 400, headers: NO_STORE });

  try {
    const owned = await ownedBySet(await ownedDb(), user.id, set.id);
    return NextResponse.json({ set: set.slug, owned }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Couldn't load your binder right now — please try again." }, { status: 500, headers: NO_STORE });
  }
}
