import { prisma } from "@/lib/db";
import { storeStat } from "@/lib/data";
import { linkPath, normaliseHost, variantOf, type CheckOffer, type StoreCheck } from "@/lib/link-check";
import { regionOfMarket } from "@/lib/regions";
import { isMarketplace, SOURCES, storeHost, type StoreConfig } from "@/lib/stores";

// GET /api/check/<host>: one store's listings, for the "Is this a good price?" checker (components/tools/LinkChecker.tsx). The
// visitor pastes a product link; the browser asks for that store's listings here and finds the pasted one, then compares its price
// with the region's browse index (/api/browse/<region>) it already loads. Only a store we read answers (its host from
// src/data/stores.json); any other host is a 404. Never fetches the store: these are our own stored listings.
//
// Rendered per request and kept by Vercel's CDN for a day, like the quick view (the data only changes with a release, which empties
// the CDN), never ISR. One store's rows are at most a few hundred: a small body. /api/ is disallowed in robots.txt.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";
const headers = { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN };

const BY_HOST = new Map<string, StoreConfig>(SOURCES.filter((s) => !isMarketplace(s)).map((s) => [normaliseHost(storeHost(s).split("/")[0]), s]));

export async function GET(_req: Request, { params }: { params: { host: string } }) {
  const store = BY_HOST.get(normaliseHost(decodeURIComponent(params.host)));
  const region = store ? regionOfMarket(store.market) : null;
  if (!store || !region) return Response.json({ error: "not a store we read" }, { status: 404, headers });
  const [rows, stat] = await Promise.all([
    prisma.offer.findMany({ where: { store: store.key }, select: { url: true, priceCents: true, inStock: true, product: { select: { slug: true } } } }),
    storeStat(store.key),
  ]);
  const offers: CheckOffer[] = rows.map((o) => {
    let path = "";
    try {
      path = linkPath(new URL(o.url).pathname);
    } catch {
      path = "";
    }
    return [path, o.product.slug, o.priceCents, o.inStock ? 1 : 0, variantOf(o.url)];
  });
  const body: StoreCheck = { v: 1, store: store.key, name: store.name, region: region.region, checkedAt: stat?.lastOkAt ? stat.lastOkAt.toISOString() : null, offers: offers.filter((o) => o[0]) };
  return Response.json(body, { headers });
}
