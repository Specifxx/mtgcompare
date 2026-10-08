import Link from "next/link";
import { CardLinkGrid } from "./CardLinkGrid";
import { Pagination } from "./Pagination";
import { Breadcrumbs, InShort, SectionHeader } from "./ui";
import { COUNTRIES, type Country } from "@/lib/country";
import { MAX_PAGE, type CardPage } from "@/lib/data";
import type { Facet } from "@/lib/facets";
import { int, money } from "@/lib/format";

export const FACET_PER_PAGE = 48;

// The body shared by /cards/treatment/[key], /cards/rarity/[rarity] and /cards/type/[type]
// (RiftCompare's FacetPageBody): the printings of one group, most valuable first by
// TCGplayer market price, paged by the browse engine, with links to the sibling groups.
// A low-only listing never ranks (the engine sorts on market only), so the order is a
// real ranking. The engine serves at most MAX_PAGE pages; past that the page says so and
// points at the card database, which can narrow by set.
export function CardFacetPage({
  facet,
  result,
  country,
  crumbs,
  path,
  siblings,
  siblingBase,
  siblingCounts,
  browseHref,
  noun = "printings",
}: {
  facet: Facet;
  result: CardPage;
  country: Country;
  crumbs: { href?: string; label: string }[];
  path: string;
  siblings: Facet[];
  siblingBase: string;
  siblingCounts?: Record<string, number>;
  browseHref: string;
  noun?: string;
}) {
  const { items, total, page } = result;
  const pages = Math.min(result.pages, MAX_PAGE);
  const top = items.find((c) => c.marketUsd != null);
  const h1 = `Magic ${facet.title.charAt(0).toLowerCase() + facet.title.slice(1)}`;
  return (
    <div>
      <Breadcrumbs trail={crumbs.map((c) => ({ href: c.href, name: c.label }))} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{h1}</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {facet.intro} {int(total)} {noun}, most valuable first; prices are the cheapest in-stock listing in {COUNTRIES[country].place}. Narrow them by set, colour or price in the{" "}
        <Link href={browseHref} className="text-brand-400 hover:underline">
          card database
        </Link>
        .
      </p>
      <div className="mt-6">
        <InShort>
          {top?.marketUsd != null ? (
            <>
              The most valuable {facet.label.toLowerCase()} printing is {top.name}
              {top.label ? ` (${top.label})` : ""} at {money(top.marketUsd, "US")} on TCGplayer&apos;s market price.
            </>
          ) : (
            <>No printing in this group has a TCGplayer market price yet.</>
          )}
        </InShort>
      </div>
      <section className="mt-8">
        <SectionHeader title={`Every ${facet.label.toLowerCase()} printing`} sub={pages > 1 ? `page ${page} of ${pages}` : undefined} />
        {items.length ? <CardLinkGrid cards={items} country={country} /> : <p className="text-slate-400">No cards yet.</p>}
        {result.capped || result.pages > MAX_PAGE ? (
          <p className="mt-4 text-sm text-slate-400">
            These are the {int(MAX_PAGE * FACET_PER_PAGE)} most valuable. To see the rest, narrow the group in the{" "}
            <Link href={browseHref} className="text-brand-400 hover:underline">
              card database
            </Link>
            .
          </p>
        ) : null}
        <Pagination page={page} totalPages={pages} params={{}} basePath={path} />
      </section>
      <nav className="mt-10" aria-label="Related groups">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">More groups</h2>
        <ul className="flex flex-wrap gap-2">
          {siblings
            .filter((s) => s.slug !== facet.slug && (!siblingCounts || (siblingCounts[s.key] ?? 0) > 0))
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
