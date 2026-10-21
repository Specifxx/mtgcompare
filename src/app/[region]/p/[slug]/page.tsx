import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { hotProductHighlight, isHotReleased, NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { marketplaceOf } from "@/lib/ebay-context";
import { ebayQuery, MarketplacePanel, SoldOutCallout } from "@/components/Marketplaces";
import { OfferTable } from "@/components/OfferTable";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail } from "@/components/ProductRail";
import { Section } from "@/components/Section";
import { BestPriceCard } from "@/components/BestPriceCard";
import { ShareButton } from "@/components/ShareButton";
import { StickyBuyBar } from "@/components/StickyBuyBar";
import { RecentTracker } from "@/components/Recent";
import { ebaySearchUrl, offerLink, offerRetailer } from "@/lib/affiliate";
import { productAdPlan, soldOutAdPlan } from "@/lib/ebay-ads";
import { rowPacks, tableShape } from "@/lib/ebay-offer-row";
import { comparable, productPage, type ProductCardData } from "@/lib/data";
import { plural, timeAgo } from "@/lib/format";
import { thumb } from "@/lib/images";
import { packsFor } from "@/lib/packs";
import { cheapestPerPackByType } from "@/lib/per-pack";
import { openWhere, productDescription, productTitle, quickFacts, releaseChip, valueCheck } from "@/lib/product-copy";
import { inStockAlternatives, relatedWithFormats } from "@/lib/product-data";
import { isPreorderSet } from "@/lib/release";
import { regionOrNotFound, REGION_LIST, type Market, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE, usMsrpCents } from "@/lib/rrp";
import { RIFT_REL, riftHistoryHref } from "@/lib/riftcompare";
import { offerStock } from "@/lib/sealed-offers";
import { TYPE_BY_LABEL } from "@/lib/sealed-title";
import { jsonLd, pageMeta, productJsonLd, regionAlternates, withPokemon } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

const getPage = cache((slug: string, market: Market) => productPage(slug, market));
// The same-set read (take 40), shared by the title's value check and the page: one query per render.
const getRelated = cache((market: Market, setCode: string, slug: string) => relatedWithFormats(market, setCode, slug));

/**
 * The product in this region, or a 404: unknown slug, or a product nothing in
 * this region lists (no ProductStat row and no offers). The old thin "Not
 * listed here yet" page is gone; the region chips on a real page still lead
 * to wherever it is listed. The stats are already fetched, so this costs nothing.
 */
async function load(slug: string, r: RegionInfo) {
  const p = await getPage(slug, r.market);
  if (!p) notFound();
  const here = p.stats.find((s) => s.market === r.market) ?? null;
  if (!here && !p.offers.length) notFound();
  return { p, here };
}

type Loaded = Awaited<ReturnType<typeof load>>;

/**
 * The value check (lib/product-copy.ts): this product's price per pack against the set's other formats today, from the same-set rows
 * (and this product, as its card would read). Null without a set, a fixed pack count, or an open price.
 */
function valueOf({ p, here }: Loaded, r: RegionInfo, related: ProductCardData[], bestCents: number | null) {
  const type = TYPE_BY_LABEL.get(p.productType);
  const set = p.setCode ? SET_BY_CODE.get(p.setCode) : null;
  const packs = type ? packsFor(type.key, p.setCode, p.name) : null;
  if (!set || !packs || bestCents == null) return null;
  const self: ProductCardData = {
    slug: p.slug,
    name: p.name,
    productType: p.productType,
    setCode: p.setCode,
    imageUrl: p.imageUrl,
    lowestPriceCents: bestCents,
    inStockStores: Math.max(1, here?.inStockStores ?? 0),
    listedStores: here?.listedStores ?? 0,
    marketplaceOpen: here?.marketplaceOpen ?? false,
    medianOpenCents: here?.medianOpenCents ?? null,
    releaseDate: set.releaseDate,
  };
  return valueCheck({
    slug: p.slug,
    productType: p.productType,
    perPack: Math.round(bestCents / packs),
    setName: set.name,
    market: r.market,
    inName: r.inName,
    region: r.region,
    picks: cheapestPerPackByType([self, ...related]),
  });
}

export async function generateMetadata({ params }: { params: { region: string; slug: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const loaded = await load(params.slug, r);
  const { p } = loaded;
  const open = p.offers.filter((o) => offerStock(o) === "open");
  const cheapest = open[0];
  const where = cheapest ? openWhere(open, `${r.adjective} store`) : null;
  const related = p.setCode ? await getRelated(r.market, p.setCode, p.slug) : [];
  const value = valueOf(loaded, r, related, cheapest?.priceCents ?? null);
  const desc = productDescription({
    name: p.name,
    market: r.market,
    adjective: r.adjective,
    cheapestCents: cheapest?.priceCents ?? null,
    where,
    preorder: isPreorderSet(p.setCode),
    value,
  });
  // Thin pages stay reachable but out of the index: nothing to compare (one
  // store, sold out). A noindex page carries no hreflang set either, and the
  // set only names the regional copies that are themselves indexable.
  const noindex = open.length === 0 && p.offers.length < 2;
  const path = `/${r.region}/p/${p.slug}`;
  const indexable = REGION_LIST.filter((x) => {
    if (x.region === r.region) return !noindex;
    const s = p.stats.find((st) => st.market === x.market);
    return !!s && comparable(s);
  });
  const image = thumb(p.imageUrl, 1200);
  const title = productTitle({ name: p.name, market: r.market, inName: r.inName, cheapestCents: cheapest?.priceCents ?? null, where });
  const plainTitle = typeof title === "string" ? title : title.absolute;
  const meta = pageMeta({
    title: plainTitle,
    description: desc,
    path,
    alternates: noindex ? undefined : regionAlternates(r.region, `/p/${p.slug}`, indexable),
    image,
    noindex,
  });
  // The product's own tags through `other` (Next's openGraph union has no
  // product type): og:type and the price a crawler can quote. Next 14 writes
  // `other` as <meta name=…>, not property=, so the standard og:type=website
  // stays as well. Shopify's CDN scales to the width asked for and keeps the
  // aspect ratio, so only the width is known; TCGplayer's renditions are square.
  const square = image?.includes("tcgplayer-cdn.tcgplayer.com");
  return {
    ...meta,
    // " | DexCompare" only where the whole title still fits in 65 characters (title.absolute otherwise)
    title,
    openGraph: {
      ...meta.openGraph,
      ...(image ? { images: [{ url: image, width: 1200, ...(square ? { height: 1200 } : {}), alt: p.name }] } : {}),
    },
    other: {
      "og:type": "product",
      ...(cheapest ? { "product:price:amount": (cheapest.priceCents / 100).toFixed(2), "product:price:currency": r.currency } : {}),
    },
  };
}

// A 1×1 transparent GIF: the <source> a <picture> uses where its image is not shown (the big photo on a phone, the thumbnail on a
// desktop), so each screen downloads only the photo it shows.
const NOTHING = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export default async function ProductPage({ params }: { params: { region: string; slug: string } }) {
  const r = regionOrNotFound(params.region);
  const loaded = await load(params.slug, r);
  const { p, here } = loaded;

  const set = p.setCode ? SET_BY_CODE.get(p.setCode) : null;
  const type = TYPE_BY_LABEL.get(p.productType);
  const pre = isPreorderSet(p.setCode);
  const now = Date.now();
  const open = p.offers.filter((o) => offerStock(o, now) === "open");
  const best = open[0] ?? null;
  const bestLink = best ? offerLink(best.store, best.url, r.region, "product-best") : null;
  const stores = p.offers.filter((o) => !o.marketplace);
  const openStores = open.filter((o) => !o.marketplace).length;
  const tcgOpen = open.some((o) => o.marketplace);
  const tableTitle = !p.offers.length
    ? `Not listed in ${r.name} yet`
    : stores.length
      ? `Prices at ${plural(stores.length, "store")}${stores.length < p.offers.length ? " + TCGplayer" : ""} in ${r.name}`
      : `Prices on TCGplayer in ${r.name}`;
  // TCGplayer: in the US one of the offers; elsewhere the separate US$ offer.
  const tcgplayer = p.offers.find((o) => o.marketplace) ?? p.usMarketplace;
  // The same-set read, all of it (take 40): the value check reads every format, the grid shows eight.
  const related = p.setCode ? await getRelated(r.market, p.setCode, p.slug) : [];
  const grid = set ? related.slice(0, 8) : [];
  // In-stock products of the type: "In stock instead" on a sold-out page, "More <type> in <region>" on an in-stock one with no set.
  // The page's one new read (LIMIT 4; the headline types' cheapest when the type has none open).
  const alternatives = !best || !p.setCode ? await inStockAlternatives(r.market, p.productType, p.setCode, p.slug) : [];
  const elsewhere = REGION_LIST.filter((x) => x.region !== r.region)
    .map((x) => ({ x, s: p.stats.find((s) => s.market === x.market) }))
    .filter((e) => !!e.s); // a stat row exists only where a store or TCGplayer lists it

  // eBay units on this page (components/Ebay.tsx, Marketplaces.tsx, EbayStrip.tsx), one per phone screen at most:
  //   • IN STOCK: the marketplace panel under the best-price card (the first-screen unit; its eBay row shows the product's own new
  //     listing when the card does not), then the product's own listings as an image strip after the price table and the facts, where
  //     that is a screen below the panel, else at the bottom of the page in place of the pre-footer strip (productAdPlan).
  //   • SOLD OUT: the callout's eBay box (the first-screen unit: the search, or the product's own new listing with its price), then the
  //     strip after the table and the in-stock alternatives, or at the bottom, at least GAP below the box (soldOutAdPlan).
  //   Both plans also keep the units under a quarter of the page (the collapsed table makes pages shorter): often that means no
  //   pre-footer strip on a product page now.
  //   • The phone buy bar (StickyBuyBar) repeats the top of the page and hides whenever any of these is in view.
  // EVERY product asks for its own listings: the daily catalogue sweep (lib/ebay-sweep.ts) gives an item feed to every product it finds on
  // eBay; where it found fewer than two, the route answers with the type's listings, then (for box-class types only) generic sealed.
  const shape = tableShape(p.offers.length, open.length, p.offers.length > 0);
  const stripContext = `item:${p.slug}`;
  // The eBay row of the price table skips a listing under 40% of the cheapest store price, when the store prices are in the eBay site's
  // currency (not NZ or SG, served the AU and US sites): such a listing is a part of the product or a single card, not the product. The
  // price is the cheapest IN-STOCK store's, the rows the listing is ranked among (a sold-out or stale price can be far below what the
  // product sells for now); any store's when none is in stock.
  const cheapestCents = best?.priceCents ?? p.offers.reduce<number | null>((m, o) => (m == null || o.priceCents < m ? o.priceCents : m), null);
  // NZ and SG are served the AU and US sites, in A$ and US$: their eBay listings are never compared with the stores' prices.
  const ebayComparable = marketplaceOf(r.region).currency === r.currency;
  // The eBay listing may be the best price (BestPriceCard, the table's badge) where it is comparable and the product is not a pre-order:
  // an eBay listing of an unreleased product is a seller's pre-sale. The same rule decides where an eBay PRICE may show at all (the
  // panel's row, the sold-out box, the buy bar): elsewhere they stay eBay searches.
  const ebayBest = ebayComparable && !pre;
  const ebayFloor = cheapestCents != null && ebayComparable ? { value: (cheapestCents * 0.4) / 100, currency: r.currency } : null;
  // Price signals beside the best price, each a fact about the current listings: per pack (when the product line fixes a pack count),
  // the median of the in-stock stores (from ProductStat, null under two stores), and in the US TPCi's published MSRP. Nothing is history.
  const packs = type ? packsFor(type.key, p.setCode, p.name) : null;
  const median = here?.medianOpenCents ?? null;
  const medianStores = here?.inStockStores ?? 0;
  const msrp = r.market === "US" && type ? usMsrpCents(type.key, p.setCode) : null;
  // The table's eBay pick, for every other place that may show the same listing (the panel, the sold-out box, the buy bar): the same
  // arguments, so the same single request.
  const ebayPick = ebayBest ? { slug: p.slug, floor: ebayFloor, packs: rowPacks(type?.key, packs) } : null;
  // A product of one of the owner's hot sets (lib/popular.ts: 30th Celebration first), once the set is out: the panel carries a "Popular
  // set" chip, and the strip the highlighted "Shop <product> on eBay" button. Where the strip goes is the plan's call as for any product.
  const hot = isHotReleased(p.setCode);
  const ebayQ = ebayQuery(p.name, tcgplayer);

  const plan = best
    ? productAdPlan({ offerRows: p.offers.length, summaries: shape.summaries, elsewhere: elsewhere.length, related: grid.length, rail: p.setCode ? 0 : alternatives.length })
    : null;
  const soldPlan = best ? null : soldOutAdPlan({ visibleRows: shape.visible, summaries: shape.summaries, alternatives: alternatives.length, elsewhere: elsewhere.length, related: grid.length });
  const stripAt: "table" | "bottom" | null = plan ? (plan.tableGroup ? "table" : plan.preFooter ? "bottom" : null) : soldPlan!.strip;
  const preFooter = plan ? plan.preFooter : soldPlan!.preFooter;
  const strip = stripAt && (
    <EbayStrip
      region={r.region}
      context={stripContext}
      placement={best ? "listings-product" : "listings-product-soldout"}
      className="mt-14"
      headings={{ item: `${p.name} on eBay`, type: type ? `${type.plural} on eBay` : undefined, sealed: "Sealed Pokémon on eBay" }}
      search={{ kind: "sealed", query: ebayQ, label: "Search this product on eBay" }}
      highlight={hot ? hotProductHighlight(p.name, ebayQ) : undefined}
    />
  );

  const value = valueOf(loaded, r, related, best?.priceCents ?? null);
  const facts = quickFacts({
    market: r.market,
    inName: r.inName,
    adjective: r.adjective,
    packs: packs,
    release: set ? { date: set.releaseDate, preorder: pre } : null,
    cheapest: best ? { cents: best.priceCents, storeName: best.storeName, marketplace: best.marketplace, lastSeen: best.lastSeen } : null,
    openStores,
    storeCount: stores.length,
    tcgOpen,
    msrp,
    elsewhere: elsewhere.map(({ x, s }) => ({ region: x.region, name: x.inName.replace(/^the /, ""), flag: x.flag, inName: x.inName, market: x.market, lowestPriceCents: s!.lowestPriceCents, open: s!.inStockStores > 0 || s!.marketplaceOpen })),
  });
  // The explanations that used to sit under the card, now first in the table's "How these prices work".
  const notes = [
    p.offers.some((o) => o.marketplace)
      ? "Prices exclude shipping. TCGplayer’s is one seller’s listing when we last checked; check it, or the store, before you buy."
      : "Store prices exclude shipping; check the store before you buy.",
    ...(ebayBest && best ? ["An eBay listing shown as the best price is one seller’s, imported from eBay on a schedule; its shipping is beside its price, and eBay’s page is final."] : []),
    ...(packs != null ? ["Per-pack prices are the listed price divided by the packs the product holds."] : []),
    ...(msrp != null ? [RRP_NOTE] : []),
  ];

  const ld = open.length
    ? productJsonLd({
        name: p.name,
        path: `/${r.region}/p/${p.slug}`,
        image: p.imageUrl,
        productType: p.productType,
        setName: set?.name,
        currency: r.currency,
        lowCents: open[0].priceCents,
        highCents: open[open.length - 1].priceCents,
        offerCount: open.length,
        preorder: pre,
        // the value check's own sentence when it is about this product; else the page's description (facts only, never eBay's)
        description:
          value && !value.href
            ? `${value.text}.`
            : productDescription({ name: p.name, market: r.market, adjective: r.adjective, cheapestCents: open[0].priceCents, where: openWhere(open, `${r.adjective} store`), preorder: pre, value: null }),
      })
    : null;

  const heading = withPokemon(p.name);
  const riftHref = riftHistoryHref({ imageUrl: p.imageUrl, setReleaseDate: set?.releaseDate, productType: p.productType, name: p.name });
  const typeLink = type ? { href: `/${r.region}/type/${type.slug}`, label: `See ${type.plural} in stock in ${r.inName}` } : { href: `/${r.region}/sealed`, label: `See sealed products in stock in ${r.inName}` };
  const chip = "rounded-full bg-raised px-2.5 py-1 text-xs font-semibold leading-4 text-muted";
  const img = p.imageUrl ? { big: thumb(p.imageUrl, 900)!, small: thumb(p.imageUrl, 240)! } : null;

  // "Quick facts": the value check, then short facts side by side, then the cheapest offer, the stock, and the other regions as links.
  // In stock it comes before the strip (between the panel and it); sold out, after it (the order the brief sets: strip, other regions).
  const factsCard = (
    <section id="facts" aria-labelledby="facts-h" className="mt-14">
      <div className="card overflow-hidden">
        <h2 id="facts-h" className="eyebrow border-b border-line bg-raised px-5 py-2.5 sm:px-6">
          Quick facts
        </h2>
        {value && (
          <p className="flex gap-2.5 border-b border-line bg-open-soft/50 px-5 py-3.5 text-sm leading-6 sm:px-6">
            <Icon name="tag" size={16} className="mt-1 shrink-0 text-open" />
            <span>
              <b className="font-semibold text-open">Value check: </b>
              {value.href ? (
                <Link href={value.href} prefetch={false} className="font-semibold underline decoration-open/50 underline-offset-2 hover:decoration-open">
                  {value.text} →
                </Link>
              ) : (
                <>{value.text}.</>
              )}
            </span>
          </p>
        )}
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3.5 p-5 sm:gap-x-6 sm:p-6">
          {facts.map((f) => (
            <div key={f.term} className={f.short ? "min-w-0" : "col-span-full min-w-0"}>
              <dt className="text-xs text-muted">{f.term}</dt>
              <dd className="mt-0.5 text-sm font-medium leading-5">
                {f.regions ? (
                  // one set of classes on the list for its six tiles (a tile: the flag, the region, its from-price)
                  <ul className="mt-1.5 grid grid-cols-2 gap-2 font-normal sm:grid-cols-3 lg:grid-cols-6 [&_a:hover]:border-ink/30 [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-lg [&_a]:border [&_a]:border-line [&_a]:px-3 [&_a]:py-1.5 [&_b]:block [&_b]:truncate [&_b]:font-medium [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-muted">
                    {f.regions.map((g) => (
                      <li key={g.region} className="min-w-0">
                        <Link href={`/${g.region}/p/${p.slug}`} prefetch={false}>
                          <span aria-hidden="true">{g.flag}</span>
                          <span className="min-w-0">
                            <b>{g.name}</b>
                            <small className="tabular">{g.text}</small>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {f.text}
                    {f.checked && (
                      <>
                        {" "}
                        <Ago iso={f.checked} initial={timeAgo(f.checked, now)} />
                      </>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );

  return (
    <div className="page pb-8 pt-4 sm:pt-8">
      {!preFooter && <NoPreFooter />}
      <Breadcrumbs
        items={[
          { href: `/${r.region}`, label: r.name },
          ...(type ? [{ href: `/${r.region}/type/${type.slug}`, label: type.plural }] : []),
          ...(set ? [{ href: `/${r.region}/sets/${set.slug}`, label: set.name }] : []),
          { label: p.name },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        {/* The big photo: desktops only (a phone gets the thumbnail beside the name, so the price is in the first screen). */}
        <div className="card relative hidden aspect-square items-center justify-center overflow-hidden bg-raised lg:sticky lg:top-[calc(var(--hdr)+1.5rem)] lg:flex">
          {img ? (
            <picture>
              <source media="(max-width: 1023.98px)" srcSet={NOTHING} />
              <img src={img.big} alt={p.name} width={900} height={900} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-contain p-8" />
            </picture>
          ) : (
            <span className="font-display text-2xl font-bold text-faint">{p.productType}</span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-start gap-4">
            {img && (
              <div className="plate flex h-24 w-24 shrink-0 items-center justify-center p-1.5 lg:hidden">
                <picture>
                  <source media="(min-width: 1024px)" srcSet={NOTHING} />
                  <img src={img.small} alt={p.name} width={96} height={96} fetchPriority="high" decoding="async" className="h-[84px] w-[84px] object-contain" />
                </picture>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={chip}>{p.productType}</span>
                {set && (
                  <Link
                    href={`/${r.region}/sets/${set.slug}`}
                    prefetch={false}
                    className={`${chip} relative hover:text-ink after:absolute after:-inset-x-0.5 after:-inset-y-2 after:content-['']`}
                  >
                    <span className="hidden sm:inline">{set.series} · </span>
                    {set.name}
                  </Link>
                )}
                {set && <span className={pre ? "rounded-full bg-pre-soft px-2.5 py-1 text-xs font-semibold leading-4 text-pre" : chip}>{releaseChip(set.releaseDate, pre)}</span>}
                {packs != null && <span className={`${chip} hidden sm:inline`}>{plural(packs, "booster pack")}</span>}
              </div>
              <div className="mt-2">
                <ShareButton title={heading} path={`/${r.region}/p/${p.slug}`} kind="product" className="float-right -mt-1 ml-2" />
                <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">{heading}</h1>
              </div>
            </div>
          </div>

          {best && bestLink ? (
            <>
              {/* The best price: the cheapest store's, or the product's eBay listing when that is cheaper (BestPriceCard, in the browser). */}
              <div id="best" className="mt-4">
                <BestPriceCard
                  region={r.region}
                  market={r.market}
                  adjective={r.adjective}
                  preorder={pre}
                  store={{
                    cents: best.priceCents,
                    where: `${best.marketplace ? "on" : "at"} ${best.storeName}`,
                    marketplace: best.marketplace,
                    href: bestLink.href,
                    rel: bestLink.rel,
                    sponsored: bestLink.sponsored,
                    retailer: offerRetailer(best.store, best.storeName, r.market),
                    button: best.marketplace ? `Buy on ${best.storeName}` : `Go to ${best.storeName}`,
                  }}
                  packs={packs}
                  median={median}
                  medianStores={medianStores}
                  msrp={msrp}
                  openStores={openStores}
                  storeCount={stores.length}
                  tcgOpen={tcgOpen}
                  openCount={open.length}
                  highestOpenCents={open[open.length - 1].priceCents}
                  ebay={ebayBest ? { slug: p.slug, floor: ebayFloor, packs: rowPacks(type?.key, packs) } : null}
                />
              </div>
              <CompareLink n={p.offers.length} />
              <MarketplacePanel
                region={r.region}
                productName={p.name}
                preorder={pre}
                tcgplayer={tcgplayer}
                tcgplayerIsBest={best.marketplace && !ebayBest /* when the card may turn to eBay, TCGplayer keeps its row here */}
                popular={hot}
                pick={ebayPick}
                storeCents={best.priceCents}
              />
            </>
          ) : (
            <>
              <div id="soldout" className="mt-4">
                <SoldOutCallout
                  region={r.region}
                  productName={p.name}
                  storesListing={stores.length}
                  notChecked={stores.filter((o) => offerStock(o, now) === "unknown").length}
                  tcgplayer={tcgplayer}
                  ebayQuery={ebayQ}
                  pick={ebayPick}
                  instead={typeLink}
                />
              </div>
              {p.offers.length > 0 && <CompareLink n={p.offers.length} soldOut />}
            </>
          )}
        </div>
      </div>

      <Section id="prices" title={tableTitle}>
        {p.offers.length ? (
          // eBay is one of the websites compared: the product's cheapest own eBay listing is a row of the table, ranked by price (an ad, tinted).
          <OfferTable offers={p.offers} region={r.region} preorder={pre} packs={packs} ebay={{ slug: p.slug, query: ebayQ, floor: ebayFloor, packs: rowPacks(type?.key, packs) }} notes={notes} />
        ) : (
          <div className="card px-6 py-8 text-muted">
            None of the {r.adjective} stores we track list {p.name} right now.
          </div>
        )}
        {riftHref && (
          // The owner's other Pokémon site keeps what this one does not: TCGplayer's market price over time (lib/riftcompare.ts).
          <p className="mt-4 text-sm text-muted">
            <Icon name="clock" size={14} className="mr-1.5 inline align-[-2px]" />
            Price history: TCGplayer&rsquo;s market price for this product over time, with its TCGplayer and eBay prices, is on{" "}
            <a href={riftHref} rel={RIFT_REL} target="_blank" className="font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
              RiftCompare&rsquo;s Pokémon section ↗
            </a>
          </p>
        )}
      </Section>

      {!best && alternatives.length > 0 && (
        <Section id="instead" title="In stock instead" href={typeLink.href} linkLabel="See all">
          <ProductRail products={alternatives} region={r.region} label="In stock instead" />
        </Section>
      )}

      {best ? (
        <>
          {factsCard}
          {stripAt === "table" && strip}
        </>
      ) : (
        <>
          {stripAt === "table" && strip}
          {factsCard}
        </>
      )}

      {grid.length > 0 && set && (
        <Section title={`More from ${set.name}`} href={`/${r.region}/sets/${set.slug}`} linkLabel="Whole set">
          <ProductGrid products={grid} region={r.region} />
        </Section>
      )}

      {best && !p.setCode && alternatives.length > 0 && (
        <Section title={`More ${type ? type.plural : "sealed products"} in ${r.inName}`} href={typeLink.href} linkLabel="See all">
          <ProductRail products={alternatives} region={r.region} label={`More ${type ? type.plural : "sealed products"}`} />
        </Section>
      )}

      {stripAt === "bottom" && (
        <>
          <NoPreFooter />
          {strip}
        </>
      )}

      {best && bestLink ? (
        <StickyBuyBar
          region={r.region}
          anchor="best"
          preorder={pre}
          store={{ cents: best.priceCents, storeName: best.storeName, href: bestLink.href, rel: bestLink.rel, retailer: offerRetailer(best.store, best.storeName, r.market), marketplace: best.marketplace }}
          pick={ebayPick}
        />
      ) : (
        <StickyBuyBar region={r.region} anchor="soldout" pick={ebayPick} search={{ href: ebaySearchUrl(ebayQ, r.region, "product-sticky"), line: `Sold out at ${r.adjective} stores` }} />
      )}

      {/* Remembered in this browser only, for the region home's "Recently viewed" (components/Recent.tsx). */}
      <RecentTracker region={r.region} slug={p.slug} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}

/** "Compare all 29 prices ↓": from the top of the page to the table (#prices). */
function CompareLink({ n, soldOut = false }: { n: number; soldOut?: boolean }) {
  const label = soldOut ? (n > 1 ? `See all ${n} stores we checked` : "See the store we checked") : n > 1 ? `Compare all ${n} prices` : "See the price table";
  return (
    <a href="#prices" className="mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-brand-strong hover:bg-raised">
      {label} <span aria-hidden="true">↓</span>
    </a>
  );
}
