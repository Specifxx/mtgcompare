import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Ago";
import { BrowseGrid } from "@/components/BrowseGrid";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbayStrip } from "@/components/EbayStrip";
import { pageHref } from "@/components/Pagination";
import { marketPage } from "@/lib/browse-data";
import { compactCard } from "@/lib/compact";
import { lastCheckedAt, marketProductCount, PAGE_SIZE } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { pageMeta, regionAlternates } from "@/lib/seo";
import { storesInMarket } from "@/lib/stores";

// Shared by /[region]/sealed (page 1) and /[region]/sealed/page/[n]. Both are CDN-cached renders of the same list: a page segment, not
// ?page=, because reading searchParams would make the route dynamic and re-query the database on every request (src/lib/db.ts,
// rule 4).
//
// A render reads ONE page of 48 rows, in SQL, in the browse order (lib/browse-data.ts marketPage), plus one COUNT for the page
// count. The whole list is no longer in the HTML: filters, sorts and ?q= work over the region's CDN-cached index
// (/api/browse/<region>), which BrowseGrid loads only once one of them is used.

/** Page N from its URL segment, or a 404 for "0", "abc" or "1" (page 1 is the bare URL). */
export function pageNumber(n: string): number {
  if (!/^[1-9]\d{0,3}$/.test(n) || n === "1") notFound();
  return Number(n);
}

const SUFFIX = " | DexCompare"; // the root layout's title template

export function browseTitle(r: RegionInfo, page: number): string {
  const suffix = page > 1 ? ` — page ${page}` : "";
  const long = `All Pokémon sealed products in ${r.inName}${suffix}`;
  return `${long}${SUFFIX}`.length <= 65 ? long : `Pokémon sealed products in ${r.inName}${suffix}`;
}

export function browseMeta(r: RegionInfo, page: number): Metadata {
  const base = `/${r.region}/sealed`;
  return pageMeta({
    title: browseTitle(r, page),
    description: `Every Pokémon TCG sealed product ${r.adjective} stores${r.market === "US" ? " and TCGplayer" : ""} list — booster boxes, ETBs, bundles, collections, tins and packs — with current stock and the lowest price in ${r.currency}.`,
    path: pageHref(base, page),
    // Page 1 is the canonical browse page in every region (with hreflang); a
    // later page is canonical to itself (pageMeta's default) and has no alternates.
    alternates: page > 1 ? undefined : regionAlternates(r.region, "/sealed"),
  });
}

export async function BrowsePage({ r, page }: { r: RegionInfo; page: number }) {
  // Past page 1, the COUNT comes first: /us/sealed/page/9999 is a 404 that costs a count, not a page read.
  const counting = marketProductCount(r.market);
  if (page > 1 && page > Math.ceil((await counting) / PAGE_SIZE)) notFound();
  const [total, cards, checked] = await Promise.all([counting, marketPage(r.market, page), lastCheckedAt(r.market)]);
  const base = `/${r.region}/sealed`;
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, page > 1 ? { href: base, label: "All sealed" } : { label: "All sealed" }, ...(page > 1 ? [{ label: `Page ${page}` }] : [])]} />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">All Pokémon sealed in {r.inName}</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {total.toLocaleString("en")} products across {storesInMarket(r.market).length} {r.adjective} stores
        {r.market === "US" && " and TCGplayer"}. Prices are in {r.currency} and exclude shipping.
      </p>
      {/* A line of its own that never wraps: <Ago> corrects the cached "3 hours ago" in the browser, and a longer or shorter phrase
          inside the paragraph above could change its line count and move the whole page. */}
      {checked && (
        <p className="mt-1.5 flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          <span className="h-2 w-2 shrink-0 rounded-full bg-open" aria-hidden="true" />
          <span>
            Prices checked <Ago iso={checked.toISOString()} initial={timeAgo(checked)} />
          </span>
        </p>
      )}
      <h2 className="sr-only">Products</h2>
      <div className="mt-6">
        {/* Page 1 only: the sealed Pokémon strip (image tiles of real listings; the compact CTA row when there are none), on a row of its
            own after the first products of the unfiltered list (BrowseGrid places it). */}
        <BrowseGrid
          rows={cards.map(compactCard)}
          total={total}
          region={r.region}
          base={base}
          page={page}
          strip={page === 1 ? <EbayStrip region={r.region} context="sealed" placement="listings-browse" search={{ kind: "sealed", query: "" }} /> : undefined}
        />
      </div>
    </div>
  );
}
