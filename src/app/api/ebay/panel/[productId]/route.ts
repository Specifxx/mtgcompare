import { NextResponse } from "next/server";
import { getCardsByIds, getEbayPanel, sealedExists } from "@/lib/data";
import { EBAY_ROUTE_CACHE, panelPayload, panelProductId } from "@/lib/listing-panel";

// The "Also available on eBay" panel's data (components/EbayCardPanel.tsx, PANEL_ENDPOINT): one product's captured
// listings and slabs, written to Neon by scripts/ebay.ts after a COMPLETED search, read here and never in a public
// page's server render. Neon is asked only for a product the pass can have searched (a tracked single or a sealed
// product of the published catalogue, two pinned plane reads), so an unknown or untracked id never wakes the
// database; getEbayPanel keeps each product six hours (tag ebay-banner, purged after a run that wrote) and returns an
// empty bundle when Neon is down. The same JSON serves every market (the island picks the visitor's), so the CDN
// keeps one entry per product. Item URLs are rebuilt in the browser with the current campaign; none is stored.
export const dynamic = "force-dynamic";

const EMPTY = { listings: [], graded: [] };

export async function GET(_req: Request, { params }: { params: { productId: string } }) {
  const id = panelProductId(params.productId);
  if (id == null) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": EBAY_ROUTE_CACHE.missing } });
  const card = (await getCardsByIds([id], { stores: false }).catch(() => null))?.get(id) ?? null;
  const searched = card ? card.cls === 0 && card.tracked !== 0 : (await sealedExists([id]).catch(() => new Set<number>())).has(id);
  if (!searched) return NextResponse.json(EMPTY, { headers: { "Cache-Control": EBAY_ROUTE_CACHE.none } });
  return NextResponse.json(panelPayload(await getEbayPanel(id)), { headers: { "Cache-Control": EBAY_ROUTE_CACHE.rows } });
}
