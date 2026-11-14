import { WeeklyDropsBox } from "@/components/WeeklyDropsBox";
import { weeklyBoxLive } from "@/lib/weekly-box";
import { ALERT_SITE_KEY } from "@/lib/alert-feed";
import Link from "@/components/Link";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { RecentlyViewed } from "@/components/Recent";
import { NoPreFooter } from "@/components/Ebay";
import { ProductGrid } from "@/components/ProductGrid";
import { SearchBox } from "@/components/SearchBox";
import { Hero, HeroPill, riseAt, WaysIn, type Way } from "@/components/home/Hero";
import { RegionChips } from "@/components/RegionChips";
import { Empty, Section, type EmptyAction } from "@/components/Section";
import { Tabs, type Tab } from "@/components/Tabs";
import { Folds } from "@/components/Fold";
import { homeRails, regionOverview, tcgplayerTiles, type ProductCardData } from "@/lib/data";
import { InlineAds } from "@/components/InlineAds";
import { dealsCopy, dealsInMarket, nearestRegion } from "@/lib/deals";
import { cardOpen } from "@/lib/compact";
import { money, plural, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { FEATURE_MIN_USD_CENTS, featured as featuredByPrice, featureWorthy, priciestFirst } from "@/lib/feature-floor";
import { openPreorderGuides } from "@/lib/preorder-guides";
import { featureOrder, isPreorderSet, formatRelease } from "@/lib/release";
import { REGIONS, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { ogCardImage, pageMeta, regionAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { seoCopy, seoTitleText } from "@/lib/seo-titles";
import { SET_BY_CODE, SETS, type MtgSet } from "@/lib/sets";
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

/**
 * A region's home, the minimal look (owner, 2026-11-13: "we're making things too complicated … get rid of the products on the hero
 * … cull the features that we show"; DECISIONS.md, ported from DexCompare). Six blocks and no more: the hero (words, the search,
 * the regions, six ways in, never a product), ONE shelf of what is in stock with its lists behind tabs, the latest sets, the weekly
 * email, the page's one ad block, then the reading matter folded to a line each. What left the page is one click away in the
 * header's menus and the footer: the type chips, the "Coming soon" and sale cards (the next set's pre-order hub is the hero's one
 * pill and a tab of the shelf; the sale has the strip under the header), both eBay strips, the older-sets rows, the guides list,
 * "How MTG Compare works" (it is on /about) and the reviews.
 */
export default async function RegionHome({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const [{ boxes, etbs, preorders, latestSets: bySet }, overview, allDeals, report, setCounts, listedTypes, tcgTiles] = await Promise.all([
    homeRails(r.market),
    getOverview(r.market),
    dealsInMarket(r.market, { take: 24 }),
    // The written market report, moved here from the landing page (2026-10-25): this region's figures, folded under the products.
    loadHomeReport(r.region).catch(() => emptyHomeReport(r.region)),
    setCountsGrouped(r.market),
    typeLabelsInMarket(r.market),
    tcgplayerTiles({ take: 12, minCents: FEATURE_MIN_USD_CENTS }).catch(() => []),
  ]);
  // The soonest upcoming set with a pre-order page: the hero's pill and the pre-order tab's "see all" go there.
  const preorderGuide = openPreorderGuides()[0] ?? null;
  const storeCount = storesInMarket(r.market).length;
  // The newest released set leads, the set on pre-order second (release.ts featureOrder): a pre-order is never the first tile.
  const latestSets = featureOrder(SETS.filter((s) => bySet.has(s.code)).slice(0, 4).map((s) => s.code)).map((c) => SET_BY_CODE.get(c)!);
  // The deals and the pre-orders feature the dearer products (lib/feature-floor.ts, owner 2026-11-12): deals by the biggest saving
  // in money, so a $40 off a Collector box leads a $3 off a pack; the pre-orders keep every one only when none clears the floor.
  const deals = priciestFirst(allDeals.filter((p) => featureWorthy(p.lowestPriceCents, r.market)), r.market, (p) => (p.medianOpenCents ?? 0) - (p.lowestPriceCents ?? 0)).slice(0, 8);
  const preorderShelf = (() => {
    const top = featuredByPrice(preorders, r.market, (p) => p.lowestPriceCents, 8);
    return top.length ? top : preorders;
  })();
  const other = REGIONS[nearestRegion(r.region)];
  const preorderLink = { href: `/${r.region}/releases`, label: "Pre-orders" };
  // The hero's ways in: the six pages most visitors want next. Never products.
  const ways: Way[] = [
    { href: `/${r.region}/type/play-booster-boxes`, label: "Play booster boxes", icon: "box" },
    { href: `/${r.region}/type/collector-booster-boxes`, label: "Collector boxes", icon: "collector" },
    { href: `/${r.region}/type/commander-decks`, label: "Commander decks", icon: "deck" },
    { href: `/${r.region}/type/bundles`, label: "Bundles", icon: "bundle" },
    { href: `/${r.region}/deals`, label: "Deals", icon: "tag" },
    { href: `/${r.region}/sets`, label: "All sets", icon: "sets" },
  ];
  // The one shelf (components/Tabs.tsx): every list is server-rendered and stays in the HTML; a tab only chooses which is shown.
  const shelf: Tab[] = [
    {
      label: "Play booster boxes",
      panel: (
        <Shelf
          r={r}
          heading={`Play Booster Boxes in stock in ${r.inName}, newest sets first`}
          products={boxes}
          href={`/${r.region}/type/play-booster-boxes`}
          all="All Play Booster Boxes"
          empty="No booster boxes in stock right now."
          emptyActions={[preorderLink, { href: `/${other.region}/type/play-booster-boxes`, label: `Booster boxes in ${other.inName}` }]}
        />
      ),
    },
    {
      label: "Collector boxes",
      panel: (
        <Shelf
          r={r}
          heading={`Collector Booster Boxes in stock in ${r.inName}, newest sets first`}
          products={etbs}
          href={`/${r.region}/type/collector-booster-boxes`}
          all="All Collector Booster Boxes"
          empty="No Collector Booster Boxes in stock right now."
          emptyActions={[preorderLink, { href: `/${other.region}/type/collector-booster-boxes`, label: `Collector boxes in ${other.inName}` }]}
        />
      ),
    },
    ...(deals.length
      ? [
          {
            label: "Deals",
            panel: <Shelf r={r} heading={dealsCopy.rail} note={`${dealsCopy.railKicker} of the stores that have it in stock.`} products={deals} href={`/${r.region}/deals`} all="All deals" />,
          },
        ]
      : []),
    ...(preorderShelf.length
      ? [
          {
            label: "Pre-orders",
            panel: (
              <Shelf
                r={r}
                heading={`Open for pre-order in ${r.inName}`}
                products={preorderShelf}
                href={preorderGuide ? `/${r.region}/preorders/${preorderGuide.set.slug}` : `/${r.region}/releases`}
                all={preorderGuide ? `Compare ${preorderGuide.set.name} pre-orders` : "Release calendar"}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Hero>
        {/* Where the page sits (and its BreadcrumbList), out of the centred column's way: the hero's top left corner. */}
        <div className="hero-crumbs">
          <Breadcrumbs items={[{ href: "/", label: "MTG Compare" }, { label: r.name }]} />
        </div>
        {/* The one small line above the headline: the next set's pre-order hub while one is open (it was a card under the hero).
            The date is left out on a phone, where a long set name would wrap the pill. */}
        {preorderGuide && (
          <HeroPill href={`/${r.region}/preorders/${preorderGuide.set.slug}`}>
            <span className="min-w-0 truncate">
              <b>{preorderGuide.set.name}</b> pre-orders<span className="hidden sm:inline"> · out {formatRelease(preorderGuide.set.releaseDate)}</span>
            </span>
          </HeroPill>
        )}
        <h1 className="hero-h1 hero-h1-long rise-solid">
          Compare MTG booster box, bundle &amp; Commander deck prices in <span className="text-brand">{r.inName}</span>
        </h1>
        <p className="hero-sub rise" style={riseAt(1)}>
          Today&rsquo;s prices and stock from {plural(storeCount, `${r.adjective} store`)}
          {r.market === "US" && " and TCGplayer"}, cheapest first.
        </p>
        <div className="hero-search rise" style={riseAt(2)}>
          <SearchBox region={r.region} size="lg" />
        </div>
        <RegionChips region={r.region} className="rise mt-6 justify-center" style={riseAt(3)} />
        <WaysIn links={ways} label={`Popular pages in ${r.inName}`} />
        {/* One quiet line of facts (it was three chips). A live <time>: the page is cached for a day, so a fixed "3 hours ago" would freeze. */}
        <p className="hero-meta rise" style={riseAt(5)}>
          <span>
            <span className="live" aria-hidden="true" /> <b>{storeCount.toLocaleString("en")}</b> stores
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <b>{overview.inStock.toLocaleString("en")}</b> in stock
          </span>
          {/* On a phone the line breaks here: the dot would hang at the end of the first line, so it is only drawn where all three fit. */}
          <span aria-hidden="true" className="max-[479px]:hidden">
            ·
          </span>
          <span className="max-[479px]:basis-full">checked {overview.lastChecked ? <Ago iso={overview.lastChecked.toISOString()} initial={timeAgo(overview.lastChecked)} /> : "twice a day"}</span>
        </p>
      </Hero>

      {/* The page places its own ad block (below): none above the footer. */}
      <NoPreFooter />
      <div className="page">
        {overview.products === 0 ? (
          <div className="mt-10">
            <Empty actions={[{ href: `/${other.region}`, label: `MTG Compare ${other.name}` }]}>We&rsquo;re still reading {r.adjective} stores for the first time. Check back shortly.</Empty>
          </div>
        ) : (
          <Section title="In stock today" className="reveal mt-8 sm:mt-12">
            <Tabs tabs={shelf} label={`In stock in ${r.inName} today`} />
          </Section>
        )}

        {latestSets.length > 0 && (
          <Section title="Latest sets" href={`/${r.region}/sets`} linkLabel="All sets" className="reveal mt-16 sm:mt-24">
            {/* Two columns, not four: a Magic set's name and its "Play Booster Box from $179.99" line need the width. */}
            <ul className="grid gap-3 md:grid-cols-2">
              {latestSets.map((s) => (
                <li key={s.code} className="flex min-w-0">
                  <SetTile r={r} s={s} items={bySet.get(s.code) ?? []} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* The weekly price-drops email, one field (components/WeeklyDropsBox.tsx, 2026-11-12). */}
        {weeklyBoxLive() && <WeeklyDropsBox site={ALERT_SITE_KEY} region={r.market} siteName="MTG Compare" placement="home" className="reveal mx-auto mt-16 max-w-2xl sm:mt-24" buttonClassName="btn-primary min-h-11" />}

        {/* The page's one ad block (owner, 2026-11-13): real eBay listings and TCGplayer products, labelled, under everything the
            visitor came for. The two eBay strips that sat between the lists are gone with the lists' own sections. */}
        <InlineAds region={r.region} tiles={tcgTiles} className="reveal mt-16 sm:mt-24" />

        {/* The reading matter: in the HTML for a crawler and for find-in-page, one line each until opened (components/Fold.tsx). */}
        <Folds label={`More about Magic sealed prices in ${r.inName}`}>
          <MarketReport report={report} />
          {/* Every set listed here, so every set page is two clicks from the landing page and its products three (2026-10-25). */}
          <SetIndex r={r} counts={setCounts} types={listedTypes} />
        </Folds>
        {/* The visitor's own recently viewed products, from this browser's storage: rendered at the end, so nothing above moves. */}
        <RecentlyViewed region={r.region} />
      </div>
    </div>
  );
}

/** One list of the shelf: its products, then the way to all of them. The heading is for a screen reader's outline (the tab says it). */
function Shelf({
  r,
  heading,
  note,
  products,
  href,
  all,
  empty,
  emptyActions,
}: {
  r: RegionInfo;
  heading: string;
  note?: string;
  products: ProductCardData[];
  href: string;
  all: string;
  empty?: string;
  emptyActions?: EmptyAction[];
}) {
  return (
    <>
      <h3 className="sr-only">{heading}</h3>
      {note && <p className="-mt-1 mb-5 text-sm text-muted">{note}</p>}
      {products.length ? <ProductGrid products={products} region={r.region} /> : <Empty actions={emptyActions}>{empty}</Empty>}
      <p className="mt-8 flex justify-center sm:mt-10">
        <Link href={href} prefetch={false} className="btn-ghost min-h-11 px-5">
          {all} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}

/**
 * A latest set, as one tile: its logo (or, for a set with none yet, its booster box on a plate), its name and release date, and
 * what its headline product costs today. The whole tile is the link to the set's page, which lists every product.
 */
function SetTile({ r, s, items }: { r: RegionInfo; s: MtgSet; items: ProductCardData[] }) {
  const order = ["Play Booster Box", "Collector Booster Box", "Bundle"];
  const lead = items
    .filter((p) => cardOpen(p) && order.includes(p.productType))
    .sort((a, b) => order.indexOf(a.productType) - order.indexOf(b.productType))[0];
  const pre = isPreorderSet(s.code);
  const art = s.logo ? null : thumb(items.find((p) => p.imageUrl && (p.productType === "Play Booster Box" || p.productType === "Collector Booster Box"))?.imageUrl, 200);
  return (
    <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="set-tile group">
      {s.logo ? (
        <span className="set-tile-art">
          <img src={s.logo} alt={`${s.name} logo`} width={96} height={40} className="h-full w-full object-contain" loading="lazy" decoding="async" />
        </span>
      ) : art ? (
        <span className="set-tile-art plate">
          <img src={art} alt={s.name} width={56} height={56} className="h-full w-full object-contain p-1 mix-blend-multiply" loading="lazy" decoding="async" />
        </span>
      ) : (
        <span className="set-tile-art bg-brand-soft font-display text-lg font-bold text-brand-strong">{s.name.slice(0, 1)}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-display text-base font-bold leading-tight transition-colors group-hover:text-brand">{s.name}</span>
        <span className="mt-0.5 block text-xs text-faint">
          {pre ? "Releases" : "Released"} {formatRelease(s.releaseDate)}
        </span>
        {lead && (
          // The type may be cut short on a narrow phone; the price never is. The space is for a reader of the text: a flex row draws none.
          <span className="mt-1 flex min-w-0 items-baseline gap-1 text-sm text-muted">
            <span className="truncate">{lead.productType} from</span>{" "}
            <b className="tabular shrink-0 font-semibold text-ink">{money(lead.lowestPriceCents, r.market)}</b>
          </span>
        )}
      </span>
    </Link>
  );
}
