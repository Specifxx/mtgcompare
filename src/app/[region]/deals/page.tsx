import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon } from "@/components/Icon";
import { ProductGrid } from "@/components/ProductGrid";
import { Empty, Section } from "@/components/Section";
import { lastCheckedAt, type ProductCardData } from "@/lib/data";
import { belowMsrpUS, dealPct, dealsBySection, dealsCopy, fitTitle, nearestRegion, perPackLeaders, stockLabel, type PerPackRow } from "@/lib/deals";
import { money, plural, timeAgo } from "@/lib/format";
import { isPreorderSet } from "@/lib/release";
import { REGIONS, regionOrNotFound, type Market, type RegionInfo } from "@/lib/regions";
import { RRP_NOTE } from "@/lib/rrp";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";

// /[region]/deals: products whose cheapest in-stock price is at least 10% under the median of the 3+ stores that have it, today
// (lib/deals.ts: the same bar as every card's "N% below the median" badge, so the page and the badges always agree). One section per
// type, then the cheapest per pack and, in the US, what sits under TPCi's MSRP. Every read is one capped query (48 deals from at most
// 96 rows, at most 192 per-pack rows); the page is cached at the CDN until the next release. One eBay strip, after the first products.

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

// Shared by generateMetadata and the page (noindex and the description need the counts): one read each per render.
const getSections = cache((market: Market) => dealsBySection(market));
const getLeaders = cache((market: Market) => perPackLeaders(market));

/** Fewer than this many deals: the page leads with the per-pack ranking instead (never a thin page). */
const THIN = 6;

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const [sections, leaders] = await Promise.all([getSections(r.market), getLeaders(r.market)]);
  const deals = sections.flatMap((s) => s.deals);
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  return {
    ...pageMeta({
      title: dealsCopy.title(r),
      description: dealsCopy.description(r, deals.length, best),
      path: `/${r.region}/deals`,
      alternates: regionAlternates(r.region, "/deals"),
      noindex: deals.length < THIN && leaders.top10.length < THIN,
    }),
    title: fitTitle(dealsCopy.title(r)),
  };
}

export default async function DealsPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const us = r.market === "US";
  const [sections, leaders, checked, belowMsrp] = await Promise.all([
    getSections(r.market),
    getLeaders(r.market),
    lastCheckedAt(r.market),
    us ? belowMsrpUS(8) : Promise.resolve([] as ProductCardData[]),
  ]);
  const deals = sections.flatMap((s) => s.deals);
  const thin = deals.length < THIN;
  const best = deals.length ? Math.max(...deals.map(dealPct)) : null;
  const msrp = belowMsrp.slice(0, 8);
  const lede = dealsCopy.lede(r);
  const firstWithDeals = sections.findIndex((s) => s.deals.length > 0);
  const other = REGIONS[nearestRegion(r.region)];
  // A page led by the per-pack ranking also shows the cheapest per pack of each type, as cards (only when deals are thin).
  const winners = thin ? leaders.byType.map((g) => g.rows[0].p) : [];

  // The page's one eBay unit: sealed listings, after the first four deals (ProductGrid `strip`), or, on a page led by the per-pack
  // ranking, right after it. The first grid's in-feed tiles (tiles="deals") are the 7th and 8th sealed listings, which no strip shows.
  const strip = <EbayStrip region={r.region} context="sealed" placement="listings-deals" search={{ kind: "sealed", query: "" }} />;
  // The slim strip above the footer needs a viewport's height of page under this one (lib/ebay-ads.ts GAP); estimated per row.
  const room = roomBelowStrip({ thin, sections: sections.map((s) => s.deals.length), first: firstWithDeals, perPack: leaders.top10.length, winners: winners.length, msrp: msrp.length });

  const perPack = leaders.top10.length > 0 && (
    <Section id="per-pack" title="Cheapest per pack today" kicker="Price ÷ booster packs inside" href={`/${r.region}/cheapest-packs`} linkLabel="Full ranking">
      <PerPackTop r={r} rows={leaders.top10} />
    </Section>
  );

  const ld =
    deals.length > 0
      ? itemListJsonLd({
          name: dealsCopy.h1(r),
          path: `/${r.region}/deals`,
          items: deals.slice(0, 50).map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })),
        })
      : null;

  return (
    <div className="page py-8">
      {!room && <NoPreFooter />}
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Deals" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow flex items-center gap-1.5 text-brand-strong">
          <Icon name="tag" size={14} /> Deals · {r.name}
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{dealsCopy.h1(r)}</h1>
        <p className="mt-3 leading-7 text-muted">
          {lede.lead} {checked ? <Ago iso={checked.toISOString()} initial={timeAgo(checked)} /> : "twice a day"}
          {lede.tail}
        </p>
        {deals.length > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-open-soft px-3 py-1 text-sm font-semibold text-open">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {dealsCopy.summary(deals.length, best)}
          </p>
        )}
      </header>

      {/* In-page links: one per section that has deals, then the per-pack ranking (and, in the US, below MSRP). */}
      {deals.length > 0 && (
        <nav aria-label="On this page" className="scroller -mx-4 mt-6 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[-webkit-mask-image:none] sm:[mask-image:none]">
          {thin && perPack && (
            <a href="#per-pack" className="chip min-h-10">
              Cheapest per pack
            </a>
          )}
          {sections
            .filter((s) => s.deals.length > 0)
            .map((s) => (
              <a key={s.section.id} href={`#${s.section.id}`} className="chip min-h-10">
                {s.section.title} <span className="tabular text-muted">{s.deals.length}</span>
              </a>
            ))}
          {!thin && perPack && (
            <a href="#per-pack" className="chip min-h-10">
              Cheapest per pack
            </a>
          )}
          {msrp.length > 0 && (
            <a href="#below-msrp" className="chip min-h-10">
              Below US MSRP <span className="tabular text-muted">{msrp.length}</span>
            </a>
          )}
        </nav>
      )}

      {thin && (
        <>
          {deals.length === 0 && (
            <p className="mt-6 flex max-w-3xl items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-muted">
              <Icon name="info" size={18} className="mt-0.5 shrink-0 text-faint" />
              <span>
                {dealsCopy.empty(r)}{" "}
                <Link href={`/${other.region}/deals`} prefetch={false} className="font-semibold text-brand-strong hover:underline">
                  Deals in {other.inName} →
                </Link>
              </span>
            </p>
          )}
          {perPack || (
            <div className="mt-8">
              <Empty
                actions={[
                  { href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" },
                  { href: `/${r.region}/releases`, label: "Pre-orders" },
                  { href: `/${other.region}/deals`, label: `Deals in ${other.inName}` },
                ]}
              >
                Nothing with a fixed pack count is in stock at a {r.adjective} store we track right now.
              </Empty>
            </div>
          )}
          <div className="mt-10">{strip}</div>
          {winners.length > 0 && (
            <Section id="by-type" title="The cheapest of each type today" kicker="Per booster pack" href={`/${r.region}/cheapest-packs`} linkLabel="Every type">
              <ProductGrid products={winners} region={r.region} />
            </Section>
          )}
        </>
      )}

      {sections.map(({ section: s, deals: list }, i) =>
        list.length > 0 ? (
          <Section key={s.id} id={s.id} title={s.title} kicker={`${list.length} below the median`} href={`/${r.region}${s.more.path}`} linkLabel={s.more.label}>
            {i === firstWithDeals ? (
              <ProductGrid products={list} region={r.region} eager={4} tiles="deals" strip={thin ? undefined : strip} />
            ) : (
              <ProductGrid products={list} region={r.region} />
            )}
          </Section>
        ) : thin ? null : (
          <Section key={s.id} id={s.id} title={s.title}>
            <p className="card px-4 py-3 text-sm text-muted">
              No {s.one} is 10% under the median of 3+ {r.adjective} stores today.{" "}
              <Link href={`/${r.region}${s.more.path}`} prefetch={false} className="font-semibold text-brand-strong hover:underline">
                {s.more.label} →
              </Link>
            </p>
          </Section>
        ),
      )}

      {!thin && perPack}

      {msrp.length > 0 && (
        <Section id="below-msrp" title="At or below US MSRP" kicker="Today’s cheapest price under TPCi’s list price">
          <ProductGrid products={msrp} region={r.region} />
          <p className="mt-3 text-xs text-muted">{RRP_NOTE}</p>
        </Section>
      )}

      <aside className="mt-14 rounded-xl border border-line bg-raised p-5 text-sm leading-6 text-muted sm:p-6" aria-labelledby="how-deals">
        <h2 id="how-deals" className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Icon name="info" size={18} /> How these are picked
        </h2>
        <p className="mt-2">
          A product is listed when its cheapest in-stock price is at least 10% under the median price of the {r.adjective} stores that have it in stock
          today, and at least three do. Anything more than half under the median is left out: that is nearly always a misread listing, not a price. The
          badge on each card is the same figure the product page shows.
          {r.market === "US" && " The median is the stores’ alone; the cheapest price can be a TCGplayer seller’s."} Prices are as each store lists them,
          before shipping, and the store&rsquo;s own page is final.
        </p>
      </aside>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}

/** The ten cheapest products per pack, as a compact ranked list (the full tables are on /cheapest-packs). */
function PerPackTop({ r, rows }: { r: RegionInfo; rows: PerPackRow[] }) {
  return (
    <ol className="card grid grid-cols-[minmax(0,1fr)] gap-x-4 p-1.5 sm:grid-cols-2 sm:p-2">
      {rows.map((row, i) => (
        <li key={row.p.slug}>
          <Link href={`/${r.region}/p/${row.p.slug}`} prefetch={false} className="group flex min-h-14 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-raised">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular ${i === 0 ? "bg-open-soft text-open" : "bg-raised text-muted"}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold group-hover:text-brand">{row.p.name}</span>
              <span className="block truncate text-xs text-muted">
                {money(row.p.lowestPriceCents, r.market)} for {plural(row.packs, "pack")} · {stockLabel(row.p, isPreorderSet(row.p.setCode))}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block font-display text-base font-bold">{money(row.perPack, r.market)}</span>
              <span className="block text-[11px] leading-3 text-muted">a pack</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// Rough heights (px) of what follows the page's strip, on a phone (two cards a row) and a desktop (four): the pre-footer strip stays
// only when both leave well over a viewport between the two units (lib/ebay-ads.ts GAP is 960; 1,500 also keeps a short page's two
// units under a fifth of its height, far inside the 25% density ceiling).
const ROOM = 1500;
function roomBelowStrip(o: { thin: boolean; sections: number[]; first: number; perPack: number; winners: number; msrp: number }): boolean {
  const grid = (n: number, cols: number, row: number) => (n > 0 ? 110 + Math.ceil(n / cols) * row : 0);
  let phone = 150;
  let desk = 120;
  const add = (p: number, d: number) => {
    phone += p;
    desk += d;
  };
  if (o.thin) {
    add(grid(o.winners, 2, 330), grid(o.winners, 4, 446));
    for (const n of o.sections) add(grid(n, 2, 330), grid(n, 4, 446));
  } else {
    o.sections.forEach((n, i) => {
      if (i === o.first) add(Math.ceil(Math.max(0, n - 4) / 2) * 330, Math.ceil(Math.max(0, n - 4) / 4) * 446);
      else if (n > 0 || i > o.first) add(n > 0 ? grid(n, 2, 330) : 150, n > 0 ? grid(n, 4, 446) : 150);
    });
    add(o.perPack ? 110 + o.perPack * 58 : 0, o.perPack ? 110 + Math.ceil(o.perPack / 2) * 58 : 0);
  }
  add(grid(o.msrp, 2, 330), grid(o.msrp, 4, 446));
  return phone >= ROOM && desk >= ROOM;
}
