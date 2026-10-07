import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { isPremium } from "@/lib/premium";
import { DEAL_PAGE_SIZE, defaultBuyKeys, resolveBuyKeys, type DealSort } from "@/lib/deals";
import { getTcgDeals, getVsEbayDeals, idsForSlugs } from "@/lib/deal-pages";
import { watchedCardIds } from "@/lib/watchlist-server";

export const dynamic = "force-dynamic";

// "Only my cards" (Plus) for Deal Finder. OP Compare's watchlist lives in the
// browser, so the page's ?mine=watch island POSTs the watched card slugs here
// and gets back exactly the page the server would render for those cards: the
// SAME pure ranking over the SAME cached inputs, filtered BEFORE paging. Plus
// only — the ranking is never computed for anyone else. Uncached (per reader).
const MAX_SLUGS = 500;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!isPremium(user)) return NextResponse.json({ error: "Only my cards is part of Plus.", code: "tier_required" }, { status: 402 });
  const body = (await req.json().catch(() => ({}))) as { view?: unknown; buy?: unknown; sort?: unknown; page?: unknown; slugs?: unknown };
  const slugs = (Array.isArray(body.slugs) ? body.slugs : []).filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 200).slice(0, MAX_SLUGS);
  const sort: DealSort = body.sort === "pct" ? "pct" : "saving";
  const page = Math.max(1, Math.floor(Number(body.page)) || 1);
  const country = getCountry();
  // The account's own watchlist (PriceAlert, wave 2 — RiftCompare reads it
  // server-side too), plus any slugs still saved in this browser.
  const onlyIds = new Set([...(await idsForSlugs(slugs)), ...(await watchedCardIds(user.id)).map((r) => r.cardId)]);
  const headers = { "Cache-Control": "no-store" };
  if (body.view === "vs-ebay") {
    const list = await getVsEbayDeals(country, { sort, page, pageSize: DEAL_PAGE_SIZE, onlyIds });
    return NextResponse.json({ country, view: "vs-ebay", watched: onlyIds.size, list }, { headers });
  }
  const requested = Array.isArray(body.buy) ? body.buy.filter((k): k is string => typeof k === "string") : null;
  const buy = requested ? resolveBuyKeys(country, requested) : defaultBuyKeys(country);
  const list = await getTcgDeals(country, { buy, sort, page, pageSize: DEAL_PAGE_SIZE, onlyIds });
  return NextResponse.json({ country, view: "tcg", watched: onlyIds.size, list }, { headers });
}
