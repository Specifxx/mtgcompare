import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Ago } from "@/components/Ago";
import { NoPreFooter } from "@/components/Ebay";
import { EbayStrip } from "@/components/EbayStrip";
import { Icon, type IconName } from "@/components/Icon";
import { storeStats } from "@/lib/data";
import { plural, timeAgo } from "@/lib/format";
import { storesDescription, storesTitle, titleText, topStores } from "@/lib/hub-copy";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { OFFER_STALE_H } from "@/lib/sealed-offers";
import { pageMeta, regionAlternates } from "@/lib/seo";
import { storeHost, storesInMarket, type StoreConfig } from "@/lib/stores";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  const n = storesInMarket(r.market).length;
  const title = storesTitle(r, n);
  return {
    ...pageMeta({
      title: titleText(title),
      description: storesDescription(r, n),
      path: `/${r.region}/stores`,
      alternates: regionAlternates(r.region, "/stores"),
    }),
    title,
  };
}

export default async function StoresPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const stats = new Map((await storeStats(r.market)).map((s) => [s.store, s]));
  const stores = storesInMarket(r.market).map((s) => {
    const st = stats.get(s.key);
    return { s, key: s.key, name: s.name, inStock: st?.inStock ?? 0, listed: st?.listed ?? 0, lastOkAt: st?.lastOkAt ?? null };
  });
  const top = topStores(stores, 10);
  const lead = top[0];
  const max = lead?.inStock ?? 1;
  const az = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Stores" }]} />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Where to buy Pokémon TCG sealed online in {r.inName}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {/* One text node: a sentence split around {values} moves its later pieces when the web font arrives (a layout shift). */}
        {`${plural(stores.length, "independent game and card store")} that sell Pokémon sealed product online in ${r.currency}, compared in one place. We read their public product listings about twice a day; every product page ranks them by price and stock, and no store pays to be listed or to rank higher.`}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10">
        <section aria-labelledby="most-in-stock">
          <h2 id="most-in-stock" className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            Most in stock today
          </h2>
          {lead ? (
            <>
              {/* Two lines reserved from lg, so the list under it stays put when the web font arrives. */}
              <p className="mt-2 max-w-2xl leading-7 text-muted lg:min-h-14">
                <Link href={`/${r.region}/stores/${lead.key}`} prefetch={false} className="font-semibold text-ink hover:text-brand">
                  {lead.name}
                </Link>{" "}
                has the most Pokémon sealed in stock: {plural(lead.inStock, "product")}, read <Ago iso={lead.lastOkAt!.toISOString()} initial={timeAgo(lead.lastOkAt)} />.
              </p>
              {top.length > 1 && (
                <h3 className="eyebrow mt-4">
                  The {top.length} {r.adjective} stores with the most in stock
                </h3>
              )}
              <ol className="card mt-3 divide-y divide-line overflow-hidden">
                {top.map((t, i) => (
                  <li key={t.key}>
                    <Link href={`/${r.region}/stores/${t.key}`} prefetch={false} className="group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 hover:bg-raised sm:px-5">
                      <span className="tabular text-sm font-semibold text-muted">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:text-brand">{t.name}</span>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-raised ring-1 ring-line" aria-hidden="true">
                          <span className="block h-full rounded-full bg-open" style={{ width: `${Math.max(4, Math.round((t.inStock / max) * 100))}%` }} />
                        </span>
                      </span>
                      <span className="tabular text-right text-sm font-semibold text-open">
                        {t.inStock.toLocaleString("en")}
                        <span className="block text-xs font-normal text-muted">in stock</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-muted">No store has been read in the last {OFFER_STALE_H} hours, so there is no in-stock count to rank right now.</p>
          )}
        </section>

        <section aria-labelledby="before-you-buy" className="lg:pt-1">
          <h2 id="before-you-buy" className="font-display text-xl font-bold tracking-tight">
            Before you buy
          </h2>
          <ul className="mt-4 space-y-3">
            <Note icon="truck" title="Prices exclude shipping">
              Every price is the store&rsquo;s own listed price in {r.currency}, before delivery. Shipping is added at the store&rsquo;s checkout and differs by
              store and order.
            </Note>
            <Note icon="calendar" title="Pre-order or in stock">
              A product from a set that isn&rsquo;t out yet is a pre-order: the store takes the order now and ships around the English release date. In stock means
              the store listed it as available when we last read it.
            </Note>
            <Note icon="clock" title={`“Not checked recently” after ${OFFER_STALE_H} hours`}>
              If we can&rsquo;t read a store for {OFFER_STALE_H} hours, its prices show as &ldquo;Not checked recently&rdquo; instead of in stock, until the next
              read succeeds.
            </Note>
            <Note icon="store" title="Marketplaces">
              {r.market === "US" ? (
                <>
                  TCGplayer, a marketplace of many sellers, is ranked with the stores by price and stock, and eBay listings appear on product pages marked
                  &ldquo;Ad&rdquo;. Both are affiliate links: we may earn a commission, at no cost to you. Neither changes the order of the stores.
                </>
              ) : (
                <>
                  eBay listings appear on product pages marked &ldquo;Ad&rdquo;, and eBay links are affiliate links: we may earn a commission, at no cost to you.
                  They never change the order of the stores.
                </>
              )}
            </Note>
          </ul>
        </section>
      </div>

      <section aria-labelledby="all-stores" className="mt-14">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 id="all-stores" className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            All {stores.length} stores, A–Z
          </h2>
          <p className="text-sm text-muted">
            Run a store and want to be listed?{" "}
            <Link href="/about#stores" className="font-semibold text-brand-strong hover:underline">
              See how
            </Link>
          </p>
        </div>
        <StoreTable r={r} rows={az} />
      </section>

      {/* After the list, not above it (the list is what the visitor came for). It is the page's one unit, so the strip above the footer is dropped. */}
      <NoPreFooter />
      <EbayStrip region={r.region} context="chase" placement="listings-store" className="mt-8" search={{ kind: "card", query: "" }} />
    </div>
  );
}

function Note({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted ring-1 ring-line">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm leading-6 text-muted">{children}</span>
      </span>
    </li>
  );
}

type Row = { s: StoreConfig; inStock: number; listed: number; lastOkAt: Date | null };

function StoreTable({ r, rows }: { r: RegionInfo; rows: Row[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[1fr_7rem_7rem_9rem] gap-4 border-b border-line bg-raised px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
        <span>Store</span>
        <span className="text-right">In stock</span>
        <span className="text-right">Listed</span>
        <span className="text-right">Last read</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ s, inStock, listed, lastOkAt }) => (
          <li key={s.key}>
            <Link href={`/${r.region}/stores/${s.key}`} prefetch={false} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-raised sm:grid-cols-[1fr_7rem_7rem_9rem] sm:items-center sm:px-5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-muted">
                  {storeHost(s)}
                  <span className="sm:hidden"> · read {lastOkAt ? <Ago iso={lastOkAt.toISOString()} initial={timeAgo(lastOkAt)} /> : "not yet"}</span>
                </span>
              </span>
              <span className={`tabular text-right font-semibold ${inStock ? "text-open" : "text-muted"}`}>
                {inStock}
                <span className="font-normal text-muted sm:hidden"> in stock</span>
              </span>
              <span className="tabular hidden text-right text-muted sm:block">{listed}</span>
              <span className="hidden text-right text-xs text-muted sm:block">{lastOkAt ? <Ago iso={lastOkAt.toISOString()} initial={timeAgo(lastOkAt)} /> : "not yet"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
