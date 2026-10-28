import type { MetadataRoute } from "next";
import { isPreviewBuild } from "@/lib/build-env";
import { COMPARABLE } from "@/lib/data";
import { prisma } from "@/lib/db";
import { isComparable, statsInMarket } from "@/lib/public-data/joins";
import { routeRaw } from "@/lib/public-data/route";
import { activeStoreKeys } from "@/lib/hub-data";
import { MIN_HUB_PRODUCTS, productInSitemap } from "@/lib/index-tiers";
import { regionOfSitemapId, SITEMAP_IDS, STATIC_SITEMAP_ID, regionSitemap, staticSitemap } from "@/lib/sitemap";
import { REGION_LIST, type Market } from "@/lib/regions";
import { thinSections } from "@/lib/section-thin";

export const revalidate = 86400;

// /sitemap.xml is an index of /sitemap/0.xml (static + stores) and one file per
// region (src/lib/sitemap.ts). Each file is a few small, scoped reads.
//
// A failed query is rethrown, on purpose: the regeneration fails and ISR keeps
// serving the last good copy. The old single sitemap caught the error and
// cached a map with no products for 24 hours. The one exception is the build,
// which prerenders these files and must not fail when the database is
// unreachable or empty (DEPLOY.md): it gets the static pages without lastmod
// and empty regional files, and the first post-import refresh fills them in.
// A preview build writes the same without asking: its DATABASE_URL is
// production's, and a preview reads nothing at build (src/lib/build-env.ts).
export function generateSitemaps() {
  return SITEMAP_IDS;
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const n = Number(id);
  if (isPreviewBuild()) return n === STATIC_SITEMAP_ID ? staticSitemap({}) : [];
  try {
    // Only stores that list something and are not dormant: the others' pages are noindex (StoreListing.tsx storeMeta).
    if (n === STATIC_SITEMAP_ID) {
      const [lastmod, active, thin] = await Promise.all([
        lastImportByMarket(),
        activeStoreKeys(),
        Promise.all(REGION_LIST.map(async (r) => [r.region, await thinSections(r.market)] as const)),
      ]);
      return staticSitemap(lastmod, active, undefined, Object.fromEntries(thin));
    }
    const r = regionOfSitemapId(n);
    if (!r) return [];
    const [typeLabels, setCodes, productSlugs, lastmod] = await Promise.all([
      typesInMarket(r.market),
      setsInMarket(r.market),
      strongSlugs(r.market),
      lastImport(r.market),
    ]);
    return regionSitemap(r, { typeLabels, setCodes, productSlugs, lastmod });
  } catch (e) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.error(`sitemap/${n}: database unavailable at build (${(e as Error).message}); written without products until the first refresh.`);
      return n === STATIC_SITEMAP_ID ? staticSitemap({}) : [];
    }
    console.error(`sitemap/${n}: not regenerated, the previous copy stays:`, (e as Error).message);
    throw e;
  }
}

// ─── Reads (one market each; slugs and codes only) ───────────────────────────
// GROUP BY in SQL: Prisma's `distinct` dedupes client-side after fetching every row. Sets and types need MIN_HUB_PRODUCTS comparable
// products here to be listed (lib/index-tiers.ts); products, the strong tier only.

/** The values of `key` that MIN_HUB_PRODUCTS or more of the market's comparable products share, from the files. */
function hubKeysFromFiles(market: Market, key: (p: Record<string, unknown>) => unknown): { k: string }[] {
  const n = new Map<string, number>();
  for (const { s, p } of statsInMarket(market)) {
    const k = key(p);
    if (k != null && isComparable(s)) n.set(String(k), (n.get(String(k)) ?? 0) + 1);
  }
  return [...n].filter(([, c]) => c >= MIN_HUB_PRODUCTS).map(([k]) => ({ k }));
}

async function typesInMarket(market: Market): Promise<string[]> {
  const rows = await routeRaw(() => hubKeysFromFiles(market, (p) => p.productType), () => prisma.$queryRaw<{ k: string }[]>`
    SELECT p."productType" AS k FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."market" = ${market} AND (s."inStockStores" > 0 OR s."marketplaceOpen" OR s."listedStores" >= 2)
    GROUP BY 1 HAVING COUNT(*) >= ${MIN_HUB_PRODUCTS}`);
  return rows.map((r) => r.k);
}

async function setsInMarket(market: Market): Promise<string[]> {
  const rows = await routeRaw(() => hubKeysFromFiles(market, (p) => p.setCode), () => prisma.$queryRaw<{ k: string }[]>`
    SELECT p."setCode" AS k FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."market" = ${market} AND p."setCode" IS NOT NULL AND (s."inStockStores" > 0 OR s."marketplaceOpen" OR s."listedStores" >= 2)
    GROUP BY 1 HAVING COUNT(*) >= ${MIN_HUB_PRODUCTS}`);
  return rows.map((r) => r.k);
}

/** The market's strong product pages (lib/index-tiers.ts): the only products the sitemap lists. */
async function strongSlugs(market: Market): Promise<string[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, ...COMPARABLE },
    select: { inStockStores: true, listedStores: true, marketplaceOpen: true, product: { select: { slug: true, productType: true } } },
  });
  return rows.filter((r) => productInSitemap(r, r.product.productType)).map((r) => r.product.slug);
}

/** When the market's stores were last written by an import (StoreStat.updatedAt, current state). */
async function lastImport(market: Market): Promise<Date | null> {
  const agg = await prisma.storeStat.aggregate({ where: { market }, _max: { updatedAt: true } });
  return agg._max.updatedAt ?? null;
}

async function lastImportByMarket(): Promise<Record<string, Date | null>> {
  const rows = await prisma.storeStat.groupBy({ by: ["market"], _max: { updatedAt: true } });
  return Object.fromEntries(rows.map((r) => [r.market, r._max.updatedAt ?? null]));
}
