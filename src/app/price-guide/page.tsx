import { EbayChase } from "@/components/EbayChase";
import { AdSlot } from "@/components/AdSlot";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { Pagination } from "@/components/Pagination";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { BrowseFilters } from "@/components/BrowseFilters";
import { FilterChips } from "@/components/FilterChips";
import { HubFaq } from "@/components/HubFaq";
import { RelatedGuides } from "@/components/RelatedGuides";
import { GuideBusy } from "@/components/price-guide/GuideBusy";
import { PriceGuideToolbar } from "@/components/price-guide/PriceGuideToolbar";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { Breadcrumbs, Delta, JsonLd, StatTile } from "@/components/ui";
import { finishLabel, rarityLabel } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCardPage, getCatalogStats, getMarketOverview, getSetValueStats, getSets } from "@/lib/data";
import { int, money, usd } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { imageFor } from "@/lib/images";
import { headline } from "@/lib/price";
import { releasedSets } from "@/lib/selectors";
import { breadcrumbLd, faqLd, itemListLd } from "@/lib/jsonld";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { PRICE_GUIDE_FAQ } from "@/lib/content/price-guide-faq";
import { GUIDE_DEFAULT_SIZE, GUIDE_DEFAULT_SORT, guideCardQuery, guideHref, guideRobots, isGuideDefault, parseGuide, show30d } from "@/lib/price-guide-query";
import type { SearchParams, SortKey } from "@/lib/browse";
import { SITE_URL } from "@/lib/site";
import { pageOgOwnImage } from "@/lib/og/meta";
import { GuideBuyLinks } from "./GuideBuyLinks";
import { DATA_TABLE } from "@/components/prose";

// Reads the browse engine and the published market views: rendered per request, cached at the CDN (contract 7.5).
export const dynamic = "force-dynamic";

const TITLE = "Magic: The Gathering Price Guide — Every Card's Price in One Table";
const DESCRIPTION =
  "Every Magic: The Gathering printing in one sortable table with the cheapest in-stock price in your market, how many stores have it, and its 7-day move.";

// The plain guide (and a single set's) is indexable; any filter, search, sort,
// size, market override or page after the first is noindex,follow with the
// canonical on /price-guide. A page title carries its page number.
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const q = parseGuide(searchParams);
  return {
    title: q.page > 1 ? `${TITLE} (page ${q.page})` : TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/price-guide" },
    openGraph: pageOgOwnImage("/price-guide"),
    robots: guideRobots(q),
  };
}

export default async function PriceGuidePage({ searchParams }: { searchParams: SearchParams }) {
  const own = getCountry();
  const gq = parseGuide(searchParams);
  const country = gq.market ?? own;
  const c = COUNTRIES[country];
  const [sets, catalog, overview, valueBySet] = await Promise.all([getSets(), getCatalogStats(), getMarketOverview(), getSetValueStats()]);
  const result = await getCardPage(guideCardQuery(gq, sets, country));
  const { items: slice, pages, page } = result;
  const thirty = show30d(slice, country);
  const setKey = gq.browse.sets.length === 1 ? gq.browse.sets[0]!.toLowerCase() : null;
  const set = setKey ? sets.find((x) => x.slug === setKey || x.code.toLowerCase() === setKey || x.tok.toLowerCase() === setKey) : undefined;
  const priced = catalog.pricedByMarket[country] ?? 0;
  const dearest = overview.constituents[0];
  // The latest released sets: how many of each price today and which card leads (one in-memory query a set).
  const released = releasedSets(sets).slice(0, 12);
  const byRow = await Promise.all(released.map(async (s) => { const r = await getCardPage({ setIds: [s.id], sort: "value", minCents: 1, page: 1, per: 24 }); return { set: s, priced: r.total, top: r.items[0] ?? null, value: valueBySet.get(s.id) ?? null }; }));
  const faqs = PRICE_GUIDE_FAQ;
  const filtered = !isGuideDefault({ ...gq, sort: GUIDE_DEFAULT_SORT, size: GUIDE_DEFAULT_SIZE, market: null, page: 1 });
  const hrefSet = (slug: string) => guideHref(searchParams, { set: slug });
  const sortHref = (asc: string, desc: string) => guideHref(searchParams, { sort: gq.sort === desc ? asc : desc });
  const guides = guidesForCatalogue("price-guide");
  const setsByCode = Object.fromEntries(sets.flatMap((x) => [[x.slug, `${x.name} (${x.code})`], [x.code.toLowerCase(), `${x.name} (${x.code})`]]));

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: TITLE,
          url: `${SITE_URL}/price-guide`,
          mainEntity: itemListLd("Magic card prices", "/price-guide", slice.slice(0, 50).map((x) => ({ name: `${x.name}${x.variant ? ` (${x.variant})` : ""} ${x.setCode} ${x.number ?? ""}`.trim(), path: `/card/${x.slug}` }))),
        }}
      />
      <JsonLd data={faqLd(faqs)} />
      <Breadcrumbs trail={[{ name: "Price guide" }]} />
      <h1 className="font-display text-2xl font-extrabold text-white">Magic: The Gathering Price Guide</h1>
      <HubIntro path="/price-guide" />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Cards listed"
          value={int(catalog.cards)}
          sub="Every printing has its own row"
        />
        <StatTile
          label={`Priced in ${c.label}`}
          value={int(priced)}
          sub={country === "US" ? `${Math.round((priced / Math.max(1, catalog.cards)) * 100)}% have a TCGplayer price` : "cards with a store listing there"}
        />
        <StatTile
          label="Median card"
          value={overview.basket.median ? usd(overview.basket.median) : "—"}
          sub={`Among the ${int(overview.basket.n)} cards worth US$1 or more`}
        />
        <StatTile
          label="Dearest card"
          value={dearest ? usd(dearest.cents) : "—"}
          sub={
            dearest ? (
              <CardQuickLink slug={dearest.slug} className="text-brand-400 hover:underline">
                {dearest.name}
              </CardQuickLink>
            ) : undefined
          }
        />
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="border-b border-ink-800 px-5 py-4">
          <h2 className="text-xl text-white">Prices by set</h2>
          <p className="text-sm text-slate-400">
            How the latest released sets price today: the cards with a market price, the value of the ones worth US$1 or more, and the card that leads each.
            A set&apos;s name opens its own price guide.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[640px]`}>
            <thead>
              <tr>
                <th>Set</th>
                <th className="text-right">Priced</th>
                <th className="text-right">Value over US$1</th>
                <th>Dearest card</th>
              </tr>
            </thead>
            <tbody>
              {byRow.map(({ set: s, priced: n, top, value }) => (
                <tr key={s.id}>
                  <td>
                    <Link href={hrefSet(s.slug)} className="font-semibold text-brand-400 hover:underline">
                      {s.name}
                    </Link>{" "}
                    <span className="text-xs text-slate-500">{s.code}</span>
                  </td>
                  <td className="num text-right text-slate-300">
                    {n}/{s.cardCount}
                  </td>
                  <td className="num text-right font-semibold text-accent">{value ? usd(value.totalCents) : "—"}</td>
                  <td className="truncate text-slate-200">
                    {top ? (
                      <CardQuickLink slug={top.slug} className="hover:text-brand-400 hover:underline">
                        {top.name}
                        {top.variant ? ` (${top.variant})` : ""}{" "}
                        <span className="num text-xs text-slate-400">{top.marketUsd != null ? usd(top.marketUsd) : "—"}</span>
                      </CardQuickLink>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PriceGuideToolbar sort={gq.sort} size={gq.size} q={gq.browse.q} shownMarket={country} ownMarket={own} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <input type="checkbox" id="guide-filters-toggle" className="peer sr-only" />
          <label htmlFor="guide-filters-toggle" className="btn-ghost w-full cursor-pointer lg:hidden">
            Filters
          </label>
          <div className="mt-3 hidden peer-checked:block lg:mt-0 lg:block">
            <BrowseFilters q={{ ...gq.browse, sort: gq.sort as SortKey, per: gq.size }} sets={sets} country={country} action="/price-guide" />
          </div>
        </aside>
        <div className="min-w-0">
          <FilterChips basePath="/price-guide" sets={setsByCode} symbol="US$" adjective={c.adjective} />
          <GuideBusy>
      <section className="card-surface mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-xl text-white">{set ? `${set.name} (${set.code}) prices` : filtered ? "Matching cards" : "Every card"}</h2>
            <p className="text-sm text-slate-400">
              {int(result.total)} printings · page {page} of {pages}
              {filtered ? (
                <>
                  {" · "}
                  <Link href="/price-guide" className="text-brand-400 hover:underline">
                    Clear filters
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
        {/* One table at every width, never a horizontal scroll: fixed layout,
            so the Card column takes what is left and truncates. Phones show
            Card · Price (7-day under it) · Buy; the rest join as room allows.
            A plain click on a card opens its QuickView. */}
        <div>
          <table className={`${DATA_TABLE} table-fixed`}>
            <thead>
              <tr>
                <th>Card</th>
                <th className="hidden w-32 md:table-cell">Set · No.</th>
                <th className="hidden w-28 xl:table-cell">Rarity</th>
                <SortTh href={sortHref("price-asc", "price-desc")} active={gq.sort === "price-desc" ? "desc" : gq.sort === "price-asc" ? "asc" : null} className="w-[5.5rem] text-right sm:w-28">Price ({c.currency})</SortTh>
                <th className="hidden w-16 text-right sm:table-cell">Stores</th>
                <SortTh href={sortHref("falling", "rising")} active={gq.sort === "rising" ? "desc" : gq.sort === "falling" ? "asc" : null} className="hidden w-20 text-right sm:table-cell">7 days</SortTh>
                {thirty ? <th className="hidden w-20 text-right lg:table-cell">30 days</th> : null}
                <th className="w-[6.5rem] text-right sm:w-40 xl:w-60">Buy</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((x) => {
                const h = headline(x, country);
                return (
                  <tr key={x.id}>
                    <td>
                      <CardQuickLink
                        slug={x.slug}
                        className="group flex min-w-0 items-center gap-3"
                      >
                        {x.hasImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageFor(x, "thumb") ?? ""}
                            alt=""
                            loading="lazy"
                            className="h-10 w-7 shrink-0 rounded-sm bg-ink-800 object-cover"
                          />
                        ) : (
                          <span className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
                        )}
                        <span className="min-w-0">
                          <span
                            data-card-name
                            className="block truncate font-semibold text-slate-100 group-hover:text-brand-400 group-hover:underline"
                          >
                            {x.name}
                          </span>
                          {x.variant || x.headFinish === "F" ? (
                            <span className="block truncate text-xs text-slate-500">
                              {[x.variant, x.headFinish === "F" ? finishLabel(x, "F") : null].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                          <span className="num block truncate text-[11px] text-slate-500 md:hidden">
                            {x.setCode} · {x.number ?? "—"}
                          </span>
                        </span>
                      </CardQuickLink>
                    </td>
                    <td className="num hidden whitespace-nowrap text-xs text-slate-400 md:table-cell">
                      {x.setCode} · {x.number ?? "—"}
                    </td>
                    <td className="hidden text-xs text-slate-300 xl:table-cell">
                      {rarityLabel(x.rarity)}
                    </td>
                    <td className="num whitespace-nowrap text-right font-semibold text-accent">
                      {h.kind === "listing" ? (
                        money(h.cents, country)
                      ) : h.kind === "reference" ? (
                        <span className="text-slate-400">
                          ≈ {money(h.cents, country)}
                        </span>
                      ) : (
                        "—"
                      )}
                      {x.change7d != null ? (
                        <span className="block sm:hidden">
                          <Delta v={x.change7d} className="text-[11px]" />
                        </span>
                      ) : null}
                    </td>
                    <td className="num hidden text-right text-slate-300 sm:table-cell">
                      {x.stores[country] || ""}
                    </td>
                    <td className="hidden text-right sm:table-cell">
                      <Delta v={x.change7d} className="text-xs" />
                    </td>
                    {thirty ? (
                      <td className="hidden text-right lg:table-cell">
                        <Delta v={x.change30d} className="text-xs" />
                      </td>
                    ) : null}
                    <td className="px-2 text-right">
                      <GuideBuyLinks
                        id={x.id}
                        slug={x.slug}
                        name={x.name}
                        number={x.number}
                        variant={x.variant}
                        tcg={x.marketUsd != null ? usd(x.marketUsd) : null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-800 px-5 py-3 text-xs leading-relaxed text-slate-500">
          Buy: <span className="text-slate-400">TCGplayer</span> opens the
          card&apos;s TCGplayer page (the figure is its US market price, in US
          dollars); <span className="text-slate-400">eBay</span> searches your
          own eBay for the card. Affiliate links: as an eBay Partner Network
          affiliate and a TCGplayer affiliate, MTG Compare earns from qualifying
          purchases — at no extra cost to you.
        </p>
      </section>
          </GuideBusy>
          <Pagination page={page} totalPages={pages} params={searchParams} basePath="/price-guide" />
        </div>
      </div>

      <RelatedGuides guides={guides} />

      <section className="mt-8 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400" aria-labelledby="pg-how">
        <h2 id="pg-how" className="text-lg font-bold text-white">
          How to read this price guide
        </h2>
        <p>
          Each row is one printing, shown at its non-foil price unless it only exists in foil (marked), and that price is the lowest asking price we found on an in-stock listing in{" "}
          {c.place}, in {c.currency}: the item alone, with postage on top at the seller&apos;s checkout. Open a card to see
          every store behind that figure, cheapest first, and the delivered total wherever a store publishes its
          postage.
        </p>
        <p>
          The list opens dearest first, ranked on TCGplayer&apos;s market price so that one stray listing can never lead it, and
          starts at US$0.50: set a lower minimum to see every printing. Sort a column header for the cheapest cards or the biggest
          weekly moves, and use the filters to cut it down to one set, rarity, color, card type, treatment, format or foil prices.{filtered ? null : <> Each set&apos;s own table lives on its <Link href="/sets" className="text-brand-400 hover:underline">set page</Link>.</>}
        </p>
      </section>

      <HubFaq faqs={faqs} />

      <EbayChase page="price-guide" className="mt-8" />
      <AdSlot slot="price-guide" className="mt-8" noindex={!isGuideDefault(gq)} />
      <InlineSignupPrompt className="mt-8" surface="price-guide" title="Track the cards you want, free" body="Heart cards to keep them on your watchlist, and a free account adds Deal Finder's three biggest savings in your market right now." />
    </div>
  );
}

function SortTh({ href, active, className, children }: { href: string; active: "asc" | "desc" | null; className?: string; children: React.ReactNode }) {
  return (
    <th className={className} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
      <Link href={href} scroll={false} className="inline-flex items-center gap-1 hover:text-white">
        {children}
        <span aria-hidden className={active ? "text-brand-400" : "text-slate-600"}>{active === "asc" ? "↑" : active === "desc" ? "↓" : "↕"}</span>
      </Link>
    </th>
  );
}
