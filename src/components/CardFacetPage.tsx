import Link from "next/link";
import { CardLinkGrid } from "./CardLinkGrid";
import { Pagination } from "./Pagination";
import { Breadcrumbs, InShort, SectionHeader } from "./ui";
import { COUNTRIES, type Country } from "@/lib/country";
import type { CardLite, Catalog } from "@/lib/data";
import type { Facet } from "@/lib/facets";
import { paginate } from "@/lib/facets";
import { int, money } from "@/lib/format";
import { median } from "@/lib/selectors";

export const FACET_PER_PAGE = 48;

// The body shared by /cards/printing/[printing], /cards/rarity/[rarity] and
// /cards/type/[type] (RiftCompare's FacetPageBody): real counts and medians
// from the cached catalogue, the most valuable printings first, paged, and
// links to the sibling facets.
export function CardFacetPage({
  facet,
  cards,
  cat,
  country,
  crumbs,
  path,
  pageParam,
  siblings,
  siblingBase,
  browseHref,
}: {
  facet: Facet;
  cards: CardLite[];
  cat: Catalog;
  country: Country;
  crumbs: { href?: string; label: string }[];
  path: string;
  pageParam: string | undefined;
  siblings: Facet[];
  siblingBase: string;
  browseHref: string;
}) {
  const sorted = [...cards].sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1) || a.id - b.id);
  const { page, pages, slice } = paginate(sorted, pageParam, FACET_PER_PAGE);
  const priced = cards.map((c) => c.marketUsd).filter((v): v is number => v != null);
  const inStock = cards.filter((c) => c.low[country] != null).length;
  const sets = new Set(cards.map((c) => c.setId)).size;
  const top = sorted[0];
  return (
    <div>
      <Breadcrumbs trail={crumbs.map((c) => ({ href: c.href, name: c.label }))} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">One Piece {facet.title.charAt(0).toLowerCase() + facet.title.slice(1)}</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {facet.intro} {int(cards.length)} printings across {int(sets)} sets, most valuable first; prices are the cheapest in-stock listing in{" "}
        {COUNTRIES[country].place}. Narrow them by set or colour in the{" "}
        <Link href={browseHref} className="text-brand-400 hover:underline">
          card database
        </Link>
        .
      </p>
      <div className="mt-6">
        <InShort>
          {priced.length ? (
            <>
              The median TCGplayer market price is {money(median(priced), "US")} and {int(inStock)} of {int(cards.length)} are in stock at a store in{" "}
              {COUNTRIES[country].place} today.
              {top?.marketUsd != null ? (
                <>
                  {" "}
                  The most valuable is {top.name}
                  {top.variant ? ` (${top.variant})` : ""} at {money(top.marketUsd, "US")}.
                </>
              ) : null}
            </>
          ) : (
            <>No printing in this group has a TCGplayer market price yet.</>
          )}
        </InShort>
      </div>
      <section className="mt-8">
        <SectionHeader title={`Every ${facet.label.toLowerCase()} printing`} sub={pages > 1 ? `page ${page} of ${pages}` : undefined} />
        {slice.length ? <CardLinkGrid cards={slice} cat={cat} country={country} /> : <p className="text-slate-400">No cards yet.</p>}
        <Pagination page={page} totalPages={pages} params={{}} basePath={path} />
      </section>
      <nav className="mt-10" aria-label="Related groups">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">More groups</h2>
        <ul className="flex flex-wrap gap-2">
          {siblings
            .filter((s) => s.slug !== facet.slug)
            .map((s) => (
              <li key={s.slug}>
                <Link href={`${siblingBase}/${s.slug}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600">
                  {s.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
