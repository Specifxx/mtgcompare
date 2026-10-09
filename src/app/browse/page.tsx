import { EbayPicks } from "@/components/EbayPicks";
import type { Metadata } from "next";
import Link from "next/link";
import { SortSelect } from "@/components/SortSelect";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { BrowseFilters } from "@/components/BrowseFilters";
import { FilterChips } from "@/components/FilterChips";
import { CardTile } from "@/components/CardTile";
import { FormCleaner } from "@/components/FormCleaner";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { cardEbayQuery } from "@/lib/affiliate";
import { newestBoosterSet } from "@/lib/selectors";
import { Pagination } from "@/components/Pagination";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { Breadcrumbs } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  SORTS,
  isFiltered,
  parseBrowse,
  toCardQuery,
  type SearchParams,
} from "@/lib/browse";
import { COUNTRIES } from "@/lib/country";
import { getCardPage, getSets, suggestNames } from "@/lib/data";
import { int } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// Reads the browse engine (in memory behind getCardPage) and the visitor's market: rendered per request, cached at the CDN (contract 7.5).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic: The Gathering Card List — Every Card, Live Prices",
  description:
    "Browse every Magic: The Gathering card with live prices compared across stores in the US, Australia, the UK, Singapore, Canada and the EU. Filter by set, color, rarity, type, treatment and format.",
  alternates: { canonical: "/browse" },
  openGraph: pageOg("/browse"),
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const country = getCountry();
  const c = COUNTRIES[country];
  const q = parseBrowse(searchParams);
  const sets = await getSets();
  const filtered = isFiltered(q);
  const { total, pages, page, items } = await getCardPage(toCardQuery(q, sets, country));
  const newest = newestBoosterSet(sets);
  // The newest set's dearest cards for the eBay panel: one in-memory query, only on the plain list.
  const chase = newest && !filtered ? (await getCardPage({ setIds: [newest.id], sort: "value", per: 24 })).items.slice(0, 6) : [];
  // A name that finds nothing: real names close to what was typed (the hot name table).
  const didYouMean = q.q && !items.length ? await suggestNames(q.q) : [];

  return (
    <div>
      <Breadcrumbs trail={[{ name: "Card database" }]} />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0">
          {/* One copy of the filters: a CSS-only toggle on phones, always open from lg. */}
          <input type="checkbox" id="filters-toggle" className="peer sr-only" />
          <label
            htmlFor="filters-toggle"
            className="btn-ghost w-full cursor-pointer lg:hidden"
          >
            Filters &amp; sort
          </label>
          <div className="mt-3 hidden peer-checked:block lg:mt-0 lg:block">
            <BrowseFilters q={q} sets={sets} country={country} />
            <FormCleaner
              formId="filters"
              defaults={{ sort: "value", per: "48" }}
            />
          </div>
        </aside>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-white">
            {q.q ? `“${q.q}” — Magic cards` : "Magic: The Gathering Card List"}
          </h1>
          <div className="mt-2 max-w-3xl space-y-3 text-[15px] leading-relaxed text-slate-300">
            <p>
              Browse the full list of Magic: The Gathering cards and buy for
              less — every printing, with live prices compared across stores
              in the US, Australia, the UK, Singapore, Canada and the EU to find
              the cheapest place to buy.
            </p>
            <p>
              A tile&apos;s “from” price is the cheapest in-stock listing we
              have for that printing in {c.place}, in {c.currency} — the item
              price, before postage. “≈” marks TCGplayer&apos;s market price
              converted to {c.currency} where no {c.adjective} store has it.
              Lists open on the non-foil price; filter to foil to see foil
              prices. Open a card for every store&apos;s price, cheapest first.
              For every card in one table, see the{" "}
              <Link href="/price-guide" className="text-brand-400 hover:underline">
                Magic price guide
              </Link>
              .
            </p>
          </div>

          <FilterChips
            sets={Object.fromEntries(sets.flatMap((s) => [[s.slug, `${s.name} (${s.code})`], [s.code.toLowerCase(), `${s.name} (${s.code})`]]))}
            symbol="US$"
            adjective={c.adjective}
          />
          <div id="results" className="mt-6 flex scroll-mt-24 flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              <span className="num font-semibold text-white">{int(total)}</span>{" "}
              cards · page {page} of {pages}
              {filtered ? (
                <>
                  {" · "}
                  <Link href="/browse" className="text-brand-400 hover:underline">
                    Clear filters
                  </Link>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <PageSizeSelect size={q.per} />
              <SortSelect defaultSort="value" options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))} />
            </div>
          </div>

          {/* A visitor who typed a search has said what they want: eBay's
              search for those words sits by the count (RiftCompare). Their
              words, so "Search eBay for “q”", never "Buy q". */}
          {q.q && total > 0 ? (
            <EbayBuyCta
              query={q.q}
              freeText
              compact
              source="browse-search"
              page="browse"
              className="mt-4"
            />
          ) : null}

          {!filtered && newest ? (
            <div className="mt-4">
              <EbaySearchPanel
                heading={`${newest.name} chase cards on eBay`}
                sub="Live listings for the newest set's most valuable printings, on your own eBay."
                country={country}
                page="browse"
                links={chase.map((c) => ({
                  label: `${c.name}${c.variant ? ` (${c.variant.split(" · ")[0]})` : ""}`,
                  query: cardEbayQuery(c),
                }))}
              />
            </div>
          ) : null}

          {items.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((card, i) => (
                <CardTile
                  key={card.id}
                  card={card}
                  setCode={card.setCode}
                  country={country}
                  priority={i < 4}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState icon="browse" title="No cards match those filters" body="Try fewer filters, or start over." primary={{ href: "/browse", label: "Start over" }} />
              {didYouMean.length ? (
                <p className="mt-3 text-sm text-slate-300">
                  Did you mean{" "}
                  {didYouMean.map((n, i) => (
                    <span key={n}>
                      {i ? ", " : ""}
                      <Link href={`/browse?q=${encodeURIComponent(n)}`} className="font-semibold text-brand-400 hover:underline">
                        {n}
                      </Link>
                    </span>
                  ))}
                  ?
                </p>
              ) : null}
              {/* A search we have no card for (a typo, a set not loaded yet, a
                  product that is not a single) can still be on eBay. */}
              <EbayBuyCta
                className="mt-4"
                {...(q.q ? { query: q.q, freeText: true } : {})}
                source="browse-no-results"
                page="browse"
              />
            </div>
          )}
          <Pagination page={page} totalPages={pages} params={searchParams} basePath="/browse" />
          <EbayPicks country={country} className="mt-8" page="browse" />
          <InlineSignupPrompt className="mt-8" surface="browse" title="Find the cheap ones, free" body="A free account shows Deal Finder's three biggest savings in your market right now: real store listings under TCGplayer's market price." />
        </div>
      </div>
    </div>
  );
}
