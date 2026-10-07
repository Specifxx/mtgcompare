import { NextResponse } from "next/server";
import { getCardDetail, getEbayPanel, getProductHistory } from "@/lib/data";
import { quickViewPayload } from "@/lib/quick-view";

// The card QuickView's data (components/QuickView.tsx): one card's facts, every
// market's cheapest open rows (affiliate-tagged), its eBay searches and the
// TCGplayer reference and its last 90 days of price history, as small
// market-independent JSON. Reads only the card page's own loaders: the
// self-cached getCardDetail (a Data Cache read, never a query) and
// getProductHistory (the GitHub history file, fetch-cached; no database).
// The CDN keeps each card for 10 minutes, and the same response serves every
// market.
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,160}$/;

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!SLUG.test(params.slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const card = await getCardDetail(params.slug);
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  const history = await getProductHistory(card.id).catch(() => []);
  const panel = await getEbayPanel(card.id).catch(() => ({ listings: [], graded: [] }));
  return NextResponse.json(quickViewPayload(card, undefined, history, panel.graded), {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
