import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardQuickLink from "@/components/CardQuickLink";
import { CardTile } from "@/components/CardTile";
import { SetOwnedProvider, SetOwnedStatus, SetTickLayer } from "@/components/SetOwned";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { SealedTile } from "@/components/SealedTile";
import { cardEbayQuery, magicEbayQuery } from "@/lib/affiliate";
import { ReleaseAlertSlot } from "@/components/ReleaseAlertSlot";
import { Breadcrumbs, InShort, SectionHeader, StatTile } from "@/components/ui";
import { PRIMARY_TYPES, SET_KINDS, TREATMENT_BY_KEY, colorMask, isRarity, type Rarity } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { getCardPage, getSealedBySet, getSetBySlug, getSetChecklist, getSetHighlights, getSets, getSetValueStats, type CardQuery } from "@/lib/data";
import { toUsdCents } from "@/lib/fx";
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
import { parseBrowse, type BrowseQuery, type SearchParams } from "@/lib/browse";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { buildCollectionNarrative } from "@/lib/content/collection-narrative";
import { checklistGuideRows } from "@/lib/set-price-guide";

// Every route that reaches the published data is dynamic: a build reads no data host (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: SearchParams };

/** The page's filters as a loader query: this set, the visitor's market currency turned back into the US cents the index prices in. */
function setQuery(bq: BrowseQuery, setId: number, currency: string, country: ReturnType<typeof getCountry>): Partial<CardQuery> {
  const types = bq.types.map((t) => t.toLowerCase()).filter((t) => (PRIMARY_TYPES as readonly string[]).includes(t));
  return {
    q: bq.q || undefined,
    setIds: [setId],
    rarities: bq.rarities.filter(isRarity) as Rarity[],
    types,
    treats: bq.printings.filter((k) => TREATMENT_BY_KEY[k]),
    colors: bq.colors.length ? { mask: colorMask(bq.colors), mode: "any" } : undefined,
    minCents: bq.min != null ? toUsdCents(bq.min, currency) : null,
    maxCents: bq.max != null ? toUsdCents(bq.max, currency) : null,
    pricedIn: bq.priced ? country : undefined,
    includeUnlisted: false,
    sort: bq.sort,
    page: bq.page,
    per: bq.per as 24 | 48 | 100,
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const s = await getSetBySlug(params.slug);
  if (!s) return { title: "Set not found" };
  const t = `${s.name} (${s.code}) Card List & Prices`;
  return {
    title: { absolute: t.length <= 60 ? t : `${s.code} Card List & Prices` },
    description: `Every card in Magic: The Gathering ${s.name} (${s.code}) with live prices compared across stores in six markets: the full card list, Normal and Foil prices, the chase cards and the set's sealed product.`,
    alternates: { canonical: `/sets/${s.slug}` },
    openGraph: pageOgOwnImage(`/sets/${s.slug}`),
    // A filtered, sorted or paged grid is a slice of the same list: noindex, follow.
    ...(Object.keys(searchParams).length ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SetPage({ params, searchParams }: Props) {
  const country = getCountry();
  const c = COUNTRIES[country];
  const set = await getSetBySlug(params.slug);
  if (!set) notFound();
  const bq = { ...parseBrowse(searchParams), sets: [set.slug] };
  // The checklist is EVERY listed printing of the set (THIN rows included), already priced in the visitor's market.
  const [sets, grid, checklist, highlights, setSealed, valueStats] = await Promise.all([
    getSets(),
    getCardPage(setQuery(bq, set.id, c.currency, country)),
    getSetChecklist(set.id, country),
    getSetHighlights(set.id, 1),
    getSealedBySet(set.id),
    getSetValueStats(),
  ]);
  const page = Math.min(bq.page, grid.pages);
  const narrative = buildCollectionNarrative({
    kind: "set",
    label: `${set.name} (${set.code})`,
    currency: c.currency,
    place: c.place,
    members: checklist.map((x) => ({ name: x.name, priceCents: x.minCents, setCode: set.code, rarity: x.rarity ?? undefined, collectorNumber: x.number ?? undefined })),
  });
  const guideRows = checklistGuideRows(checklist);
  const guides = guidesForCatalogue("sets");
  const setsByCode = Object.fromEntries(sets.flatMap((x) => [[x.slug, `${x.name} (${x.code})`], [x.code.toLowerCase(), `${x.name} (${x.code})`]]));
  const priced = checklist.filter((x) => x.minCents != null);
  const med = median(priced.map((x) => x.minCents!));
  const top = highlights[0];
  const marketTotal = valueStats.get(set.id)?.totalCents ?? 0;
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
          {int(checklist.length)} printings on TCGplayer: every rarity and every
          Borderless, Extended Art, Showcase or foil-pattern version counted
          separately, because each is priced separately, and each has a Normal and
          a Foil price of its own.
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
          value={int(checklist.length)}
          sub={`${int(set.sealedCount)} sealed products`}
        />
        <StatTile
          label={`Priced in ${c.code}`}
          value={int(priced.length)}
          sub={
            checklist.length
              ? `${Math.round((priced.length / checklist.length) * 100)}% have ${withArticle(c.adjective)} listing`
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
                {top.label ? ` (${top.label})` : ""}
              </CardQuickLink>
            ) : undefined
          }
        />
      </div>

      {marketTotal ? (
        <div className="mt-6">
          <InShort>
            The {set.code} cards worth a dollar or more together are worth about{" "}
            <span className="num font-semibold text-white">
              {money(marketTotal, "US")}
            </span>{" "}
            at TCGplayer&apos;s market prices
            {top?.marketUsd
              ? `, and ${Math.round(((top.marketUsd ?? 0) / marketTotal) * 100)}% of that is its single most valuable card, ${top.name}`
              : ""}
            . Value in a set sits in a handful of chase cards and their
            Borderless, Showcase and foil versions; most of the list costs well
            under a dollar.
          </InShort>
        </div>
      ) : null}

      <div className="mt-6">
        <EbaySearchPanel
          heading={`${set.name} on eBay`}
          country={country}
          page="set"
          links={[
            ...(["expansion", "core", "masters"].includes(set.kind)
              ? [
                  {
                    label: `${set.code} booster box`,
                    query: magicEbayQuery(
                      `${set.name} ${set.code} booster box`,
                    ),
                  },
                ]
              : []),
            {
              label: `${set.code} singles`,
              query: magicEbayQuery(`${set.code} ${set.name}`),
            },
            ...[...checklist]
              .sort((a, b) => (b.minCents ?? 0) - (a.minCents ?? 0))
              .slice(0, 4)
              .map((c) => ({
                label: `${c.name}${c.variant ? ` (${c.variant.split(" · ")[0]})` : ""}`,
                query: cardEbayQuery({ name: c.name, number: c.number, variant: c.variant, setName: set.name }),
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

      <EbayPicks country={country} setId={set.id} className="mt-10" page="set" fallbackQuery={magicEbayQuery(`${set.name} ${set.code}`)} />

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
              <BrowseFilters q={bq} sets={sets} country={country} action={`/sets/${set.slug}`} hide={["set"]} />
            </div>
          </aside>
          <div className="min-w-0">
            <FilterChips basePath={`/sets/${set.slug}`} sets={setsByCode} symbol={c.symbol} adjective={c.adjective} />
            <SetGridControls basePath={`/sets/${set.slug}`} sort={bq.sort} per={bq.per} />
            {/* The owned overlay (a client island that
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
