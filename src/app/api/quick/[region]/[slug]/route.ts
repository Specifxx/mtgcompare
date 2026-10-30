import { offerRowsData } from "@/components/OfferTable";
import { ebayQuery } from "@/components/Marketplaces";
import { productPage } from "@/lib/data";
import { marketplaceOf } from "@/lib/ebay-context";
import { rowPacks } from "@/lib/ebay-offer-row";
import { packsFor } from "@/lib/packs";
import { REGIONS, isRegion } from "@/lib/regions";
import { isPreorderSet } from "@/lib/release";
import { offerStock } from "@/lib/sealed-offers";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";

// GET /api/quick/<region>/<slug>: a product card's quick view (components/QuickView.tsx), the product page's price table as data: the same
// rows (OfferTable.tsx offerRowsData), the same eBay pick arguments, so the same rows in the same order (eBay first, then TCGplayer and
// Amazon, then the stores). Rendered per request and kept by Vercel's CDN for a day, like the pages (the data only changes with a
// release, which empties the CDN), never ISR. /api/ is disallowed in robots.txt.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";
const headers = { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN };

export async function GET(_req: Request, { params }: { params: { region: string; slug: string } }) {
  if (!isRegion(params.region)) return Response.json({ error: "unknown region" }, { status: 404, headers });
  const region = params.region;
  const r = REGIONS[region];
  const p = await productPage(params.slug, r.market);
  if (!p || !p.offers.length) return Response.json({ error: "not listed here" }, { status: 404, headers });
  // As the product page computes them (src/app/[region]/p/[slug]/page.tsx).
  const type = TYPE_BY_LABEL.get(p.productType);
  const pre = isPreorderSet(p.setCode);
  const packs = type ? packsFor(type.key, p.setCode, p.name) : null;
  const tcgplayer = p.offers.find((o) => o.marketplace) ?? p.usMarketplace;
  const best = p.offers.find((o) => offerStock(o) === "open");
  const cheapestCents = best?.priceCents ?? p.offers.reduce<number | null>((m, o) => (m == null || o.priceCents < m ? o.priceCents : m), null);
  const ebayComparable = marketplaceOf(region).currency === r.currency;
  const floor = cheapestCents != null && ebayComparable ? { value: (cheapestCents * 0.4) / 100, currency: r.currency } : null;
  const { rows, tcg, amazon, storeOffers } = offerRowsData({ offers: p.offers, region, packs, placement: "quickview-table", pinned: { productName: p.name, tcgplayer } });
  const stores = storeOffers.filter((o) => !o.marketplace);
  return Response.json(
    {
      slug: p.slug,
      stores: stores.length,
      inStock: stores.filter((o) => offerStock(o) === "open").length,
      rows,
      tcg,
      amazon,
      ebay: { slug: p.slug, query: ebayQuery(p.name, tcgplayer), floor, packs: rowPacks(type?.key, packs) },
      preorder: pre,
    },
    { headers },
  );
}
