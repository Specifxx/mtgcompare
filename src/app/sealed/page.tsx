import { EbayChase } from "@/components/EbayChase";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { DiscoveryTip } from "@/components/DiscoveryTip";
import { SealedFilters } from "@/components/SealedFilters";
import { SealedSort } from "@/components/SealedSort";
import { SealedTile } from "@/components/SealedTile";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { SEALED_KINDS } from "@/lib/constants";
import { ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import { itemListLd } from "@/lib/jsonld";
import { filterSealed, isSealedFiltered, parseSealedQuery, sortSealed, type SealedCtx } from "@/lib/sealed-query";
import { COUNTRIES } from "@/lib/country";
import { getSealedAll, getSealedSoldOut, getSets } from "@/lib/data";
import { int } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { newestBoosterSet } from "@/lib/selectors";
import { pageOg } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/site";

const TITLE = "Magic: The Gathering Sealed Products — Booster Box & Bundle Prices";
const DESCRIPTION =
  "Magic: The Gathering Play Booster, Collector Booster and Draft Booster boxes, cases, bundles, Commander decks and prerelease packs, priced across the stores we track in six markets.";

// A filtered /sealed is a thin slice of the same list: noindex, follow, with the
// canonical on the unfiltered page (sort and layout alone do not count).
export function generateMetadata({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }): Metadata {
  const filtered = isSealedFiltered(parseSealedQuery(searchParams));
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/sealed" },
    openGraph: pageOg("/sealed"),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SealedPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const country = getCountry();
  const c = COUNTRIES[country];
  const [allSets, sealed, soldOutIds] = await Promise.all([getSets(), getSealedAll(), getSealedSoldOut().catch(() => null)]);
  const setById = new Map(allSets.map((x) => [x.id, x] as const));
  const query = parseSealedQuery(searchParams);
  const filtered = isSealedFiltered(query);
  const ctx: SealedCtx = {
    country,
    setSlugOf: (id) => (id != null ? setById.get(id)?.slug : undefined),
    setReleased: (id) => (id != null ? setById.get(id)?.releasedOn ?? undefined : undefined),
  };
  const rows = sortSealed(filterSealed(sealed, query, ctx), query.sort, ctx);
  const soldOut = new Set(soldOutIds?.[country] ?? []);
  const newest = newestBoosterSet(allSets);
  const sets = allSets
    .filter((s) => s.sealedCount > 0)
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""))
    .map((s) => ({ slug: s.slug, code: s.code, name: s.name }));
  const types = SEALED_KINDS.filter((k) => sealed.some((s) => s.kind === k));
  const shown = rows.slice(0, 120);
  const families = [
    { label: "Play Booster boxes", q: "Magic The Gathering Play Booster box sealed" },
    { label: "Collector Booster boxes", q: "Magic The Gathering Collector Booster box sealed" },
    { label: "Commander decks", q: "Magic The Gathering Commander deck sealed" },
    { label: "Bundles", q: "Magic The Gathering bundle sealed" },
  ];

  return (
    <div>
      {shown.length && !filtered ? (
        <JsonLd
          data={{
            ...itemListLd("Magic: The Gathering sealed products", "/sealed", shown.slice(0, 24).map((s) => ({ name: s.name, path: `/sealed/${s.slug}` }))),
            itemListElement: shown.slice(0, 24).map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Product",
                name: s.name,
                url: `${SITE_URL}/sealed/${s.slug}`,
                ...(s.low[country] != null
                  ? { offers: { "@type": "AggregateOffer", priceCurrency: c.currency, lowPrice: (s.low[country]! / 100).toFixed(2), offerCount: Math.max(1, s.stores[country]), availability: "https://schema.org/InStock" } }
                  : {}),
              },
            })),
          }}
        />
      ) : null}
      <Breadcrumbs trail={[{ name: "Sealed" }]} />
      <div className="card-surface border-brand-500/40 p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold text-white">Sealed Products</h1>
        <HubIntro path="/sealed" />
      </div>

      <DiscoveryTip id="sealed-watch" surface="tip:sealed" tier="plus" className="mt-4">
        Plus can watch a booster box and tell you when it restocks or drops to the price you set.
      </DiscoveryTip>

      {newest ? (
        <div className="card-surface mt-4 flex flex-wrap items-center gap-3 border-brand-500/40 p-4">
          <span className="rounded bg-brand-500/15 px-2 py-0.5 text-xs font-bold text-brand-400">Newest set</span>
          <p className="flex-1 text-[15px] text-slate-200">
            <span className="font-semibold text-white">{newest.name} sealed</span> — product from the newest released set, priced across stores.
          </p>
          <Link href={`/sealed?set=${newest.slug}`} className="btn-primary min-h-10">
            Shop {newest.code} →
          </Link>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-6 xl:flex-row">
        <SealedFilters types={types} sets={sets} currency={c.currency} />
        <div id="results" className="min-w-0 flex-1 scroll-mt-20">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              <span className="num font-semibold text-white">{int(rows.length)}</span> products
            </p>
            <SealedSort />
          </div>
          {rows.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((s) => (
                <SealedTile key={s.id} s={s} country={country} setCode={s.setId ? setById.get(s.setId)?.code : null} soldOut={soldOut.has(s.id)} />
              ))}
            </div>
          ) : (
            <EmptyState icon="browse" title="No sealed products match" body="Try another set or product type." primary={{ href: "/sealed", label: "Clear filters" }} />
          )}
          {rows.length > 120 ? <p className="mt-4 text-sm text-slate-400">Showing 120 of {rows.length}. Narrow by set or type to see the rest.</p> : null}
        </div>
      </div>

      {/* Marketplace searches: sealed boxes are the biggest baskets on the site,
          and eBay carries them. A search, never a price or a stock claim. */}
      <section className="card-surface mt-8 p-5">
        <h2 className="text-lg font-extrabold text-white">More sealed deals on the big marketplaces</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">Boxes sell out and restock constantly, so it can be worth searching eBay as well before you buy.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {families.map((x) => (
            <div key={x.q} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5">
              <span className="text-sm font-semibold text-white">{x.label}</span>
              <a href={ebaySearchUrl(country, x.q, "sealed-page")} target="_blank" rel={outboundRel()} data-retailer="ebay_sealed_search" data-page="sealed" data-surface="ebay_family" className="btn-ebay-ghost px-2.5 py-1 text-xs">
                eBay →
              </a>
            </div>
          ))}
        </div>
        <AffiliateDisclosure partner="ebay" />
        <EbayChase page="sealed" className="mt-6" heading="Chase singles on eBay" />
      </section>
    </div>
  );
}
