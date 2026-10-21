import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { plural } from "@/lib/format";
import { firstSetYear, nextSet, setsBySeries, setsIndexTitle, shortDate, titleText } from "@/lib/hub-copy";
import { setCountsGrouped, type SetCount } from "@/lib/hub-data";
import { isPreorderSet } from "@/lib/release";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { pageMeta, regionAlternates } from "@/lib/seo";
import { SETS, type PokemonSet } from "@/lib/sets";
import { slugify } from "@/lib/sealed-title";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  const title = setsIndexTitle(r);
  const series = setsBySeries();
  return {
    ...pageMeta({
      title: titleText(title),
      description: `All ${SETS.length} English Pokémon TCG sets in release order, from ${series[0].series} back to ${series[series.length - 1].series} (${firstSetYear()}), with release dates and what ${r.adjective} stores have of each in stock today.`,
      path: `/${r.region}/sets`,
      alternates: regionAlternates(r.region, "/sets"),
    }),
    title,
  };
}

export default async function SetsPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const counts = await setCountsGrouped(r.market);
  const groups = setsBySeries();
  const next = nextSet();
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Sets" }]} />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Pokémon TCG sets in order</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        Every English-language set from XY ({firstSetYear()}) on, newest first, with its English release date and how much of its sealed product{" "}
        {r.adjective} stores have in stock today. A set links to its price comparison once a store we track lists it.
      </p>
      {next && (
        <p className="mt-4">
          <Link href={`/${r.region}/releases`} prefetch={false} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-pre-soft px-4 py-2 text-sm font-semibold text-pre hover:underline">
            <Icon name="calendar" size={16} />
            <span>
              Next set: {next.name} · {shortDate(next.releaseDate)}
            </span>
            <Icon name="arrow-right" size={16} />
          </Link>
        </p>
      )}

      <nav aria-label="Series" className="mt-6">
        <ul className="scroller -mx-4 gap-2 px-4 scroll-px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[-webkit-mask-image:none] sm:[mask-image:none]">
          {groups.map((g) => (
            <li key={g.series}>
              <a href={`#${slugify(g.series)}`} className="chip min-h-10 whitespace-nowrap">
                {g.series}
                <span className="text-xs text-muted">{g.sets.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((g) => {
        const listed = g.sets.filter((s) => counts.has(s.code)).length;
        const from = g.sets[g.sets.length - 1].releaseDate.slice(0, 4);
        const to = g.sets[0].releaseDate.slice(0, 4);
        return (
          <section key={g.series} id={slugify(g.series)} aria-labelledby={`h-${slugify(g.series)}`} className="mt-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 id={`h-${slugify(g.series)}`} className="font-display text-2xl font-bold tracking-tight">
                {g.series}
              </h2>
              <p className="text-sm text-muted">
                {plural(g.sets.length, "set")}, {from === to ? from : `${from}–${to}`} · {listed} listed in {r.inName}
              </p>
            </div>
            <ol className="card divide-y divide-line overflow-hidden">
              {g.sets.map((s) => (
                <SetRow key={s.code} r={r} s={s} c={counts.get(s.code)} />
              ))}
            </ol>
          </section>
        );
      })}

      <p className="mt-10 max-w-2xl text-sm text-muted">
        English-language sets from XY ({firstSetYear()}) on, each with its English release date. Sub-sets with no sealed product of their own
        (trainer galleries, shiny vaults, promos, McDonald&rsquo;s collections) are left out. Upcoming sets and pre-orders are on the{" "}
        <Link href={`/${r.region}/releases`} prefetch={false} className="font-semibold text-brand-strong hover:underline">
          release calendar
        </Link>
        .
      </p>
    </div>
  );
}

/** One set: its logo, name, English release date and, here, what stores list and have open. Linked only where a store lists it (an empty set page is noindex). */
function SetRow({ r, s, c }: { r: RegionInfo; s: PokemonSet; c: SetCount | undefined }) {
  const pre = isPreorderSet(s.code);
  const body = (
    <>
      <span className="flex h-10 w-20 shrink-0 items-center justify-center sm:h-12 sm:w-24">
        {s.logo ? (
          <img src={s.logo} alt="" width={96} height={48} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
        ) : (
          <span aria-hidden="true" className="flex h-full w-full items-center justify-center rounded-lg bg-raised font-display text-sm font-bold tracking-wide text-faint ring-1 ring-line">
            {initials(s.name)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${c ? "group-hover:text-brand" : ""}`}>{s.name}</span>
        <span className="block text-xs text-muted">
          <time dateTime={s.releaseDate}>{pre ? `Out ${shortDate(s.releaseDate)}` : `Released ${shortDate(s.releaseDate)}`}</time>
          {pre && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-pre-soft px-1.5 py-px font-semibold text-pre">Pre-order</span>}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs sm:text-sm">
        {c ? (
          <>
            <span className="block text-muted">{plural(c.products, "product")}</span>
            <span className={`block font-semibold ${c.inStock ? (pre ? "text-pre" : "text-open") : "text-muted"}`}>
              {c.inStock} {pre ? "on pre-order" : "in stock"}
            </span>
          </>
        ) : (
          <span className="block text-muted">Not listed here</span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {c ? (
        <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="group flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-raised sm:gap-4 sm:px-5">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-5">{body}</div>
      )}
    </li>
  );
}

/** "Delta Reign" → "DR", "30th Celebration" → "30C": a stand-in for a set sets.ts has no logo for yet. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (/^\d/.test(w) ? w.replace(/\D.*$/, "") : w[0]))
    .join("")
    .toUpperCase()
    .slice(0, 3);
}
