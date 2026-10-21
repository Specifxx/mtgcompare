import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { ProductGrid } from "@/components/ProductGrid";
import { Empty, Section } from "@/components/Section";
import { lastCheckedAt, marketsWithType } from "@/lib/data";
import { gridPageHasRoomForFooter } from "@/lib/ebay-ads";
import { money, plural, timeAgo } from "@/lib/format";
import { dealsAnchor, shortDate, titleText, typeDescription, typeMsrpFact, typeName, typePacksFact, typePerPackRows, typeTitle } from "@/lib/hub-copy";
import { typePageData } from "@/lib/hub-data";
import { regionOfMarket, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { PRODUCT_TYPES, TYPE_BY_SLUG } from "@/lib/sealed-title";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";
import { TYPE_ABOUT } from "@/lib/type-about";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

// At most 72 product rows (the 48 cheapest open, the 24 most-listed sold out) and one count: US Collections alone have ~530 open
// products, and the page used to render every one (2.6 MB of HTML). The rest is one tap away on the browse page's filtered view.
const getData = cache((market: Market, typeLabel: string) => typePageData(market, typeLabel));

// The strip above the footer only where two strips stay under a quarter of the page on a desktop (the §C4 density ceiling).
const FOOTER_STRIP_MIN = 12;

export async function generateMetadata({ params }: { params: { region: string; type: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const t = TYPE_BY_SLUG.get(params.type);
  if (!t) return {};
  const d = await getData(r.market, t.label);
  const total = d.openCount + d.soldCount;
  const from = d.open[0]?.lowestPriceCents ?? null;
  // Empty here: noindex, and no hreflang set. Otherwise advertise only the
  // regions that list the type (their copies are the indexable ones).
  const regions = total ? (await marketsWithType(t.label)).map(regionOfMarket).filter((x): x is RegionInfo => !!x) : [];
  const title = typeTitle(t, r, d.openCount, from);
  return {
    ...pageMeta({
      title: titleText(title),
      description: typeDescription(t, r, { open: d.openCount, total }, from),
      path: `/${r.region}/type/${t.slug}`,
      alternates: total ? regionAlternates(r.region, `/type/${t.slug}`, regions) : undefined,
      noindex: total === 0,
    }),
    title,
  };
}

export default async function TypePage({ params }: { params: { region: string; type: string } }) {
  const r = regionOrNotFound(params.region);
  const t = TYPE_BY_SLUG.get(params.type);
  if (!t) notFound();
  const [{ open, sold, openCount, soldCount, tcgOnly: noStore }, checked] = await Promise.all([getData(r.market, t.label), lastCheckedAt(r.market)]);
  const total = openCount + soldCount;
  // Store counts never include TCGplayer: in the US it is named separately.
  // Outside the US nothing is TCGplayer-only: listedStores is 0 there only when
  // no store but a dormant one lists the product (importer.ts, dormantStores).
  const tcgOnly = r.market === "US" ? noStore : 0;
  const byStores = total - tcgOnly;
  const name = typeName(t);
  const from = open[0]?.lowestPriceCents ?? null;
  const path = `/${r.region}/type/${t.slug}`;
  const seeAll = `/${r.region}/sealed?type=${t.slug}&stock=in`;
  const more = openCount > open.length;
  const perPack = typePerPackRows(t.label, open);
  const packs = typePacksFact(t.key);
  const msrp = typeMsrpFact(t.key, r.market);
  // The other types; the three case types only from a case page (they are niche, and the row is long enough without them).
  const isCase = (x: { slug: string }) => x.slug.endsWith("-cases");
  const siblings = PRODUCT_TYPES.filter((x) => x.slug !== t.slug && (!isCase(x) || isCase(t)));
  // The type's own listings (cascade: generic sealed Pokémon) as an image strip; with none to list, the compact CTA row. It sits on a row of
  // its own after the first products (ProductGrid `strip`), so the products come first.
  const strip = (
    <EbayStrip
      region={r.region}
      context={`type:${t.slug}`}
      placement="listings-type"
      headings={{ type: `${name} on eBay`, sealed: "Sealed Pokémon on eBay" }}
      search={{ kind: "sealed", query: t.label, label: `Search ${name} on eBay` }}
    />
  );
  const ld = itemListJsonLd({
    name: `${name} in ${r.inName}`,
    path,
    items: [...open, ...sold].map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name })),
  });
  return (
    <div className="page py-8">
      {!(gridPageHasRoomForFooter(open.length + sold.length) && open.length + sold.length >= FOOTER_STRIP_MIN) && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: t.plural }]} />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {name} in {r.inName}
      </h1>

      {/* The intro, two lines; "More about" opens the rest of it (the clamp lifts while the details are open) and the facts below. */}
      <div className="mt-3 max-w-3xl [&:has(details[open])>p]:line-clamp-none">
        <p className="line-clamp-2 leading-7 text-muted">{TYPE_ABOUT[t.slug]}</p>
        <details className="group mt-1">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-strong hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">More about {t.plural}</span>
            <span className="hidden group-open:inline">Less about {t.plural}</span>
            <Icon name="arrow-right" size={16} className="rotate-90 transition-transform group-open:-rotate-90" />
          </summary>
          <dl className="mt-2 grid gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted">Booster packs inside</dt>
            <dd className="font-semibold">{packs ?? "Varies by product"}</dd>
            {msrp && (
              <>
                <dt className="text-muted">US MSRP</dt>
                <dd className="font-semibold">
                  {msrp}
                  <span className="block text-xs font-normal text-muted">{RRP_NOTE}</span>
                </dd>
              </>
            )}
            <dt className="text-muted">Listed in {r.inName}</dt>
            <dd className="font-semibold">
              {plural(total, "product")}, {openCount} in stock today
            </dd>
          </dl>
        </details>
      </div>

      <p className="mt-2 text-sm text-muted">
        <b className="text-ink">{openCount}</b> in stock
        {from != null && <> from {money(from, r.market)}</>} · {byStores} listed by {r.adjective} stores
        {tcgOnly > 0 && <>, {tcgOnly} more only on TCGplayer</>}
        {checked && (
          <>
            {" "}
            · prices checked <Ago iso={checked.toISOString()} initial={timeAgo(checked)} />
          </>
        )}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-5">
        {more && (
          <li>
            <Link href={seeAll} prefetch={false} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
              See all {openCount} in stock <Icon name="arrow-right" size={16} />
            </Link>
          </li>
        )}
        <li>
          <Link href={`/${r.region}/deals#${dealsAnchor(t.slug)}`} prefetch={false} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
            See deals on {t.plural} today <Icon name="arrow-right" size={16} />
          </Link>
        </li>
      </ul>

      <nav aria-label="Other product types" className="mt-3">
        {/* One row that scrolls sideways at every width: a wrapping row changes its line count when the web font arrives. */}
        <ul className="scroller -mx-4 gap-2 px-4 scroll-px-4 sm:mx-0 sm:px-0">
          {siblings.map((x) => (
            <li key={x.slug}>
              <Link href={`/${r.region}/type/${x.slug}`} prefetch={false} className="chip min-h-10 whitespace-nowrap">
                {x.plural}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="in-stock" title="In stock now" kicker={more ? `Cheapest first · ${open.length} of ${openCount}` : "Cheapest first"}>
        {open.length ? (
          <>
            <ProductGrid products={open} region={r.region} eager={4} tiles="type" strip={strip} />
            {more && (
              <div className="mt-6 flex justify-center">
                <Link href={seeAll} prefetch={false} className="btn-ghost min-h-11 px-6">
                  See all {openCount} in stock <Icon name="arrow-right" size={18} />
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <Empty actions={[{ href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" }]}>Nothing of this type is in stock in {r.inName} right now.</Empty>
            <div className="mt-4">{strip}</div>
          </>
        )}
      </Section>

      {perPack.length >= 2 && (
        <Section id="per-pack" title="Cheapest per pack" kicker={more ? `Among the ${open.length} cheapest in stock` : "In stock now"}>
          <div className="card max-w-3xl overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">
                {name}: the lowest price per booster pack in {r.inName} today
              </caption>
              <thead className="border-b border-line bg-raised text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Product
                  </th>
                  <th scope="col" className="w-24 px-3 py-2.5 text-right sm:w-32">
                    Per pack
                  </th>
                  <th scope="col" className="w-24 px-4 py-2.5 text-right sm:w-36">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {perPack.map(({ p, packs: n, perPack: each }) => (
                  <tr key={p.slug} className="hover:bg-raised">
                    <td className="px-4 py-3">
                      {/* One product per set for a set type (a booster box, an ETB): the set names it. Otherwise the product's own name. */}
                      <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="-my-1 flex min-h-11 items-center font-semibold hover:text-brand">
                        <span className="line-clamp-2">{t.kind === "set" && setOf(p.setCode) ? setOf(p.setCode)!.name : p.name}</span>
                      </Link>
                      <span className="block text-xs text-muted">
                        {t.kind === "set" && setOf(p.setCode) ? `${setOf(p.setCode)!.series} · ${shortDate(setOf(p.setCode)!.releaseDate)}` : (setOf(p.setCode)?.name ?? "")}
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 text-right font-display text-base font-extrabold">{money(each, r.market)}</td>
                    <td className="tabular px-4 py-3 text-right">
                      {money(p.lowestPriceCents, r.market)}
                      <span className="block text-xs text-muted">{plural(n, "pack")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Listed price divided by the booster packs inside; promos, sleeves and dice are not priced in, and shipping is excluded.</p>
        </Section>
      )}

      {sold.length > 0 && (
        <Section title="Sold out everywhere" kicker={`Listed, but no store${r.market === "US" ? " or TCGplayer seller" : ""} has them right now`}>
          <ProductGrid products={sold} region={r.region} />
          {soldCount > sold.length && (
            <p className="mt-4 text-sm text-muted">
              The {sold.length} listed by the most stores, of {soldCount} sold out.
            </p>
          )}
        </Section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}

function setOf(code: string | null) {
  return code ? SET_BY_CODE.get(code) ?? null : null;
}
