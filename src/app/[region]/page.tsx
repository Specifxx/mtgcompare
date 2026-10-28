import Link from "@/components/Link";
import { inSeason } from "@/lib/black-friday";
import { ComingSoon } from "@/components/ComingSoon";
import { loadFeatured } from "@/lib/coming-soon-data";
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
import { homeRails, regionOverview, tcgplayerTiles, type ProductCardData } from "@/lib/data";
import { TcgplayerStrip } from "@/components/TcgplayerStrip";
import { dealsCopy, dealsInMarket, nearestRegion, stockLabel } from "@/lib/deals";
import { cardOpen } from "@/lib/compact";
import { money, plural, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { hotPicks } from "@/lib/hot-picks";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { openPreorderGuides } from "@/lib/preorder-guides";
import { featureOrder, featureSort, isPreorderSet, formatRelease } from "@/lib/release";
import { REGIONS, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { ogCardImage, pageMeta, regionAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { fitDescription, seoCopy, seoTitleText } from "@/lib/seo-titles";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { SET_BY_CODE, SETS, type MtgSet } from "@/lib/sets";
import { stockHeadline } from "@/lib/stock";
import { olderInStockData } from "@/lib/stock-data";
import { StockRow } from "@/components/StockRow";
import { storesInMarket } from "@/lib/stores";
import { emptyHomeReport, loadHomeReport } from "@/lib/home-report";
import { MarketReport } from "@/components/home/MarketReport";
import { SetIndex } from "@/components/SetIndex";
import { setCountsGrouped, typeLabelsInMarket } from "@/lib/hub-data";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

// The overview's counts go into the description ("1,591 in stock today") and the hero's trust line: one read, shared.
const getOverview = cache((market: Market) => regionOverview(market));

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const n = storesInMarket(r.market).length;
  const overview = await getOverview(r.market);
  const title = seoCopy.homeTitle(r, n);
  const meta = pageMeta({
    title: seoTitleText(title),
    description: seoCopy.homeDescription(r, n, overview.inStock),
    path: `/${r.region}`,
    alternates: regionAlternates(r.region, ""),
  });
  return {
    ...meta,
    title,
    // The region's own share card (app/og/[region]): what a link to /au or /us shows on Reddit, Discord or X.
    openGraph: { ...meta.openGraph, images: [ogCardImage(`/og/${r.region}`, `MTG Compare: Magic sealed prices across ${n} ${r.adjective} stores`)] },
  };
}

const QUICK_TYPES = ["play-booster-boxes", "collector-booster-boxes", "bundles", "commander-decks", "prerelease-packs", "secret-lair", "play-booster-packs", "starter-kits"];

export default async function RegionHome({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const [{ boxes, etbs, preorders, latestSets: bySet }, overview, deals, report, older, featured, setCounts, listedTypes, tcgTiles] = await Promise.all([
    homeRails(r.market),
    getOverview(r.market),
    dealsInMarket(r.market, { take: 8 }),
    // The written market report, moved here from the landing page (2026-10-25): this region's figures, after the rails.
    loadHomeReport(r.region).catch(() => emptyHomeReport(r.region)),
    olderInStockData(r.market).catch(() => []),
    loadFeatured(r.region).catch(() => null),
    setCountsGrouped(r.market),
    typeLabelsInMarket(r.market),
    tcgplayerTiles({ take: 12 }).catch(() => []),
  ]);
  // The soonest upcoming set with a pre-order page: the rail's "see all" goes there.
  const preorderGuide = openPreorderGuides()[0] ?? null;
  const storeCount = storesInMarket(r.market).length;
  // The newest released set leads, the set on pre-order second (release.ts featureOrder): a pre-order is never the top card.
  const latestSets = featureOrder(SETS.filter((s) => bySet.has(s.code)).slice(0, 4).map((s) => s.code)).map((c) => SET_BY_CODE.get(c)!);
  // The first hot set that is out, in featuring order (lib/popular.ts hotSetsByFeature: the newest release first), gets the sealed strip's highlighted
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
            <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { label: r.name }]} />
            <div className="eyebrow">
              <span aria-hidden="true">{r.flag}</span> {r.name} · prices in {r.currency}
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Compare MTG booster box, bundle &amp; Commander deck prices in <span className="text-brand">{r.inName}</span>
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
              <Link href={`/${r.region}/back-in-stock`} prefetch={false} className="chip min-h-10 border-open/30 bg-open-soft font-semibold text-open hover:border-open/60">
                <Icon name="check" size={16} /> Back in stock
              </Link>
              <Link href={`/${r.region}/out-of-print`} prefetch={false} className="chip min-h-10">
                Older sets in stock
              </Link>
              <Link href={`/${r.region}/price-moves`} prefetch={false} className="chip min-h-10">
                Price moves
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
        {/* The next set, when there is one (lib/coming-soon.ts): its headline pre-orders here and its hub; gone on release day. */}
        <div className="mt-8 grid gap-3">
          <ComingSoon featured={featured} r={r} today={new Date().toISOString().slice(0, 10)} />
          {inSeason(new Date().toISOString().slice(0, 10)) && (
            <Link
              href={`/${r.region}/black-friday`}
              prefetch={false}
              className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-shadow hover:shadow-lift"
            >
              <span>
                <span className="font-display text-lg font-bold">Black Friday deals in {r.inName}</span>
                <span className="block text-sm text-muted">Every product furthest under the median store price today, biggest gap first.</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-brand-strong">See the deals →</span>
            </Link>
          )}
        </div>
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

        <Section title="Booster boxes in stock" kicker="Newest sets first" href={`/${r.region}/type/play-booster-boxes`}>
          {boxes.length ? (
            <ProductGrid products={boxes} region={r.region} />
          ) : (
            <Empty actions={[preorderLink, { href: `/${r.region}/type/play-booster-boxes`, label: "All booster boxes" }, { href: `/${other.region}/type/play-booster-boxes`, label: `Booster boxes in ${other.inName}` }]}>
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
        <EbayStrip region={r.region} context="chase" placement="listings-home" className="mt-14" search={{ kind: "sealed", query: "collector booster box" }} />

        <Section title="Collector Booster Boxes in stock" kicker="Newest sets first" href={`/${r.region}/type/collector-booster-boxes`}>
          {etbs.length ? (
            <ProductGrid products={etbs} region={r.region} />
          ) : (
            <Empty actions={[preorderLink, { href: `/${r.region}/type/collector-booster-boxes`, label: "All Collector boxes" }, { href: `/${other.region}/type/collector-booster-boxes`, label: `Collector boxes in ${other.inName}` }]}>
              No Collector Booster Boxes in stock right now.
            </Empty>
          )}
        </Section>

        {/* Real sealed products on TCGplayer (2026-10-28), after the Collector rail: well below the comparison above it. */}
        <TcgplayerStrip tiles={tcgTiles} region={r.region} placement="tcgplayer-strip-home" title="Magic sealed on TCGplayer" className="mt-14" />

        {older.length > 0 && (
          <Section title="Older sets still in stock" kicker="Released 18+ months ago" href={`/${r.region}/out-of-print`} linkLabel="All older sets in stock">
            <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">
              Boxes, bundles and Commander decks from older sets that {r.adjective} stores, often local game stores, still have on the shelf. Today&rsquo;s stock and price only; older product&rsquo;s prices can move.
            </p>
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              {older.slice(0, 4).map((g) => (
                <li key={g.set.code}>
                  <StockRow p={g.items[0]} r={r} />
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Every set listed here, so every set page is two clicks from the landing page and its products three (2026-10-25). */}
        <SetIndex r={r} counts={setCounts} types={listedTypes} />
        <HowItWorks r={r} stores={storeCount} />
        {/* The visitor's own recently viewed products, from this browser's storage: rendered at the end, so nothing above moves. */}
        <RecentlyViewed region={r.region} />

        {overview.products === 0 && (
          <div className="mt-10">
            <Empty actions={[{ href: `/${other.region}`, label: `MTG Compare ${other.name}` }]}>We&rsquo;re still reading {r.adjective} stores for the first time. Check back shortly.</Empty>
          </div>
        )}
      </div>
      <div className="mb-4">
        <MarketReport report={report} />
      </div>
    </div>
  );
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
        {/* stock first, then the price */}
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5" title={stockLabel(p, pre)}>
          <StockPill state="open" preorder={pre} size="sm">
            {stockHeadline(p, pre).text}
          </StockPill>
          {p.inStockStores > 0 && p.marketplaceOpen && <span className="text-[11px] font-medium text-muted">+ TCGplayer</span>}
        </span>
        <span className="mt-0.5 block text-sm text-muted">
          From <span className="tabular font-display font-bold text-ink">{money(p.lowestPriceCents, r.market)}</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * A latest-set card: its header links to the set (the logo, or, for a set with none yet, its booster box on a plate), and each
 * headline product is its own row linking to its page.
 */
function SetCard({ r, s, items: all }: { r: RegionInfo; s: MtgSet; items: ProductCardData[] }) {
  const order = ["Play Booster Box", "Collector Booster Box", "Bundle"];
  const items = all
    .filter((p) => p.productType !== "Pokémon Center Collector Booster Box")
    .sort((a, b) => order.indexOf(a.productType) - order.indexOf(b.productType))
    .slice(0, 3);
  const pre = isPreorderSet(s.code);
  const art = s.logo ? null : thumb(all.find((p) => p.imageUrl && (p.productType === "Play Booster Box" || p.productType === "Collector Booster Box"))?.imageUrl, 200);
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
                      <span className="block text-xs font-semibold text-open sm:inline sm:text-sm">
                        {stockLabel(p)}
                        <span className="hidden sm:inline font-normal text-faint"> · </span>
                      </span>
                      {money(p.lowestPriceCents, r.market)}
                    </>
                  ) : (
                    <span className="text-faint">{stockHeadline(p).text}</span>
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
          Twice a day, the sealed Magic listings of{" "}
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
        How MTG Compare works
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
