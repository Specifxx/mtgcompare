import Link from "next/link";
import type { Metadata } from "next";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { AddToCalendar } from "@/components/AddToCalendar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/Section";
import { calendarProducts, CALENDAR_TYPES } from "@/lib/data";
import { money, plural, relativeDay } from "@/lib/format";
import { isoDay, nextSet, releasesTitle, setsOfYear, shortDate, titleText } from "@/lib/hub-copy";
import { setCountsGrouped, type SetCount } from "@/lib/hub-data";
import { formatRelease, isPreorderSet } from "@/lib/release";
import { jsonLd, pageMeta, regionAlternates, withPokemon } from "@/lib/seo";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { preorderPath } from "@/lib/preorder-guides";
import { SETS, type PokemonSet } from "@/lib/sets";
import { SITE_URL } from "@/lib/site";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

// How far back the calendar's rich rows look: a set is "new" for four months, long enough
// for the second wave and the pre-orders to settle into stock. The year tables below list the rest.
const RECENT_DAYS = 120;

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  // The year is the render's: the page re-renders at least daily (its CDN copy lasts a day), so it rolls over on its own on 1 January.
  const year = new Date().getUTCFullYear();
  const title = releasesTitle(r, year);
  const next = nextSet();
  return {
    ...pageMeta({
      title: titleText(title),
      description: `Every Pokémon TCG set releasing in ${year}, with English release dates${
        next ? `: ${withPokemon(next.name)} is next, out ${shortDate(next.releaseDate)}` : ""
      }. What ${r.adjective} stores have in stock or open for pre-order today.`,
      path: `/${r.region}/releases`,
      alternates: regionAlternates(r.region, "/releases"),
    }),
    title,
  };
}

/** Sets released in the last RECENT_DAYS days or still to come, newest first (SETS is already newest first). */
function calendarSets(today: string, sets: PokemonSet[] = SETS): PokemonSet[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * 86400_000).toISOString().slice(0, 10);
  return sets.filter((s) => s.releaseDate >= since);
}

export default async function ReleasesPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const now = new Date();
  const today = isoDay(now);
  const year = now.getUTCFullYear();
  const sets = calendarSets(today);
  const [counts, cheapest] = await Promise.all([setCountsGrouped(r.market), calendarProducts(r.market, sets.map((s) => s.code))]);
  // The same rule as every other page (release.ts): a set is upcoming until its release day.
  const upcoming = sets.filter((s) => isPreorderSet(s.code, now));
  const recent = sets.filter((s) => !isPreorderSet(s.code, now));
  const next = nextSet(now);
  const nextCount = next ? counts.get(next.code) : undefined;
  const thisYear = setsOfYear(year);
  const lastYear = setsOfYear(year - 1);

  const listed = SETS.filter((s) => sets.includes(s) || thisYear.includes(s));
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Pokémon TCG release dates ${year} (${r.name})`,
    itemListElement: listed.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      url: `${SITE_URL}/${r.region}/sets/${s.slug}`,
    })),
  };

  const Row = ({ s, future }: { s: PokemonSet; future: boolean }) => {
    const c = counts.get(s.code);
    const picks = cheapest.get(s.code) ?? [];
    return (
      <li className="card flex flex-col gap-4 p-5 md:flex-row md:items-start md:gap-6">
        <div className="md:w-56 md:shrink-0">
          <div className={`text-sm font-semibold ${future ? "text-pre" : "text-open"}`}>
            {relativeDay(s.releaseDate, today).replace(/^./, (ch) => ch.toUpperCase())}
          </div>
          <time dateTime={s.releaseDate} className="mt-0.5 block font-display text-xl font-bold">
            {formatRelease(s.releaseDate)}
          </time>
          <div className="mt-1 text-xs text-muted">{s.series}</div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl font-bold leading-tight">
            <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="inline-flex min-h-11 items-center hover:text-brand">
              {s.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted">
            {c ? (
              <>
                {plural(c.products, "product")} listed in {r.inName} ·{" "}
                <span className={c.inStock ? `font-semibold ${future ? "text-pre" : "text-open"}` : ""}>
                  {c.inStock} {future ? "open for pre-order" : "in stock"}
                </span>
              </>
            ) : (
              `No ${r.adjective} store we track lists it yet.`
            )}
          </p>
          {future && preorderPath(r.region, s.code) && (
            <Link href={preorderPath(r.region, s.code)!} prefetch={false} className="mt-2 inline-block text-sm font-semibold text-pre hover:underline">
              Compare {s.name} pre-orders store by store →
            </Link>
          )}
          {picks.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {CALENDAR_TYPES.map((t) => picks.find((p) => p.productType === t)).map(
                (p) =>
                  p && (
                    <li key={p.slug}>
                      <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="chip min-h-10 py-2">
                        <span className="text-muted">{p.productType}</span>
                        <span className="tabular font-semibold">{money(p.lowestPriceCents, r.market)}</span>
                        <span className="text-xs text-muted">{p.inStockStores ? plural(p.inStockStores, "store") : "TCGplayer"}</span>
                      </Link>
                    </li>
                  ),
              )}
            </ul>
          )}
          {future && (
            <div className="mt-3">
              <AddToCalendar code={s.code} name={s.name} date={s.releaseDate} slug={s.slug} url={`${SITE_URL}/${r.region}/sets/${s.slug}`} when={shortDate(s.releaseDate)} />
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Releases" }]} />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Pokémon TCG release dates {year}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {/* One text node, so nothing in it moves when the web font arrives. */}
        {`The release calendar for ${r.inName}: upcoming sets and the ones out in the last ${RECENT_DAYS} days, with what ${r.adjective} stores have in stock or open for pre-order today, then every set of ${year} and ${year - 1}. Dates are the English-language release dates; stores may ship pre-orders a few days either side.`}
      </p>

      <NextSetBox r={r} next={next} c={nextCount} today={today} />

      <section className="mt-12" aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-4 font-display text-2xl font-bold tracking-tight">
          Upcoming
        </h2>
        {upcoming.length ? (
          <ol className="grid gap-3">
            {[...upcoming].reverse().map((s) => (
              <Row key={s.code} s={s} future />
            ))}
          </ol>
        ) : (
          <Empty>No announced set is left to release. New ones appear here as soon as they are added.</Empty>
        )}
      </section>

      <section className="mt-12" aria-labelledby="recent">
        <h2 id="recent" className="mb-4 font-display text-2xl font-bold tracking-tight">
          Just released
        </h2>
        {recent.length ? (
          <ol className="grid gap-3">
            {recent.map((s) => (
              <Row key={s.code} s={s} future={false} />
            ))}
          </ol>
        ) : (
          <Empty>Nothing released in the last {RECENT_DAYS} days.</Empty>
        )}
      </section>

      <YearTable id={`sets-${year}`} title={`All ${year} sets`} r={r} sets={thisYear} counts={counts} now={now} empty={`No ${year} set is announced yet.`} />
      <YearTable id={`sets-${year - 1}`} title={`${year - 1} sets`} r={r} sets={lastYear} counts={counts} now={now} empty={`No ${year - 1} set is on the list.`} />

      <p className="mt-8 text-sm text-muted">
        Every set back to {SETS[SETS.length - 1].releaseDate.slice(0, 4)}, in order, is on the{" "}
        <Link href={`/${r.region}/sets`} prefetch={false} className="font-semibold text-brand-strong hover:underline">
          sets page
        </Link>
        .
      </p>
      <ul role="list" className="mt-4 flex flex-wrap gap-2 text-sm">
        <li>
          <Link href={`/${r.region}/guides/pokemon-build-and-battle-box`} prefetch={false} className="chip min-h-10">
            Prerelease kits: the Build &amp; Battle Box
          </Link>
        </li>
        <li>
          <Link href={COUNTRY_GUIDE.path} prefetch={false} className="chip min-h-10">
            Booster box prices by country
          </Link>
        </li>
        <li>
          <Link href={`/${r.region}/guides/how-to-preorder-pokemon-tcg`} prefetch={false} className="chip min-h-10">
            How to pre-order
          </Link>
        </li>
      </ul>
      {/* The page's closing strip stands in for the pre-footer one, so two never sit back to back. */}
      <NoPreFooter />
      <EbayStrip region={r.region} context="chase" placement="listings-releases" className="mt-10" search={{ kind: "card", query: "" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}

/** The answer to "when is the next Pokémon set": its name, English date and how far off it is, with a calendar file. */
function NextSetBox({ r, next, c, today }: { r: RegionInfo; next: PokemonSet | null; c: SetCount | undefined; today: string }) {
  if (!next) return null;
  const path = `/${r.region}/sets/${next.slug}`;
  return (
    <section aria-labelledby="next-set" className="mt-6 rounded-2xl border border-pre/25 bg-pre-soft p-5 sm:p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-pre">Next set</div>
      <p id="next-set" className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
        <Link href={path} prefetch={false} className="hover:underline">
          {withPokemon(next.name)}
        </Link>
        : <time dateTime={next.releaseDate}>{formatRelease(next.releaseDate)}</time> <span className="text-pre">({relativeDay(next.releaseDate, today)})</span>
      </p>
      <p className="mt-2 text-sm text-ink/80">
        {next.series} series ·{" "}
        {c ? (
          <>
            {c.inStock} of {plural(c.products, "product")} open for pre-order in {r.inName} today
          </>
        ) : (
          <>no {r.adjective} store we track lists it yet</>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <AddToCalendar code={next.code} name={next.name} date={next.releaseDate} slug={next.slug} url={`${SITE_URL}${path}`} when={shortDate(next.releaseDate)} />
        <Link href={path} prefetch={false} className="btn-primary min-h-11">
          Compare {next.name} prices <Icon name="arrow-right" size={18} />
        </Link>
      </div>
    </section>
  );
}

/** A year's sets in a compact table: name (linked where a store lists it), series, English release date, and this region's counts. */
function YearTable({ id, title, r, sets, counts, now, empty }: { id: string; title: string; r: RegionInfo; sets: PokemonSet[]; counts: Map<string, SetCount>; now: Date; empty: string }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <h2 id={id} className="mb-4 font-display text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {sets.length ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-raised text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2.5 sm:px-5">
                  Set
                </th>
                <th scope="col" className="hidden px-3 py-2.5 sm:table-cell">
                  Series
                </th>
                <th scope="col" className="px-3 py-2.5">
                  English release
                </th>
                <th scope="col" className="px-3 py-2.5 text-right sm:px-5">
                  In {r.inName}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sets.map((s) => {
                const c = counts.get(s.code);
                const pre = isPreorderSet(s.code, now);
                return (
                  <tr key={s.code} className="hover:bg-raised">
                    <th scope="row" className="px-3 py-3 text-left font-semibold sm:px-5">
                      {c ? (
                        <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="inline-flex min-h-10 items-center hover:text-brand">
                          {s.name}
                        </Link>
                      ) : (
                        s.name
                      )}
                      <span className="block text-xs font-normal text-muted sm:hidden">{s.series}</span>
                    </th>
                    <td className="hidden px-3 py-3 text-muted sm:table-cell">{s.series}</td>
                    <td className="px-3 py-3">
                      <time dateTime={s.releaseDate} className="whitespace-nowrap">
                        {shortDate(s.releaseDate)}
                      </time>
                      {pre && <span className="mt-0.5 block w-fit rounded-full bg-pre-soft px-1.5 py-px text-xs font-semibold text-pre sm:ml-1.5 sm:mt-0 sm:inline">Pre-order</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right sm:px-5">
                      {c ? (
                        <>
                          <span className={`font-semibold ${c.inStock ? (pre ? "text-pre" : "text-open") : "text-muted"}`}>
                            {c.inStock} {pre ? "on pre-order" : "in stock"}
                          </span>
                          <span className="block text-xs text-muted">of {plural(c.products, "product")}</span>
                        </>
                      ) : (
                        <span className="text-muted">Not listed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </section>
  );
}
