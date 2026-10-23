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
import { bfCopy, blackFriday, cyberMonday, seasonYear } from "@/lib/black-friday";
import { cardsBySlugs, lastCheckedAt, type ProductCardData } from "@/lib/data";
import { belowMsrpUS, dealPct, dealsInMarket, fitTitle } from "@/lib/deals";
import { money, plural, relativeDay, timeAgo } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound, type Market } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";

// /[region]/black-friday: the season's deals page (lib/black-friday.ts says what it lists and what it never says). Today's products
// furthest under the median of the stores that have them, ranked, every product type in one list (the /deals page splits them by
// type); in the US, what sits under Wizards of the Coast's announced US MSRP. One capped read (lib/deals.ts dealsInMarket: at most 96 rows), kept by the CDN until
// the next release like every page. One eBay strip, after the first four products.
export const dynamic = "force-dynamic";

const TAKE = 36;
const getDeals = cache((market: Market) => dealsInMarket(market, { take: TAKE }));

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const deals = await getDeals(r.market);
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  const year = seasonYear(new Date().toISOString().slice(0, 10));
  return {
    ...pageMeta({
      title: bfCopy.title(r, year),
      description: bfCopy.description(r, deals.length, best),
      path: `/${r.region}/black-friday`,
      alternates: regionAlternates(r.region, "/black-friday"),
    }),
    title: fitTitle(bfCopy.title(r, year)),
  };
}

export default async function BlackFridayPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const today = new Date().toISOString().slice(0, 10);
  const year = seasonYear(today);
  const bf = blackFriday(year);
  const cm = cyberMonday(year);
  const us = r.market === "US";
  const [deals, checked, msrp] = await Promise.all([getDeals(r.market), lastCheckedAt(r.market), us ? belowMsrpUS(8) : Promise.resolve([] as ProductCardData[])]);
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  // Under its own recent typical price (lib/price-history.ts): only products with a week or more of daily snapshots here.
  const history = readPriceHistory();
  const under = history ? underOwnTypical(history, r.market, { days: 30, minPct: 10, take: 12 }) : [];
  const underCards = await cardsBySlugs(r.market, under.map((u) => u.slug));
  const when = today < bf ? `Black Friday is ${formatRelease(bf)} (${relativeDay(bf, today)}) and Cyber Monday ${formatRelease(cm)}.` : today <= cm ? `It's Black Friday weekend: Cyber Monday is ${formatRelease(cm)}.` : `Black Friday ${year} was ${formatRelease(bf)}.`;
  const strip = <EbayStrip region={r.region} context="sealed" placement="listings-deals" search={{ kind: "sealed", query: "" }} />;
  const ld = deals.length ? itemListJsonLd({ name: bfCopy.h1(r), path: `/${r.region}/black-friday`, items: deals.map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })) }) : null;

  return (
    <div className="page py-8">
      {deals.length < 12 && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/deals`, label: "Deals" }, { label: "Black Friday" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow flex items-center gap-1.5 text-brand-strong">
          <Icon name="tag" size={14} /> Black Friday {year} · {r.name}
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{bfCopy.h1(r)}</h1>
        <p className="mt-3 leading-7 text-muted">
          {when} Stores set their own prices, so this page doesn’t guess at sales: it ranks the Magic sealed products whose cheapest in-stock price sits furthest under the median of the{" "}
          {r.adjective} stores that have them, from the prices we checked{" "}
          {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}. Every listing is read about twice a day through the season.
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
