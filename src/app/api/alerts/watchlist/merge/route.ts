import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/admin-guard";
import { getCatalog } from "@/lib/data";
import { isCountry } from "@/lib/country";
import { mergeLocalWatches, resolveLocalItems, watchDb } from "@/lib/watchlist-server";

export const dynamic = "force-dynamic";

// POST { items: [{ slug, id? }], market } — the signed-out (localStorage)
// watchlist, merged into the account on the first signed-in load
// (lib/use-watchlist.ts). Slugs resolve through the cached catalogue; at most
// 200 are imported and they are grandfathered (no free-limit check — the
// limit applies to adds after the merge). Idempotent.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`alerts:merge:${user.id}`, 5, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { items?: unknown; market?: unknown } | null;
  const market = isCountry(body?.market) ? body.market : "US";
  const cat = await getCatalog();
  const ids = resolveLocalItems(body?.items, cat);
  try {
    const { merged } = await mergeLocalWatches(watchDb, user, ids, market);
    return NextResponse.json({ ok: true, merged, cardIds: ids }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[alerts/watchlist/merge]", (e as Error).message);
    return NextResponse.json({ error: "Couldn't save your watchlist just now." }, { status: 503 });
  }
}
