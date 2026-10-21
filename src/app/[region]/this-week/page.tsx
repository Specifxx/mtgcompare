import Link from "next/link";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { ProductRail } from "@/components/ProductRail";
import { Empty, Section } from "@/components/Section";
import { calendarProducts, CALENDAR_TYPES, lastCheckedAt, type ProductCardData } from "@/lib/data";
import { dealsCopy, dealsInMarket, digestCopy, fitTitle, JUST_RELEASED_DAYS, newlyTracked, productCountsBySets, setsAround, SOON_DAYS, stockLabel } from "@/lib/deals";
import { money, plural, relativeDay, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { packsForLabel, perPackCents } from "@/lib/packs";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { pageMeta, regionAlternates } from "@/lib/seo";
import type { PokemonSet } from "@/lib/sets";

// /[region]/this-week: a digest that changes every day, built only from today's state: sets releasing in the next 45 days (with
// their open pre-orders and cheapest box / ETB / bundle), sets out in the last 30, what is cheaper than most stores today, and what
// DexCompare started tracking in the last 14 days (labelled as exactly that: Product.createdAt is not a release date). Five small
// capped reads; cached at the CDN until the next release. One eBay strip, after the first block.

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return {
    ...pageMeta({
      title: digestCopy.title(r),
      description: digestCopy.description(r),
      path: `/${r.region}/this-week`,
      alternates: regionAlternates(r.region, "/this-week"),
    }),
    title: fitTitle(digestCopy.title(r)),
  };
}

export default async function ThisWeekPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const today = new Date().toISOString().slice(0, 10);
  const { soon, recent } = setsAround(today);
  const codes = [...soon, ...recent].map((s) => s.code).slice(0, 10);
  const [counts, cheapest, deals, fresh, checked] = await Promise.all([
    productCountsBySets(r.market, codes),
    calendarProducts(r.market, codes),
    dealsInMarket(r.market, { take: 8 }),
    newlyTracked(r.market, 12),
    lastCheckedAt(r.market),
  ]);

  const block = (s: PokemonSet) => <SetBlock key={s.code} r={r} s={s} today={today} count={counts.get(s.code)} picks={cheapest.get(s.code) ?? []} />;
  // The slim strip above the footer needs a viewport's height of page under this page's own strip (lib/ebay-ads.ts GAP, 960 px).
  const rail = (n: number, cols: number, row: number) => 140 + Math.ceil(Math.max(1, n) / cols) * row;
  const phoneBelow = 130 + (recent.length ? recent.length * 330 : 200) + (deals.length ? rail(1, 1, 330) : 260) + (fresh.length ? rail(1, 1, 330) : 260);
  const deskBelow = 130 + (recent.length ? recent.length * 210 : 200) + (deals.length ? rail(deals.length, 4, 446) : 220) + (fresh.length ? rail(fresh.length, 4, 446) : 220);
  // A short digest keeps its one strip only: with the pre-footer too, two units would be a quarter of the page (the density ceiling).
  const room = phoneBelow >= 1500 && deskBelow >= 1500;

  return (
    <div className="page py-8">
      {!room && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "This week" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Weekly digest · {r.name}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{digestCopy.h1(r)}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted">
          <Icon name="clock" size={16} />
          <span>
            Updated {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}
          </span>
        </p>
        <p className="mt-3 leading-7 text-muted">{digestCopy.intro(r)}</p>
      </header>
      <nav aria-label="On this page" className="scroller -mx-4 mt-6 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[-webkit-mask-image:none] sm:[mask-image:none]">
        <a href="#releasing-soon" className="chip min-h-10">
          <Icon name="calendar" size={16} /> Releasing soon
        </a>
        <a href="#just-released" className="chip min-h-10">
          Just released
        </a>
        <a href="#deals" className="chip min-h-10">
          <Icon name="tag" size={16} /> Cheaper today
        </a>
        <a href="#new" className="chip min-h-10">
          New on DexCompare
        </a>
      </nav>

      <Section id="releasing-soon" title="Releasing soon" kicker={`Next ${SOON_DAYS} days`} href={`/${r.region}/releases`} linkLabel="Release calendar">
        {soon.length ? (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3">{soon.map(block)}</ol>
        ) : (
          <Empty
            actions={[
              { href: `/${r.region}/releases`, label: "Release calendar" },
              { href: `/${r.region}/sets`, label: "All sets" },
            ]}
          >
            No English-language set is due in the next {SOON_DAYS} days. New sets appear here as soon as their date is announced.
          </Empty>
        )}
      </Section>

      <EbayStrip region={r.region} context="sealed" placement="listings-digest" className="mt-10" search={{ kind: "sealed", query: "" }} />

      <Section id="just-released" title="Just released" kicker={`Out in the last ${JUST_RELEASED_DAYS} days`} href={`/${r.region}/sets`} linkLabel="All sets">
        {recent.length ? (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3">{recent.map(block)}</ol>
        ) : (
          <Empty
            actions={[
              { href: `/${r.region}/sets`, label: "All sets" },
              { href: `/${r.region}/type/booster-boxes`, label: "Booster boxes" },
            ]}
          >
            No set came out in the last {JUST_RELEASED_DAYS} days.
          </Empty>
        )}
      </Section>

      <Section id="deals" title={dealsCopy.rail} kicker={dealsCopy.railKicker} href={`/${r.region}/deals`} linkLabel="All deals">
        {deals.length ? (
          <ProductRail products={deals} region={r.region} label={dealsCopy.rail} />
        ) : (
          <Empty
            actions={[
              { href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" },
              { href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" },
            ]}
          >
            Nothing is 10% under the median of 3 or more {r.adjective} stores today.
          </Empty>
        )}
      </Section>

      <Section id="new" title="New on DexCompare" kicker="Recently added">
        <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">{digestCopy.newLabel}.</p>
        {fresh.length ? (
          <ProductRail products={fresh} region={r.region} label="New on DexCompare" />
        ) : (
          <Empty
            actions={[
              { href: `/${r.region}/releases`, label: "Upcoming releases" },
              { href: `/${r.region}/sealed`, label: "All sealed" },
            ]}
          >
            DexCompare hasn&rsquo;t started tracking anything new in {r.inName} in the last 14 days.
          </Empty>
        )}
      </Section>
    </div>
  );
}

/** One set: when, how many products the region lists and has open today, and its cheapest booster box, ETB and bundle. */
function SetBlock({ r, s, today, count, picks }: { r: RegionInfo; s: PokemonSet; today: string; count?: { products: number; open: number }; picks: ProductCardData[] }) {
  const future = s.releaseDate > today;
  const rel = relativeDay(s.releaseDate, today);
  const when = future ? rel.replace(/^./, (c) => c.toUpperCase()) : `Out ${rel}`;
  // A set without a logo (the newest ones) shows its box or ETB on a plate.
  const art = s.logo ? null : thumb(picks.find((p) => p.imageUrl)?.imageUrl, 200);
  const ordered = CALENDAR_TYPES.map((t) => picks.find((p) => p.productType === t)).filter((p): p is ProductCardData => !!p);
  return (
    <li className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5">
      <div className="flex items-center gap-4 sm:w-52 sm:shrink-0 sm:flex-col sm:items-start sm:gap-3">
        {s.logo ? (
          <img src={s.logo} alt="" width={112} height={48} loading="lazy" decoding="async" className="h-12 w-28 shrink-0 object-contain object-left" />
        ) : (
          <span className="plate flex h-14 w-14 shrink-0 items-center justify-center">
            {art ? <img src={art} alt="" width={56} height={56} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" /> : <Icon name="calendar" className="text-faint" />}
          </span>
        )}
        <div>
          <div className={`text-sm font-semibold ${future ? "text-pre" : "text-open"}`}>{when}</div>
          <time dateTime={s.releaseDate} className="block font-display text-lg font-bold leading-tight">
            {formatRelease(s.releaseDate)}
          </time>
          <div className="text-xs text-muted">{s.series}</div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-xl font-bold leading-tight sm:text-2xl">
          <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="hover:text-brand">
            {s.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted">
          {count && count.products > 0 ? (
            <>
              {plural(count.products, "product")} listed in {r.inName} ·{" "}
              <span className={`font-semibold ${future ? "text-pre" : "text-open"}`}>
                {count.open} {future ? "open for pre-order today" : "in stock today"}
              </span>
            </>
          ) : (
            `No ${r.adjective} store we track lists it yet.`
          )}
        </p>
        {ordered.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {ordered.map((p) => {
              const per = perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name));
              return (
                <li key={p.slug}>
                  <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="flex h-full min-h-11 flex-col rounded-lg border border-line px-3 py-2 transition-colors hover:bg-raised">
                    <span className="text-xs font-medium text-muted">{p.productType}</span>
                    <span className="tabular font-display font-bold">
                      {money(p.lowestPriceCents, r.market)}
                      {per != null && <span className="ml-1.5 font-sans text-xs font-normal text-muted">≈ {money(per, r.market)} / pack</span>}
                    </span>
                    <span className="text-xs text-muted">{stockLabel(p, future)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
          Every {s.name} product <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </li>
  );
}
