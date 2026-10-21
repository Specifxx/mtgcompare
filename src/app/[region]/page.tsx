import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { RecentlyViewed } from "@/components/Recent";
import { firstHotSet, hotSetHighlight, NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon, type IconName } from "@/components/Icon";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail } from "@/components/ProductRail";
import { SearchBox } from "@/components/SearchBox";
import { Empty, Section } from "@/components/Section";
import { StockPill } from "@/components/StockPill";
import { homeRails, regionOverview, type ProductCardData } from "@/lib/data";
import { dealsCopy, dealsInMarket, fitTitle, homeCopy, nearestRegion, stockLabel } from "@/lib/deals";
import { cardOpen } from "@/lib/compact";
import { money, plural, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { hotRank } from "@/lib/popular";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { openPreorderGuides } from "@/lib/preorder-guides";
import { isPreorderSet, formatRelease } from "@/lib/release";
import { REGIONS, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { ogCardImage, pageMeta, regionAlternates } from "@/lib/seo";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { SETS, type PokemonSet } from "@/lib/sets";
import { storesInMarket } from "@/lib/stores";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

// The overview's counts go into the description ("1,591 in stock today") and the hero's trust line: one read, shared.
const getOverview = cache((market: Market) => regionOverview(market));

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const n = storesInMarket(r.market).length;
  const overview = await getOverview(r.market);
  const meta = pageMeta({
    title: homeCopy.title(r, n),
    description: homeCopy.description(r, n, overview.inStock),
    path: `/${r.region}`,
    alternates: regionAlternates(r.region, ""),
  });
  return {
    ...meta,
    title: fitTitle(homeCopy.title(r, n)),
    // The region's own share card (app/og/[region]): what a link to /au or /us shows on Reddit, Discord or X.
    openGraph: { ...meta.openGraph, images: [ogCardImage(`/og/${r.region}`, `DexCompare: Pokémon sealed prices across ${n} ${r.adjective} stores`)] },
  };
}

const QUICK_TYPES = ["booster-boxes", "elite-trainer-boxes", "booster-bundles", "collections", "ultra-premium-collections", "tins", "booster-packs", "blisters"];
const HEADLINE = ["Booster Box", "Elite Trainer Box", "Booster Bundle"];

export default async function RegionHome({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const [{ boxes, etbs, preorders, latestSets: bySet }, overview, deals] = await Promise.all([homeRails(r.market), getOverview(r.market), dealsInMarket(r.market, { take: 8 })]);
  // The soonest upcoming set with a pre-order page: the rail's "see all" goes there.
  const preorderGuide = openPreorderGuides()[0] ?? null;
  const storeCount = storesInMarket(r.market).length;
  const latestSets = SETS.filter((s) => bySet.has(s.code)).slice(0, 4);
  // The owner's most wanted set that is out (lib/popular.ts HOT_SETS: 30th Celebration first) gets the sealed strip's highlighted
  // eBay button, "Shop 30th Celebration on eBay": inside that strip's own top line, so the page keeps its two units.
  const hotHighlight = hotSetHighlight(firstHotSet());
  const hot = hotPicks(preorders, boxes);
  const other = REGIONS[nearestRegion(r.region)];
  const preorderLink = { href: `/${r.region}/releases`, label: "Pre-orders" };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="page relative grid gap-10 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center">
          <div className="min-w-0">
            <div className="eyebrow">
              <span aria-hidden="true">{r.flag}</span> {r.name} · prices in {r.currency}
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Compare Pokémon booster box &amp; ETB prices in <span className="text-brand">{r.inName}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Today&rsquo;s prices and stock from {plural(storeCount, `${r.adjective} store`)}
              {r.market === "US" && " and TCGplayer"}, cheapest first.
            </p>
            <div className="mt-6 max-w-2xl">
              <SearchBox region={r.region} size="lg" />
            </div>
            <nav
              aria-label="Shop by type"
              className="mt-4 flex flex-wrap gap-2"
            >
              <Link href={`/${r.region}/deals`} prefetch={false} className="chip min-h-10 border-brand/30 bg-brand-soft font-semibold text-brand-strong hover:border-brand/60">
                <Icon name="tag" size={16} /> Deals
              </Link>
              {QUICK_TYPES.map((slug) => {
                const t = PRODUCT_TYPES.find((x) => x.slug === slug)!;
                return (
                  <Link key={slug} href={`/${r.region}/type/${slug}`} prefetch={false} className="chip min-h-10">
                    {t.plural}
                  </Link>
                );
              })}
            </nav>
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full bg-open motion-safe:animate-pulse" aria-hidden="true" />
              <span>
                <b className="tabular font-semibold text-ink">{storeCount.toLocaleString("en")}</b> stores
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <b className="tabular font-semibold text-ink">{overview.inStock.toLocaleString("en")}</b> in stock
              </span>
              <span aria-hidden="true">·</span>
              {/* A live <time>: the page is cached for a day, so a fixed "3 hours ago" would freeze. */}
              <span>checked {overview.lastChecked ? <Ago iso={overview.lastChecked.toISOString()} initial={timeAgo(overview.lastChecked)} /> : "twice a day"}</span>
            </p>
          </div>
          {hot.length > 0 && (
            <aside aria-labelledby="hot-now">
              <h2 id="hot-now" className="eyebrow mb-3">
                Hot right now
              </h2>
              <ul className="grid gap-3">
                {hot.map((p) => (
                  <li key={p.slug}>
                    <HotRow p={p} r={r} />
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>

      {/* The page carries two strips of its own (sealed, chase cards): no third one above the footer. */}
      <NoPreFooter />
      <div className="page">
        {deals.length > 0 && (
          <Section title={dealsCopy.rail} kicker={dealsCopy.railKicker} href={`/${r.region}/deals`} linkLabel="All deals">
            <ProductRail products={deals} region={r.region} eager={4} label={dealsCopy.rail} />
          </Section>
        )}

        {/* The page's first eBay unit, under the deals rail: sealed listings as an image strip (imported from eBay once a day, fetched in the
            browser once it is near the viewport), with the owner's hot set as its highlighted button; with none to list, the compact CTA row.
            The chase-card strip follows the booster-box rail, far enough down that the two never share a phone screen. */}
        <EbayStrip region={r.region} context="sealed" placement="listings-home-sealed" className="mt-14" search={{ kind: "sealed", query: "" }} highlight={hotHighlight} />

        {latestSets.length > 0 && (
          <Section title="Latest sets" kicker="New & upcoming" href={`/${r.region}/sets`} linkLabel="All sets">
            <div className="grid gap-4 md:grid-cols-2">
              {latestSets.map((s) => (
                <SetCard key={s.code} r={r} s={s} items={bySet.get(s.code) ?? []} />
              ))}
            </div>
          </Section>
        )}

        {preorders.length > 0 && (
          <Section
            title="Open for pre-order"
            kicker="Upcoming sets"
            href={preorderGuide ? `/${r.region}/preorders/${preorderGuide.set.slug}` : `/${r.region}/releases`}
            linkLabel={preorderGuide ? `Compare ${preorderGuide.set.name} pre-orders` : "Release calendar"}
          >
            <ProductGrid products={preorders} region={r.region} />
          </Section>
        )}

        <Section title="Booster boxes in stock" kicker="Newest sets first" href={`/${r.region}/type/booster-boxes`}>
          {boxes.length ? (
            <ProductGrid products={boxes} region={r.region} />
          ) : (
            <Empty actions={[preorderLink, { href: `/${r.region}/type/booster-boxes`, label: "All booster boxes" }, { href: `/${other.region}/type/booster-boxes`, label: `Booster boxes in ${other.inName}` }]}>
              No booster boxes in stock right now.
            </Empty>
          )}
          <p className="mt-4 text-sm text-muted">
            How do booster box prices in {r.inName} compare with the other six markets?{" "}
            <Link href={COUNTRY_GUIDE.path} prefetch={false} className="font-semibold text-brand hover:underline">
              Booster box prices by country →
            </Link>
          </p>
        </Section>

        {/* The second unit: chase cards, after the booster-box rail (a viewport and more below the sealed strip). */}
        <EbayStrip region={r.region} context="chase" placement="listings-home" className="mt-14" search={{ kind: "card", query: "" }} />

        <Section title="Elite Trainer Boxes in stock" kicker="Newest sets first" href={`/${r.region}/type/elite-trainer-boxes`}>
          {etbs.length ? (
            <ProductGrid products={etbs} region={r.region} />
          ) : (
            <Empty actions={[preorderLink, { href: `/${r.region}/type/elite-trainer-boxes`, label: "All ETBs" }, { href: `/${other.region}/type/elite-trainer-boxes`, label: `ETBs in ${other.inName}` }]}>
              No Elite Trainer Boxes in stock right now.
            </Empty>
          )}
        </Section>

        <HowItWorks r={r} stores={storeCount} />
        {/* The visitor's own recently viewed products, from this browser's storage: rendered at the end, so nothing above moves. */}
        <RecentlyViewed region={r.region} />

        {overview.products === 0 && (
          <div className="mt-10">
            <Empty actions={[{ href: `/${other.region}`, label: `DexCompare ${other.name}` }]}>We&rsquo;re still reading {r.adjective} stores for the first time. Check back shortly.</Empty>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Hot right now" (desktop hero): three products from the rails already loaded, no extra read. The newest set's headline pre-order
 * first, then the in-stock booster boxes of the owner's hot sets (lib/popular.ts HOT_SETS order: the sets the owner sees people buying),
 * then anything else the rails hold.
 */
function hotPicks(preorders: ProductCardData[], boxes: ProductCardData[]): ProductCardData[] {
  const rank = (p: ProductCardData) => hotRank(p.setCode);
  const pre = preorders.filter((p) => HEADLINE.includes(p.productType)).sort((a, b) => HEADLINE.indexOf(a.productType) - HEADLINE.indexOf(b.productType))[0];
  const hotBoxes = [...boxes].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1));
  const out: ProductCardData[] = [];
  for (const p of [pre, ...hotBoxes, ...preorders]) if (p && cardOpen(p) && !out.some((x) => x.slug === p.slug) && out.length < 3) out.push(p);
  return out;
}

function HotRow({ p, r }: { p: ProductCardData; r: RegionInfo }) {
  const img = thumb(p.imageUrl, 200);
  const pre = isPreorderSet(p.setCode);
  return (
    <Link
      href={`/${r.region}/p/${p.slug}`}
      prefetch={false}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 pr-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <span className="plate flex h-16 w-16 shrink-0 items-center justify-center">
        {img ? <img src={img} alt="" width={64} height={64} decoding="async" className="h-full w-full object-contain p-1" /> : <Icon name="tag" className="text-faint" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand">{p.name}</span>
        <span className="mt-0.5 block text-sm text-muted">
          From <span className="tabular font-display font-bold text-ink">{money(p.lowestPriceCents, r.market)}</span>
        </span>
      </span>
      <span className="shrink-0" title={stockLabel(p, pre)}>
        <StockPill state="open" preorder={pre}>
          {pre ? "Pre-order" : "In stock"}
        </StockPill>
      </span>
    </Link>
  );
}

/**
 * A latest-set card: its header links to the set (the logo, or, for a set with none yet, its booster box or ETB on a plate), and each
 * headline product is its own row linking to its page.
 */
function SetCard({ r, s, items: all }: { r: RegionInfo; s: PokemonSet; items: ProductCardData[] }) {
  const order = ["Booster Box", "Elite Trainer Box", "Booster Bundle"];
  const items = all
    .filter((p) => p.productType !== "Pokémon Center Elite Trainer Box")
    .sort((a, b) => order.indexOf(a.productType) - order.indexOf(b.productType))
    .slice(0, 3);
  const pre = isPreorderSet(s.code);
  const art = s.logo ? null : thumb(all.find((p) => p.imageUrl && (p.productType === "Booster Box" || p.productType === "Elite Trainer Box"))?.imageUrl, 200);
  return (
    <div className="card flex flex-col overflow-hidden">
      <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="group flex min-h-[4.5rem] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised sm:px-5">
        <span className="flex min-w-0 items-center gap-3">
          {s.logo ? (
            <img src={s.logo} alt="" width={96} height={40} className="h-10 w-24 shrink-0 object-contain" loading="lazy" decoding="async" />
          ) : art ? (
            <span className="plate flex h-12 w-12 shrink-0 items-center justify-center">
              <img src={art} alt="" width={48} height={48} className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
            </span>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-display font-bold text-brand-strong">{s.name.slice(0, 1)}</span>
          )}
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold leading-tight group-hover:text-brand">{s.name}</span>
            <span className="block text-xs text-faint">
              {pre ? "Releases" : "Released"} {formatRelease(s.releaseDate)}
            </span>
          </span>
        </span>
        {pre ? (
          <span className="shrink-0 rounded-full bg-pre-soft px-2.5 py-1 text-xs font-semibold text-pre">Pre-order</span>
        ) : (
          <Icon name="arrow-right" size={18} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        )}
      </Link>
      <ul className="divide-y divide-line border-t border-line">
        {items.length ? (
          items.map((p) => (
            <li key={p.slug}>
              <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised sm:px-5">
                <span className="text-muted">{p.productType}</span>
                <span className="tabular text-right font-semibold">
                  {cardOpen(p) ? (
                    <>
                      {money(p.lowestPriceCents, r.market)}
                      <span className="block text-xs font-normal text-faint sm:inline sm:text-sm">
                        <span className="hidden sm:inline"> · </span>
                        {stockLabel(p)}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint">Sold out</span>
                  )}
                </span>
              </Link>
            </li>
          ))
        ) : (
          <li>
            <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="flex min-h-11 items-center px-4 py-2.5 text-sm text-muted hover:bg-raised sm:px-5">
              See every {s.name} product
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

function HowItWorks({ r, stores }: { r: RegionInfo; stores: number }) {
  const steps: { icon: IconName; t: string; d: React.ReactNode }[] = [
    {
      icon: "store",
      t: "We read the stores",
      d: (
        <>
          Twice a day, the sealed Pokémon listings of{" "}
          <Link href={`/${r.region}/stores`} prefetch={false} className="font-medium text-brand-strong underline-offset-2 hover:underline">
            {plural(stores, `${r.adjective} store`)}
          </Link>
          {r.market === "US" ? " and TCGplayer’s sellers" : ""}, in {r.currency}.
        </>
      ),
    },
    { icon: "check", t: "You see who has it", d: "Every product page lists who carries it, in stock or sold out, cheapest in-stock price first." },
    { icon: "arrow-right", t: "You buy from the store", d: "Click through and buy on the store’s own page. No store pays to rank higher." },
  ];
  return (
    <section className="mt-16" aria-labelledby="how">
      <h2 id="how" className="font-display text-xl font-bold tracking-tight">
        How DexCompare works
      </h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.t} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
              <Icon name={s.icon} size={18} />
            </span>
            <div>
              <h3 className="font-display font-bold">{s.t}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
