// The sitemap's URL lists, as pure functions of data the route (src/app/sitemap.ts)
// reads. Kept apart from the queries so tests/sitemap.test.ts can check every
// URL is on SITE_URL without a database.
//
// Layout (Next's generateSitemaps): /sitemap.xml is the index; /sitemap/0.xml
// is the static pages and every store page; /sitemap/1.xml … /sitemap/7.xml
// is one region each — its types, sets and comparable products.
import type { MetadataRoute } from "next";
import { guidesFor } from "../content/guides";
import { COUNTRY_GUIDE } from "../content/guides/country-prices";
import { openPreorderGuides } from "./preorder-guides";
import { REGION_LIST, regionOfMarket, type Region, type RegionInfo } from "./regions";
import { PRODUCT_TYPES } from "./sealed-title";
import { SETS } from "./sets";
import { SITE_URL } from "./site";
import { STORES } from "./stores";

export const STATIC_SITEMAP_ID = 0;

/** /sitemap/<id>.xml per region, in REGION_LIST order: au=1, us=2, uk=3, ca=4, nz=5, eu=6, sg=7. */
export function sitemapIdOf(region: Region): number {
  return REGION_LIST.findIndex((r) => r.region === region) + 1;
}

export function regionOfSitemapId(id: number): RegionInfo | null {
  return REGION_LIST[id - 1] ?? null;
}

export const SITEMAP_IDS: { id: number }[] = [{ id: STATIC_SITEMAP_ID }, ...REGION_LIST.map((r) => ({ id: sitemapIdOf(r.region) }))];

const url = (path: string, lastModified: Date | null | undefined, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"], priority: number): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${path}`,
  ...(lastModified ? { lastModified } : {}),
  changeFrequency,
  priority,
});

/**
 * The static pages, each region's landing pages (its pre-order pages
 * included, while their set is upcoming) and every store page.
 * `lastmod` is each market's last import (StoreStat max(updatedAt) — a
 * current-state column, not history). `activeStores`, when given, is the keys
 * of the stores worth indexing (hub-data.ts activeStoreKeys: something listed,
 * not dormant); a store outside it is noindex and gets no URL here. Without it
 * (the build, with no database) every store is listed.
 */
export function staticSitemap(lastmod: Partial<Record<string, Date | null>>, activeStores?: Iterable<string>, today = new Date().toISOString().slice(0, 10)): MetadataRoute.Sitemap {
  const active = activeStores ? new Set(activeStores) : null;
  const out: MetadataRoute.Sitemap = [
    url("", null, "daily", 1),
    url("/about", null, "monthly", 0.3),
    url("/terms", null, "yearly", 0.1),
    url("/privacy", null, "yearly", 0.1),
    url("/contact", null, "yearly", 0.1),
  ];
  for (const r of REGION_LIST) {
    const m = lastmod[r.market];
    out.push(url(`/${r.region}`, m, "daily", 0.9));
    out.push(url(`/${r.region}/sealed`, m, "daily", 0.8));
    out.push(url(`/${r.region}/releases`, m, "weekly", 0.6));
    out.push(url(`/${r.region}/sets`, m, "weekly", 0.6));
    out.push(url(`/${r.region}/stores`, m, "weekly", 0.5));
    // The pages built from each import's current state (deals, price per pack, the week's digest) change with it. The guides index
    // changes only when a guide is added or edited, so the import time would be a false lastmod there: it has none.
    out.push(url(`/${r.region}/deals`, m, "daily", 0.7));
    out.push(url(`/${r.region}/cheapest-packs`, m, "daily", 0.6));
    out.push(url(`/${r.region}/this-week`, m, "daily", 0.5));
    out.push(url(`/${r.region}/guides`, null, "weekly", 0.5));
    // Pre-order pages, until release day (they are noindexed from then on: lib/preorder-guides.ts).
    for (const { set } of openPreorderGuides(today)) out.push(url(`/${r.region}/preorders/${set.slug}`, m, "daily", 0.8));
  }
  for (const s of STORES) {
    if (active && !active.has(s.key)) continue;
    const r = regionOfMarket(s.market);
    if (r) out.push(url(`/${r.region}/stores/${s.key}`, lastmod[s.market], "daily", 0.4));
  }
  // Every guide, in each region it is offered in (the registry is pure: no database read). No lastmod: a guide's live blocks
  // change with each import, but its text only when it is edited.
  for (const r of REGION_LIST) for (const g of guidesFor(r.region)) out.push(url(`/${r.region}/guides/${g.slug}`, null, "weekly", 0.6));
  // The one guide that compares every market, at its single region-less URL.
  out.push(url(COUNTRY_GUIDE.path, null, "weekly", 0.6));
  return out;
}

export interface RegionSitemapData {
  /** Product type labels ("Booster Box") with a comparable product in the market. */
  typeLabels: Iterable<string>;
  /** Set codes with a comparable product in the market. */
  setCodes: Iterable<string>;
  /** Slugs of the market's comparable products (data.ts COMPARABLE). */
  productSlugs: Iterable<string>;
  lastmod: Date | null;
}

/** One region's type, set and product pages. Unknown labels and codes are skipped, never guessed. */
export function regionSitemap(r: RegionInfo, d: RegionSitemapData): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  const labels = new Set(d.typeLabels);
  for (const t of PRODUCT_TYPES) if (labels.has(t.label)) out.push(url(`/${r.region}/type/${t.slug}`, d.lastmod, "daily", 0.7));
  const codes = new Set(d.setCodes);
  for (const s of SETS) if (codes.has(s.code)) out.push(url(`/${r.region}/sets/${s.slug}`, d.lastmod, "daily", 0.6));
  for (const slug of d.productSlugs) out.push(url(`/${r.region}/p/${slug}`, d.lastmod, "daily", 0.7));
  return out;
}
