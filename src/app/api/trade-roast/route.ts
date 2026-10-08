import { NextResponse } from "next/server";
import { parseRoastBody, tradeRoast } from "@/lib/trade-gremlin";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// /api/trade-roast — the trade calculator's "Roast this trade" (RiftCompare's
// route, for Magic). RULES-ONLY: MTG Compare has no language-model key, so
// the reply is a canned line chosen by lib/trade-gremlin.ts tradeRoast() and
// says so (`source: "rules"`); the calculator discloses it. Rate-limited per IP
// all the same, so the route can't be used as a free hammer. No database, no
// session, no cache.

export async function POST(req: Request) {
  const rl = rateLimit(`roast:${ipKey(req)}`, 6, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = parseRoastBody(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { giveCents, getCents, currency } = parsed;

  const rule = tradeRoast(giveCents, getCents, currency);
  return NextResponse.json({ text: rule?.line ?? null, tone: rule?.tone ?? "fair", source: "rules" });
}
