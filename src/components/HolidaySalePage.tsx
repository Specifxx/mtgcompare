import Link from "@/components/Link";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { InfoTip } from "@/components/InfoTip";
import { SaleDeals } from "@/components/SaleDeals";
import { SaleNav } from "@/components/SaleNav";
import { ALERT_SITE_KEY } from "@/lib/alert-feed";
import { TcgplayerSaleBlock } from "@/components/TcgplayerSaleBlock";
import { TcgplayerCyberBanner } from "@/components/TcgplayerCyberBanner";
import { saleDealRows } from "@/lib/sale-deals-data";
import type { SaleDealRow } from "@/lib/sale-deals";
import { DISCORD_INVITE } from "@/lib/site";
import { PreorderBanner } from "@/components/PreorderBanner";
import { ProductGrid } from "@/components/ProductGrid";
import { Empty, Section } from "@/components/Section";
import { FamilyCluster } from "@/components/FamilyCluster";
import { blackFriday, cyberMonday, eventCopy, EVENT_NAMES, seasonYear, type SaleEvent } from "@/lib/black-friday";
import { dearestInStock, GRADED_SEARCHES, olderShelf } from "@/lib/price-watch";
import { olderInStockData, priceMovesData } from "@/lib/stock-data";
import { OutboundLink } from "@/components/OutboundLink";
import { ebayCardSearchUrl, ebayLabel, ebayRetailer, ebaySearchUrl, REL_SPONSORED, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import { SET_BY_CODE } from "@/lib/sets";
import { lastCheckedAt, type ProductCardData } from "@/lib/data";
import { belowMsrpUS, dealPct, dealsInMarket, fitTitle } from "@/lib/deals";
import { money, plural, relativeDay, timeAgo } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound, type Market } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";

// /[region]/black-friday and /[region]/cyber-monday: the season's deals pages (lib/black-friday.ts says what they list and what they
// never say), one component under two URLs (2026-11-06, DECISIONS.md "Black Friday and Cyber Monday price watch pages"), so each sale
// day has its own page to rank. Today's products furthest under the median of the stores that have them, ranked, every product
// type in one list (the /deals page splits them by type); in the US, what sits under Wizards of the Coast's announced US MSRP; then the PRICE WATCH
// (lib/price-watch.ts): the dearest sealed in stock, the week's moves down, older sets still in stock and graded chase-card
// searches, an eBay search beside every row. Capped reads (lib/deals.ts dealsInMarket at most 96 rows; dearestInStock,
// priceMovesData, olderInStockData each scoped and capped), kept by the CDN until the next release like every page; the route
// files export `dynamic = "force-dynamic"`. The eBay strips stay client-fetched (components/EbayStrip.tsx).

const TAKE = 36;
const getDeals = cache((market: Market) => dealsInMarket(market, { take: TAKE }));

type Props = { params: { region: string } };

export async function holidayMetadata(event: SaleEvent, { params }: Props): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const copy = eventCopy(event);
  const deals = await getDeals(r.market);
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  const year = seasonYear(new Date().toISOString().slice(0, 10));
  return {
    ...pageMeta({
      title: copy.title(r, year),
      description: copy.description(r, deals.length, best),
      path: `/${r.region}/${event}`,
      alternates: regionAlternates(r.region, `/${event}`),
    }),
    title: fitTitle(copy.title(r, year)),
  };
}

export async function HolidaySalePage({ event, params }: { event: SaleEvent } & Props) {
  const r = regionOrNotFound(params.region);
  const copy = eventCopy(event);
  const name = EVENT_NAMES[event];
  const path = `/${r.region}/${event}`;
  const today = new Date().toISOString().slice(0, 10);
  const year = seasonYear(today);
  const bf = blackFriday(year);
  const cm = cyberMonday(year);
  const us = r.market === "US";
  const [deals, checked, msrp, dearest, moves, older, saleRows] = await Promise.all([
    getDeals(r.market),
    lastCheckedAt(r.market),
    us ? belowMsrpUS(8) : Promise.resolve([] as ProductCardData[]),
    dearestInStock(r.market).catch(() => [] as ProductCardData[]),
    priceMovesData(r.market).catch(() => null),
    olderInStockData(r.market).catch(() => []),
    saleDealRows(r, today).catch(() => [] as SaleDealRow[]),
  ]);
  const down = moves?.down.slice(0, 8) ?? [];
  const shelf = olderShelf(older);
  const ebaySite = ebayLabel(r.region);
  const ebayLink = (label: string, href: string, key: string, placement: Placement) => (
    <OutboundLink href={href} rel={REL_SPONSORED} retailer={ebayRetailer(r.region)} placement={placement} className="btn-ad min-h-11 w-full px-3 text-center text-xs sm:w-auto" aria-label={`${label} on ${ebaySite} (paid link)`} key={key}>
      eBay
    </OutboundLink>
  );
  const pcts = saleRows.map((x) => Math.max(x.typical?.pct ?? 0, x.median?.pct ?? 0));
  const best = pcts.length ? Math.max(...pcts) : null;
  const when =
    today < bf
      ? `Black Friday is ${formatRelease(bf)} (${relativeDay(bf, today)}).`
      : today <= cm
        ? `It's Black Friday weekend: Cyber Monday is ${formatRelease(cm)}.`
        : `${name} ${year} was ${formatRelease(event === "black-friday" ? bf : cm)}.`;
  const strip = <EbayStrip region={r.region} context="sealed" placement="listings-deals" search={{ kind: "sealed", query: "" }} />;
  const ld = saleRows.length
    ? itemListJsonLd({ name: copy.h1(r), path, items: saleRows.slice(0, 36).map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })) })
    : deals.length
      ? itemListJsonLd({ name: copy.h1(r), path, items: deals.map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })) })
      : null;
  const row = "card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_6rem]";

  return (
    <div className="page py-8">
      {saleRows.length < 12 && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/deals`, label: "Deals" }, { label: name }]} />
      <header className="max-w-3xl">
        <div className="eyebrow flex items-center gap-1.5">
          <Icon name="tag" size={14} /> {name} {year} · {r.name}
        </div>
        <h1 className="mt-2 page-title">{copy.h1(r)}</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          {saleRows.length > 0 ? (
            <>
              <b className="text-ink">{plural(saleRows.length, "deal")}</b> today{best != null ? <>, up to <b className="text-ink">{best}% off</b></> : ""}, checked{" "}
              {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}.
            </>
          ) : (
            <>Prices checked {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}.</>
          )}{" "}
          {when}{" "}
          <a href="#how-we-calculate" className="font-semibold text-brand hover:underline">How we calculate</a>
        </p>
        <p className="mt-1 text-xs text-faint">Store, eBay and TCGplayer links may be paid links: we may earn a commission, at no cost to you. It never changes the order.</p>
      </header>

      <SaleNav
        page={event}
        items={[
          { id: "deals", label: "Deals" },
          ...(us && msrp.length ? [{ id: "below-msrp", label: "Under MSRP" }] : []),
          { id: "down-this-week", label: "Price moves" },
          { id: "dearest-sealed", label: "Most expensive" },
          { id: "older-sets", label: "Older sets" },
          { id: "graded-cards", label: "Graded" },
          { id: "preorders", label: "Pre-orders" },
        ]}
      />

      <section id="deals" aria-labelledby="deals-h" className="mt-5">
        <h2 id="deals-h" className="sr-only">Today&rsquo;s deals</h2>
        {saleRows.length ? (
          <SaleDeals rows={saleRows} market={r.market} regionCode={r.region} regionName={r.inName.replace(/^in /, "")} siteKey={ALERT_SITE_KEY} discordHref={DISCORD_INVITE} ebayLabel={ebaySite} ebayRetailer={ebayRetailer(r.region)} />
        ) : (
          <Empty
            actions={[
              { href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" },
              { href: `/${r.region}/deals`, label: "All deals" },
            ]}
          >
            No product is at least 10% under its own 30-day price or under the median of three or more {r.adjective} stores right now. The page fills in as soon as one is.
          </Empty>
        )}
        <div className="mt-8">{strip}</div>
      </section>

      {us && msrp.length > 0 && (
        <Section id="below-msrp" title="Under US MSRP today" kicker="Wizards of the Coast's announced US list price" className="mt-14">
          <ProductGrid products={msrp} region={r.region} />
          <InfoTip>{RRP_NOTE}</InfoTip>
        </Section>
      )}

      {/* THE PRICE WATCH (lib/price-watch.ts, DECISIONS.md 2026-11-06): the high-value end of the market, an eBay search beside every row. */}
      <div id="price-watch" aria-hidden="true" />
      {down.length > 0 && (
        <Section id="down-this-week" title="Price moves this week" kicker="The week's biggest moves down" href={`/${r.region}/price-moves`} linkLabel="All price moves" className="mt-14">
          <ol className="grid gap-2">
            {down.map(({ card, move }) => (
              <li key={card.slug} className={row}>
                <Link href={`/${r.region}/p/${card.slug}`} prefetch={false} className="min-w-0 font-semibold hover:text-brand">
                  {card.name}
                  <span className="block text-xs font-normal text-muted">{card.productType}</span>
                </Link>
                <span className="tabular text-right text-sm">
                  <span className="mr-1 inline-block rounded-md bg-open px-1.5 py-0.5 text-xs font-bold text-white">{move.pct}%</span>
                  <b className="font-display text-base">{money(move.after, r.market)}</b>
                  <span className="block text-xs text-muted">{money(move.before, r.market)} a week ago</span>
                </span>
                <span className="col-span-2 sm:col-span-1">{ebayLink(card.name, ebaySearchUrl(card.name, r.region, "bf-moves"), `m-${card.slug}`, "bf-moves")}</span>
              </li>
            ))}
          </ol>
          <InfoTip>The cheapest in-stock price today against the same product&rsquo;s a week back, for popular sets&rsquo; headline products: what stores asked on those two days.</InfoTip>
        </Section>
      )}

      {dearest.length > 0 && (
        <Section id="dearest-sealed" title="Most expensive sealed in stock" kicker={`The cheapest ${r.adjective} store for each, beside an eBay search`} className="mt-14">
          <ol className="grid gap-2">
            {dearest.map((p) => (
              <li key={p.slug} className={row}>
                <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="min-w-0 font-semibold hover:text-brand">
                  {p.name}
                  <span className="block text-xs font-normal text-muted">
                    {p.productType}
                    {p.setCode && SET_BY_CODE.get(p.setCode) ? ` · ${SET_BY_CODE.get(p.setCode)!.name}` : ""} · {plural(p.inStockStores, "store")} in stock
                  </span>
                </Link>
                <span className="tabular text-right text-sm">
                  <b className="font-display text-base">{money(p.lowestPriceCents, r.market)}</b>
                  <span className="block text-xs text-muted">cheapest store</span>
                </span>
                <span className="col-span-2 sm:col-span-1">{ebayLink(p.name, ebaySearchUrl(p.name, r.region, "bf-dearest"), `d-${p.slug}`, "bf-dearest")}</span>
              </li>
            ))}
          </ol>
          <InfoTip>The cheapest in-stock {r.adjective} store price of the dearest products stores have today, before shipping. eBay sellers set their own prices and are never counted as a store.</InfoTip>
        </Section>
      )}

      {shelf.length > 0 && (
        <Section id="older-sets" title="Older sets still in stock" kicker="One product per set, the sets most stores carry first" href={`/${r.region}/out-of-print`} linkLabel="All older sets" className="mt-14">
          <ol className="grid gap-2">
            {shelf.map(({ set, item }) => (
              <li key={item.slug} className={row}>
                <Link href={`/${r.region}/p/${item.slug}`} prefetch={false} className="min-w-0 font-semibold hover:text-brand">
                  {item.name}
                  <span className="block text-xs font-normal text-muted">
                    {set.name} · released {formatRelease(set.releaseDate)} · {plural(item.inStockStores, "store")} in stock
                  </span>
                </Link>
                <span className="tabular text-right text-sm">
                  <b className="font-display text-base">{money(item.lowestPriceCents, r.market)}</b>
                  <span className="block text-xs text-muted">cheapest store</span>
                </span>
                <span className="col-span-2 sm:col-span-1">{ebayLink(item.name, ebaySearchUrl(item.name, r.region, "bf-older"), `o-${item.slug}`, "bf-older")}</span>
              </li>
            ))}
          </ol>
          <InfoTip>Sets released 18 months or more ago that an independent {r.adjective} store still has in stock today. A fact of the calendar, not a claim about printing.</InfoTip>
        </Section>
      )}

      <Section id="graded-cards" title="Graded chase cards on eBay" kicker={`Buy It Now searches on ${ebaySite}`} className="mt-14">
        <ul className="flex flex-wrap gap-2">
          {GRADED_SEARCHES.map((g) => (
            <li key={g.query}>
              <OutboundLink href={ebayCardSearchUrl(g.query, r.region, "bf-graded")} rel={REL_SPONSORED} retailer={ebayRetailer(r.region)} placement="bf-graded" className="btn-ad inline-flex min-h-11 items-center px-3 text-xs">
                {g.label}
              </OutboundLink>
            </li>
          ))}
        </ul>
        <InfoTip>MTG Compare compares sealed product, not single cards, so these are searches of live graded listings, not prices we checked.</InfoTip>
        <div className="mt-6">
          <EbayStrip region={r.region} context="chase" placement="price-watch" search={{ kind: "card", query: "" }} />
        </div>
      </Section>

      <TcgplayerCyberBanner href={tcgplayerSearchUrl("", r.region, "tcgplayer-cyber-banner")} at={Date.now()} className="mt-14 max-w-3xl" />
      <TcgplayerSaleBlock region={r.region} name={name} />

      <section id="preorders" aria-labelledby="preorders-h" className="mt-14 max-w-3xl">
        <h2 id="preorders-h" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Pre-orders</h2>
        <div className="mt-4">
          <PreorderBanner region={r.region} today={today} />
        </div>
      </section>

      <FamilyCluster kind="deal" region={r.region} />

      <section aria-labelledby="season-more" className="mt-14 max-w-3xl">
        <h2 id="season-more" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          More ways to save this season
        </h2>
        <ul className="mt-4 grid gap-2 text-[15px] leading-6 text-muted">
          <li>
            <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="font-semibold text-brand hover:underline">
              Cheapest per pack
            </Link>{" "}
            — every product ranked by its price ÷ booster packs inside, so a Play Booster box, a Collector box and a bundle compare like for like.
          </li>
          <li>
            <Link href={`/${r.region}/${event === "black-friday" ? "cyber-monday" : "black-friday"}`} prefetch={false} className="font-semibold text-brand hover:underline">
              {event === "black-friday" ? "Cyber Monday deals" : "Black Friday deals"}
            </Link>{" "}
            — the same deals and price watch, under the {event === "black-friday" ? "Monday" : "Friday"}&rsquo;s own page.
          </li>
          <li>
            <Link href={`/${r.region}/guides/magic-black-friday-2026`} prefetch={false} className="font-semibold text-brand hover:underline">
              Black Friday: the prices to beat
            </Link>{" "}
            — today&rsquo;s cheapest prices to read a Black Friday price against, and five checks before you pay.
          </li>
          <li>
            <Link href={`/${r.region}/deals`} prefetch={false} className="font-semibold text-brand hover:underline">
              All deals by product type
            </Link>{" "}
            — the same rule as this page, split into booster boxes, Collector boxes, bundles and more.
          </li>
          <li>
            <Link href={`/${r.region}/tools/value-checker`} prefetch={false} className="font-semibold text-brand hover:underline">
              Value checker
            </Link>{" "}
            — see where a price you were offered sits against today’s stores.
          </li>
        </ul>
      </section>

      <section id="how-we-calculate" aria-labelledby="how-h" className="mt-14 max-w-3xl text-sm leading-6 text-muted">
        <h2 id="how-h" className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-ink">How we calculate</h2>
        <p className="mt-3">
          Stores set their own prices, so this page doesn&rsquo;t guess at sales. Each deal row uses the cheapest in-stock offer a shopper can order now from the {r.adjective} stores we
          check about twice a day, and measures it two ways. <b>Biggest price drops</b> compares it with the product&rsquo;s own typical price: the median of its cheapest in-stock price on
          each of the last 30 days we recorded (two weeks of records at least; a day far under the rest is left out as a wrong listing, and a product whose records swing more than
          twofold is not listed). <b>Under other stores today</b> compares it with the middle price of the {r.adjective} stores that have it in stock (three or more stores, at least 10%
          under, never under half).
        </p>
        <p className="mt-2">
          Both say what stores asked, not what they will charge next. Shipping is each store&rsquo;s own checkout as we measured it for one item; the store&rsquo;s checkout is final.
          A row checked more than 12 hours ago is flagged. eBay sellers set their own prices and are never counted as a store or ranked into a comparison.
        </p>
      </section>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}
