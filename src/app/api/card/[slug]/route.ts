import { NextResponse } from "next/server";
import { availableFinishes, parseFinishParam } from "@/lib/constants";
import { getCardDetail, getEbayPanel, getUnitHistory } from "@/lib/data";
import { itemUrl } from "@/lib/listing-panel";
import { quickViewPayload } from "@/lib/quick-view";

// The card QuickView's data (components/QuickView.tsx): one card's facts, every
// market's cheapest open rows (affiliate-tagged), its eBay searches and the
// TCGplayer reference and its last 90 days of price history, as small
// market-independent JSON. Reads only the card page's own loaders: the
// published-data getCardDetail and getUnitHistory (pinned file reads) and the
// captured eBay panel (Neon, only for a tracked card; empty when it is down).
// ?finish=foil|nonfoil prices the other unit. The CDN keeps each card for 10
// minutes, and the same response serves every market.
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,160}$/;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  if (!SLUG.test(params.slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const card = await getCardDetail(params.slug);
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  const asked = parseFinishParam(new URL(req.url).searchParams.get("finish"))?.finish;
  const finish = asked && availableFinishes(card.mask).includes(asked) ? asked : card.headFinish;
  const history = card.tracked ? await getUnitHistory({ id: card.id, finish }, 90).catch(() => []) : [];
  const panel = card.tracked ? await getEbayPanel(card.id).catch(() => ({ listings: [], graded: [] })) : { listings: [], graded: [] };
  return NextResponse.json(quickViewPayload(card, undefined, history, panel.graded.map((g) => ({ market: g.market, grader: g.grader, grade: g.grade, priceCents: g.priceCents, currency: g.currency, url: itemUrl(g.market, g.itemId) })), finish), {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
