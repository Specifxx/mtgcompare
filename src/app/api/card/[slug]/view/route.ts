import { NextResponse } from "next/server";
import { ipKey, rateLimit } from "@/lib/rate-limit";
import { isBotUserAgent, VIEW_IP_RATE_LIMIT, VIEW_IP_RATE_WINDOW_MS, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS } from "@/lib/card-views";
import { countCardView } from "@/lib/card-views-server";

export const dynamic = "force-dynamic";

const noContent = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const tooMany = (retryAfter: number) => new NextResponse(null, { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } });

// Card slugs are [a-z0-9-]; anything else can't be a card.
const CARD_KEY = /^[a-z0-9-]{1,160}$/;

// Record a card view Fire-and-forget from
// the client (lib/card-views.ts sendCardView). ?source=search marks it as a
// SEARCH pick (the demand signal behind Rising Cards, Demand Finder and the
// /movers "Most searched" strip); any other open bumps the view count.
//
// Hardened: crawlers and HTTP libraries get a 204 and never count, each IP
// counts at most VIEW_RATE_LIMIT times per card per 6 hours, and a per-IP cap
// of VIEW_IP_RATE_LIMIT an hour runs first so one IP can't grow the shared
// limiter map with made-up slugs. The write is lib/card-views-server.ts.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  if (isBotUserAgent(req.headers.get("user-agent"))) return noContent();
  if (!params.slug || !CARD_KEY.test(params.slug)) return noContent();
  const ip = ipKey(req);
  const perIp = rateLimit(`view-ip:${ip}`, VIEW_IP_RATE_LIMIT, VIEW_IP_RATE_WINDOW_MS);
  if (!perIp.ok) return tooMany(perIp.retryAfter);
  const limited = rateLimit(`view:${ip}:${params.slug}`, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS);
  if (!limited.ok) return tooMany(limited.retryAfter);
  const isSearch = new URL(req.url).searchParams.get("source") === "search";
  await countCardView(params.slug, isSearch ? "search" : "view");
  return noContent();
}
