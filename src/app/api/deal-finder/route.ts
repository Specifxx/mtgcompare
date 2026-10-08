import { NextResponse } from "next/server";
import { currentEntitlement, getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { accessOf } from "@/lib/data/plane/entitlement";
import { accessFor, allowsRefinement } from "@/lib/premium-gates";
import { DEAL_PAGE_SIZE, defaultBuyKeys, resolveBuyKeys, type DealSort } from "@/lib/deals";
import { getTcgDeals, getVsEbayDeals, idsForSlugs } from "@/lib/deal-pages";
import { collectionRows } from "@/lib/collection-server";
import { watchedCardIds } from "@/lib/watchlist-server";

export const dynamic = "force-dynamic";

// "Only my cards" for Deal Finder, a refinement that exists at full access only
// (Plus and Premium; premium-gates allowsRefinement). The page's ?mine= island
// POSTs here and gets back exactly the page the server would render for those
// cards: the SAME ranking behind getDealList / getVsEbayList, filtered BEFORE
// paging. "watch" is this browser's watched slugs plus the account's price alerts;
// "binder" is the account's collection (parity P29). Below full access the
// answer is 402, never a row. Uncached (per reader).
const MAX_SLUGS = 500;

export async function POST(req: Request) {
  const who = await currentEntitlement();
  const access = accessOf("deal-finder", who);
  if (!allowsRefinement(access)) {
    const user = access === "preview" ? await getCurrentUser() : null;
    if (!user && !who.viewer.signedIn) return NextResponse.json({ error: "Sign in first.", code: "sign_in" }, { status: 401 });
    return NextResponse.json({ error: "Only my cards is part of Plus.", code: "tier_required", access: accessFor("deal-finder", who.viewer) }, { status: 402 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { view?: unknown; mine?: unknown; buy?: unknown; sort?: unknown; page?: unknown; slugs?: unknown };
  const slugs = (Array.isArray(body.slugs) ? body.slugs : []).filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 200).slice(0, MAX_SLUGS);
  const sort: DealSort = body.sort === "pct" ? "pct" : "saving";
  const page = Math.max(1, Math.floor(Number(body.page)) || 1);
  const country = getCountry();
  const onlyIds = new Set<number>();
  if (body.mine === "binder") for (const r of await collectionRows(user.id).catch(() => [])) onlyIds.add(r.cardId);
  else {
    for (const id of await idsForSlugs(slugs)) onlyIds.add(id);
    for (const r of await watchedCardIds(user.id)) onlyIds.add(r.cardId);
  }
  const headers = { "Cache-Control": "no-store" };
  if (!onlyIds.size) return NextResponse.json({ country, view: body.view === "vs-ebay" ? "vs-ebay" : "tcg", watched: 0, list: { rows: [], total: 0, page: 1, pageCount: 1, available: true } }, { headers });
  if (body.view === "vs-ebay") {
    const list = await getVsEbayDeals(country, { sort, page, pageSize: DEAL_PAGE_SIZE, onlyIds }, who);
    return NextResponse.json({ country, view: "vs-ebay", watched: onlyIds.size, list }, { headers });
  }
  const requested = Array.isArray(body.buy) ? body.buy.filter((k): k is string => typeof k === "string") : null;
  const stores = defaultBuyKeys(country).filter((k) => !/^ebay/.test(k));
  const buy = requested ? resolveBuyKeys(country, requested).filter((k) => stores.includes(k)) : undefined;
  const list = await getTcgDeals(country, { buy, sort, page, pageSize: DEAL_PAGE_SIZE, onlyIds }, who);
  return NextResponse.json({ country, view: "tcg", watched: onlyIds.size, list }, { headers });
}
