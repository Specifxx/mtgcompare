import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardQuickLink from "@/components/CardQuickLink";
import { CardTile } from "@/components/CardTile";
import { SetOwnedProvider, SetOwnedStatus, SetTickLayer } from "@/components/SetOwned";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { SealedTile } from "@/components/SealedTile";
import { cardEbayQuery, onePieceEbayQuery } from "@/lib/affiliate";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { Breadcrumbs, InShort, SectionHeader, StatTile } from "@/components/ui";
import { SET_KINDS } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCatalog, getSealedCatalog } from "@/lib/data";
import { int, longDate, money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { withArticle } from "@/lib/filter-chips";
import { median } from "@/lib/selectors";
import { pageOgOwnImage } from "@/lib/og/meta";
import { BrowseFilters } from "@/components/BrowseFilters";
import { EbayPicks } from "@/components/EbayPicks";
import { FilterChips } from "@/components/FilterChips";
import { Pagination } from "@/components/Pagination";
import { RelatedGuides } from "@/components/RelatedGuides";
import { SetGridControls } from "@/components/sets/SetGridControls";
import { SetPriceGuide } from "@/components/sets/SetPriceGuide";
import { JsonLd } from "@/components/ui";
import { browseHref, parseBrowse, runBrowse, type SearchParams } from "@/lib/browse";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { buildCollectionNarrative } from "@/lib/content/collection-narrative";
import { setPriceGuideRows } from "@/lib/set-price-guide";

type Props = { params: { slug: string }; searchParams: SearchParams };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const cat = await getCatalog();
  const s = cat.setBySlug.get(params.slug);
  if (!s) return { title: "Set not found" };
  const t = `${s.name} (${s.code}) Card List & Prices`;
  return {
    title: { absolute: t.length <= 60 ? t : `${s.code} Card List & Prices` },
    description: `Every card in One Piece ${s.name} (${s.code}) with live prices compared across stores in six markets — the full card list, the chase cards and the set's sealed product.`,
    alternates: { canonical: `/sets/${s.slug}` },
    openGraph: pageOgOwnImage(`/sets/${s.slug}`),
    // A filtered, sorted or paged grid is a slice of the same list: noindex, follow.
    ...(Object.keys(searchParams).length ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SetPage({ params, searchParams }: Props) {
  const country = getCountry();
  const c = COUNTRIES[country];
  const [cat, sealed] = await Promise.all([getCatalog(), getSealedCatalog()]);
  const set = cat.setBySlug.get(params.slug);
  if (!set) notFound();
  const cards = cat.cards.filter((x) => x.setId === set.id);
  const bq = { ...parseBrowse(searchParams), sets: [set.slug] };
  const grid = runBrowse(cat.cards, cat.sets, cat.setById, { ...bq, per: bq.per }, country);
  const page = Math.min(bq.page, grid.pages);
  const narrative = buildCollectionNarrative({
    kind: "set",
    label: `${set.name} (${set.code})`,
    currency: c.currency,
    place: c.place,
    members: cards.map((x) => ({ name: x.name, priceCents: x.low[country], setCode: set.code, rarity: x.rarity ?? undefined, collectorNumber: x.number ?? undefined })),
    siteMedianCents: median(cat.cards.map((x) => x.low[country]).filter((v): v is number => v != null)),
  });
  const guideRows = setPriceGuideRows(cards, country);
  const guides = guidesForCatalogue("sets");
  const setsByCode = Object.fromEntries(cat.sets.flatMap((x) => [[x.slug, `${x.name} (${x.code})`], [x.code.toLowerCase(), `${x.name} (${x.code})`]]));
  const priced = cards.filter((x) => x.low[country] != null);
  const med = median(priced.map((x) => x.low[country]!));
  const top = [...cards].sort(
    (a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0),
  )[0];
  const setSealed = sealed
    .filter((s) => s.setId === set.id)
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0));
  const marketTotal = cards.reduce((a, x) => a + (x.marketUsd ?? 0), 0);
  const kind = SET_KINDS[set.kind]?.label ?? "Set";
  const future =
    set.releasedOn && set.releasedOn > new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Breadcrumbs
        trail={[{ href: "/sets", name: "Sets" }, { name: set.name }]}
      />
      <p className="rb-eyebrow text-slate-500">
        {set.code} · {kind}
      </p>
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        {set.name} card list &amp; prices
      </h1>
      <div className="mt-3 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
        <p>
          {set.name} ({set.code}){" "}
          {future ? "is listed for release on" : "was released on"}{" "}
          {longDate(set.releasedOn) || "a date not yet announced"}. It has{" "}
          {int(cards.length)} printings on TCGplayer — every rarity and every
          Parallel, Manga, SP and promo version counted separately, because each
          is priced separately.
        </p>
        <p>
          Each card below shows the cheapest in-stock listing we track in{" "}
          {c.place}, in {c.currency}; “≈” marks TCGplayer&apos;s market price
          where no {c.adjective} store has the card. Open a card for every
          store&apos;s price.
        </p>
        {narrative.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <ReleaseAlertSlot setSlug={set.slug} setName={set.name} releasedOn={set.releasedOn} source="set" className="mt-6 max-w-2xl" />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Printings"
          value={int(cards.length)}
          sub={`${int(set.sealedCount)} sealed products`}
        />
        <StatTile
          label={`Priced in ${c.code}`}
          value={int(priced.length)}
          sub={
            cards.length
              ? `${Math.round((priced.length / cards.length) * 100)}% have ${withArticle(c.adjective)} listing`
              : undefined
          }
        />
        <StatTile
          label="Median price"
          value={med != null ? money(med, country) : "—"}
          sub="of cards with a listing"
        />
        <StatTile
          label="Most valuable"
          value={top?.marketUsd ? money(top.marketUsd, "US") : "—"}
          sub={
            top ? (
              <CardQuickLink slug={top.slug} className="text-brand-400 hover:underline">
                {top.name}
                {top.variant ? ` (${top.variant})` : ""}
              </CardQuickLink>
            ) : undefined
          }
        />
      </div>

      {marketTotal ? (
        <div className="mt-6">
          <InShort>
            Every printing in {set.code} together is worth about{" "}
            <span className="num font-semibold text-white">
              {money(marketTotal, "US")}
            </span>{" "}
            at TCGplayer&apos;s market prices — and{" "}
            {top?.marketUsd
              ? `${Math.round(((top.marketUsd ?? 0) / marketTotal) * 100)}%`
              : "a large share"}{" "}
            of that is its single most valuable card, {top?.name}. Value in One
            Piece sets sits in a handful of Manga, SP and Parallel arts; most of
            the list costs well under a dollar.
          </InShort>
        </div>
      ) : null}

      <div className="mt-6">
        <EbaySearchPanel
          heading={`${set.name} on eBay`}
          country={country}
          page="set"
          links={[
            ...(["booster", "extra", "premium"].includes(set.kind)
              ? [
                  {
                    label: `${set.code} booster box`,
                    query: onePieceEbayQuery(
                      `${set.name} ${set.code} booster box English`,
                    ),
                  },
                ]
              : []),
            {
              label: `${set.code} singles`,
              query: onePieceEbayQuery(`${set.code} ${set.name}`),
            },
            ...[...cards]
              .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
              .slice(0, 4)
              .map((c) => ({
                label: `${c.name}${c.variant ? ` (${c.variant.split(" · ")[0]})` : ""}`,
                query: cardEbayQuery(c),
              })),
          ]}
        />
      </div>

      {setSealed.length ? (
        <section className="mt-10">
          <SectionHeader title={`${set.code} sealed products`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {setSealed.slice(0, 6).map((s) => (
              <SealedTile
                key={s.id}
                s={s}
                country={country}
                setCode={set.code}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-10">
        <SetPriceGuide setName={set.name} rows={guideRows} country={country} adjective={c.adjective} currency={c.currency} />
      </div>

      <EbayPicks country={country} setId={set.id} className="mt-10" page="set" fallbackQuery={onePieceEbayQuery(`${set.name} ${set.code}`)} />

      <section id="cards" className="mt-10 scroll-mt-20">
        <SectionHeader
          title={`Every ${set.code} card`}
          sub={`${int(grid.total)} printings · page ${page} of ${grid.pages}`}
          action={
            <Link href={`/sets/${set.slug}/gallery`} className="btn-ghost">
              Open the gallery →
            </Link>
          }
        />
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <input type="checkbox" id="set-filters-toggle" className="peer sr-only" />
            <label htmlFor="set-filters-toggle" className="btn-ghost w-full cursor-pointer lg:hidden">
              Filters
            </label>
            <div className="mt-3 hidden peer-checked:block lg:mt-0 lg:block">
              <BrowseFilters q={bq} sets={cat.sets} country={country} action={`/sets/${set.slug}`} hide={["set"]} />
            </div>
          </aside>
          <div className="min-w-0">
            <FilterChips basePath={`/sets/${set.slug}`} sets={setsByCode} symbol={c.symbol} adjective={c.adjective} />
            <SetGridControls basePath={`/sets/${set.slug}`} sort={bq.sort} per={bq.per} />
            {/* The owned overlay (collection-alerts, wave 2): a client island that
                learns the visitor from /api/me; the page reads no session. */}
            <SetOwnedProvider setSlug={set.slug} enabled={!future}>
              <SetOwnedStatus setName={set.name} trackerHref={`/portfolio/sets/${set.slug}`} freeLimit={FREE_PORTFOLIO_LIMIT} />
              <div data-tick-grid className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {grid.items.map((card) => (
                  <CardTile key={card.id} card={card} setCode={set.code} country={country} />
                ))}
              </div>
              <SetTickLayer tileIds={grid.items.map((c) => c.id)} rowIds={[]} scanKey={`${bq.sort}:${page}:${grid.items[0]?.id ?? 0}:${grid.items.length}`} />
            </SetOwnedProvider>
            {grid.total === 0 ? <p className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-6 text-center text-sm text-slate-400">No cards match those filters.</p> : null}
            <Pagination page={page} totalPages={grid.pages} params={searchParams} basePath={`/sets/${set.slug}`} />
          </div>
        </div>
      </section>
      <RelatedGuides guides={guides} className="card-surface mt-10 p-5" />
    </div>
  );
}
