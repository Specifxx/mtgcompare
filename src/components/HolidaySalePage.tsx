import Link from "@/components/Link";
import { readPriceHistory, underOwnTypical } from "@/lib/price-history";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { PreorderBanner } from "@/components/PreorderBanner";
import { ProductGrid } from "@/components/ProductGrid";
import { Empty, Section } from "@/components/Section";
import { FamilyCluster } from "@/components/FamilyCluster";
import { blackFriday, cyberMonday, eventCopy, EVENT_NAMES, seasonYear, type SaleEvent } from "@/lib/black-friday";
import { dearestInStock, GRADED_SEARCHES, olderShelf } from "@/lib/price-watch";
import { olderInStockData, priceMovesData } from "@/lib/stock-data";
import { OutboundLink } from "@/components/OutboundLink";
import { ebayCardSearchUrl, ebayLabel, ebayRetailer, ebaySearchUrl, REL_SPONSORED } from "@/lib/affiliate";
import { SET_BY_CODE } from "@/lib/sets";
import { cardsBySlugs, lastCheckedAt, type ProductCardData } from "@/lib/data";
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
  const [deals, checked, msrp, dearest, moves, older] = await Promise.all([
    getDeals(r.market),
    lastCheckedAt(r.market),
    us ? belowMsrpUS(8) : Promise.resolve([] as ProductCardData[]),
    dearestInStock(r.market).catch(() => [] as ProductCardData[]),
    priceMovesData(r.market).catch(() => null),
    olderInStockData(r.market).catch(() => []),
  ]);
  const down = moves?.down.slice(0, 8) ?? [];
  const shelf = olderShelf(older);
  const ebaySite = ebayLabel(r.region);
  const ebayLink = (label: string, href: string, key: string) => (
    <OutboundLink href={href} rel={REL_SPONSORED} retailer={ebayRetailer(r.region)} placement="price-watch" className="btn-ad shrink-0 px-3 py-1.5 text-xs" aria-label={`${label} on ${ebaySite} (paid link)`} key={key}>
      eBay
    </OutboundLink>
  );
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  // Under its own recent typical price (lib/price-history.ts): only products with a week or more of daily snapshots here.
  const history = readPriceHistory();
  const under = history ? underOwnTypical(history, r.market, { days: 30, minPct: 10, take: 12 }) : [];
  const underCards = await cardsBySlugs(r.market, under.map((u) => u.slug));
  const when =
    today < bf
      ? `Black Friday is ${formatRelease(bf)} (${relativeDay(bf, today)}) and Cyber Monday ${formatRelease(cm)} (${relativeDay(cm, today)}).`
      : today <= cm
        ? `It's Black Friday weekend: Cyber Monday is ${formatRelease(cm)}.`
        : `${name} ${year} was ${formatRelease(event === "black-friday" ? bf : cm)}.`;
  const strip = <EbayStrip region={r.region} context="sealed" placement="listings-deals" search={{ kind: "sealed", query: "" }} />;
  const ld = deals.length ? itemListJsonLd({ name: copy.h1(r), path, items: deals.map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })) }) : null;

  return (
    <div className="page py-8">
      {deals.length < 12 && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/deals`, label: "Deals" }, { label: name }]} />
      <header className="max-w-3xl">
        <div className="eyebrow flex items-center gap-1.5 text-brand-strong">
          <Icon name="tag" size={14} /> {name} {year} · {r.name}
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{copy.h1(r)}</h1>
        <p className="mt-3 leading-7 text-muted">
          {when} Stores set their own prices, so this page doesn’t guess at sales: it ranks the Magic sealed products whose cheapest in-stock price sits furthest under the median of the{" "}
          {r.adjective} stores that have them, from the prices we checked{" "}
          {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}. Every listing is read about twice a day through the season. Under the deals, the{" "}
          <a href="#price-watch" className="font-semibold text-brand hover:underline">price watch</a>: the dearest sealed in stock, the week&rsquo;s moves, older sets still in stock and graded chase cards, each with eBay listings.
        </p>
        {deals.length > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-open-soft px-3 py-1 text-sm font-semibold text-open">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {plural(deals.length, "product")} under the median today{best != null ? `, up to ${best}% under` : ""}
          </p>
        )}
      </header>

      <Section id="biggest-gaps" title="Furthest under the median today" kicker="Every product type, biggest gap first">
        {deals.length ? (
          <ProductGrid products={deals} region={r.region} eager={4} strip={strip} />
        ) : (
          <>
            <Empty
              actions={[
                { href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack" },
                { href: `/${r.region}/deals`, label: "All deals" },
              ]}
            >
              No product is at least 10% under the median of three or more {r.adjective} stores right now. The page fills in as soon as one is.
            </Empty>
            <div className="mt-6">{strip}</div>
          </>
        )}
        <p className="mt-4 text-sm leading-6 text-muted">
          “Under the median” compares a product’s cheapest in-stock price with the middle price of the {r.adjective} stores that have it in stock today (three or more
          stores, at least 10% under, never under half: that is a misfiled listing). Prices exclude shipping; check the store’s delivery cost and returns policy
          before you buy.
        </p>
      </Section>

      {underCards.length > 0 && (
        <Section id="under-typical" title="Under their own 30-day typical price" kicker="From our daily price snapshots">
          <ol className="grid gap-2">
            {under
              .filter((u) => underCards.some((c) => c.slug === u.slug))
              .map((u) => {
                const c = underCards.find((x) => x.slug === u.slug)!;
                return (
                  <li key={u.slug} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <Link href={`/${r.region}/p/${u.slug}`} prefetch={false} className="min-w-0 font-semibold hover:text-brand">
                      {c.name}
                    </Link>
                    <span className="tabular text-sm">
                      <b className="font-display text-base">{money(u.cents, r.market)}</b> <span className="text-muted">vs {money(u.typical, r.market)} typical</span>{" "}
                      <span className="font-semibold text-open">{u.pct}% under</span>
                    </span>
                  </li>
                );
              })}
          </ol>
          <p className="mt-3 text-sm leading-6 text-muted">
            The typical price is the median of the product’s cheapest in-stock price over the last 30 days of our daily snapshots (a week of snapshots at
            least). It describes what stores asked on those days, not what any store will charge next.
          </p>
        </Section>
      )}

      {us && msrp.length > 0 && (
        <Section id="below-msrp" title="Under US MSRP today" kicker="Wizards of the Coast's announced US list price">
          <ProductGrid products={msrp} region={r.region} />
          <p className="mt-3 text-xs text-muted">{RRP_NOTE}</p>
        </Section>
      )}

      {/* THE PRICE WATCH (lib/price-watch.ts, DECISIONS.md 2026-11-06): the high-value end of the market, an eBay search beside every row. */}
      <div id="price-watch" className="mt-14 max-w-3xl">
        <div className="eyebrow">Price watch · {r.name}</div>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-[28px]">Sealed, older sets and graded cards to watch</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The high-value end of the {r.adjective} market from today&rsquo;s prices, each row with a tagged eBay search beside the store price. eBay sellers set their own
          prices and are never counted as a store or ranked into a comparison; the strips show live listings.
        </p>
      </div>

      {dearest.length > 0 && (
        <Section id="dearest-sealed" title="Dearest sealed in stock today" kicker="Store price beside an eBay search">
          <ol className="grid gap-2">
            {dearest.map((p) => (
              <li key={p.slug} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <Link href={`/${r.region}/p/${p.slug}`} prefetch={false} className="min-w-0 flex-1 font-semibold hover:text-brand">
                  {p.name}
                  <span className="block text-xs font-normal text-faint">
                    {p.productType}
                    {p.setCode && SET_BY_CODE.get(p.setCode) ? ` · ${SET_BY_CODE.get(p.setCode)!.name}` : ""} · {plural(p.inStockStores, "store")} in stock
                  </span>
                </Link>
                <span className="tabular text-sm">
                  <b className="font-display text-base">{money(p.lowestPriceCents, r.market)}</b> <span className="text-muted">cheapest store</span>
                </span>
                {ebayLink(p.name, ebaySearchUrl(p.name, r.region, "price-watch"), `d-${p.slug}`)}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-6 text-muted">The cheapest in-stock {r.adjective} store price of the dearest products stores have today, before shipping. A big box is where a wrong store costs the most.</p>
        </Section>
      )}

      {down.length > 0 && (
        <Section id="down-this-week" title="Down this week" kicker="The week's biggest moves down, from our daily price snapshots" href={`/${r.region}/price-moves`} linkLabel="All price moves">
          <ol className="grid gap-2">
            {down.map(({ card, move }) => (
              <li key={card.slug} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <Link href={`/${r.region}/p/${card.slug}`} prefetch={false} className="min-w-0 flex-1 font-semibold hover:text-brand">
                  {card.name}
                  <span className="block text-xs font-normal text-faint">{card.productType}</span>
                </Link>
                <span className="tabular text-sm">
                  <b className="font-display text-base">{money(move.after, r.market)}</b> <span className="text-muted">vs {money(move.before, r.market)} a week ago</span>{" "}
                  <span className="font-semibold text-open">{move.pct}%</span>
                </span>
                {ebayLink(card.name, ebaySearchUrl(card.name, r.region, "price-watch"), `m-${card.slug}`)}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-6 text-muted">The cheapest in-stock price today against the same product&rsquo;s a week back, for popular sets&rsquo; headline products; what stores asked on those two days, not a sale.</p>
        </Section>
      )}

      {shelf.length > 0 && (
        <Section id="older-sets" title="Older sets still in stock" kicker="One product per set, the sets most stores carry first" href={`/${r.region}/out-of-print`} linkLabel="All older sets">
          <ol className="grid gap-2">
            {shelf.map(({ set, item }) => (
              <li key={item.slug} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <Link href={`/${r.region}/p/${item.slug}`} prefetch={false} className="min-w-0 flex-1 font-semibold hover:text-brand">
                  {item.name}
                  <span className="block text-xs font-normal text-faint">
                    {set.name} · released {formatRelease(set.releaseDate)} · {plural(item.inStockStores, "store")} in stock
                  </span>
                </Link>
                <span className="tabular text-sm">
                  <b className="font-display text-base">{money(item.lowestPriceCents, r.market)}</b> <span className="text-muted">cheapest store</span>
                </span>
                {ebayLink(item.name, ebaySearchUrl(item.name, r.region, "price-watch"), `o-${item.slug}`)}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-6 text-muted">Sets released 18 months or more ago that an independent {r.adjective} store still has in stock today. A fact of the calendar, not a claim about printing.</p>
        </Section>
      )}

      <Section id="graded-cards" title="Graded chase cards on eBay" kicker={`Tagged Buy It Now searches on ${ebaySite}`}>
        <ul className="flex flex-wrap gap-2">
          {GRADED_SEARCHES.map((g) => (
            <li key={g.query}>
              <OutboundLink href={ebayCardSearchUrl(g.query, r.region, "price-watch")} rel={REL_SPONSORED} retailer={ebayRetailer(r.region)} placement="price-watch" className="btn-ad px-3 py-1.5 text-xs">
                {g.label}
              </OutboundLink>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-muted">
          MTG Compare compares sealed product, not single cards, so these are searches of live graded listings, not prices we checked. Paid links: we may earn a commission, at no cost to you.
        </p>
        <div className="mt-6">
          <EbayStrip region={r.region} context="chase" placement="price-watch" search={{ kind: "card", query: "" }} />
        </div>
      </Section>

      <FamilyCluster kind="deal" region={r.region} />

      <section aria-labelledby="season-more" className="mt-14 max-w-3xl">
        <h2 id="season-more" className="font-display text-2xl font-bold tracking-tight">
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
            <Link href={`/${r.region}/this-week`} prefetch={false} className="font-semibold text-brand hover:underline">
              This week
            </Link>{" "}
            — sets releasing soon and just out, with their cheapest boxes and bundles.
          </li>
          <li>
            <Link href={`/${r.region}/tools/value-checker`} prefetch={false} className="font-semibold text-brand hover:underline">
              Value checker
            </Link>{" "}
            — see where a price you were offered sits against today’s stores.
          </li>
        </ul>
        <div className="mt-6">
          <PreorderBanner region={r.region} today={today} />
        </div>
      </section>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}
