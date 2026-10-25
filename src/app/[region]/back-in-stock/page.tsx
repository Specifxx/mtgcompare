import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductRail } from "@/components/ProductRail";
import { Empty, Section } from "@/components/Section";
import { StockRow } from "@/components/StockRow";
import { newlyTracked, digestCopy } from "@/lib/deals";
import { isoOfDay } from "@/lib/price-history";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound } from "@/lib/regions";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { seoCopy, seoTitleText } from "@/lib/seo-titles";
import { BACK_DAYS, MIN_DAYS_BACK } from "@/lib/stock";
import { backInStockData } from "@/lib/stock-data";

// /<region>/back-in-stock: products the daily price history (lib/price-history.ts) shows with nothing open in one snapshot and in
// stock in a later one, within the last week, and still in stock in the latest (lib/stock.ts backInStock). Under two days of
// snapshots it says so and shows nothing. Below it, what MTG Compare started tracking lately (deals.ts newlyTracked), labelled as
// exactly that. Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES), never ISR; reads no cookie.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const { items } = await backInStockData(r.market);
  const title = seoCopy.backTitle(r);
  return {
    ...pageMeta({ title: seoTitleText(title), description: seoCopy.backDescription(r, items.length), path: `/${r.region}/back-in-stock`, alternates: regionAlternates(r.region, "/back-in-stock") }),
    title,
  };
}

export default async function BackInStockPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const [data, fresh] = await Promise.all([backInStockData(r.market), newlyTracked(r.market, 12)]);
  const path = `/${r.region}/back-in-stock`;
  const ld = data.items.length ? itemListJsonLd({ name: `Back in stock in ${r.inName}`, path, items: data.items.map(({ card }) => ({ path: `/${r.region}/p/${card.slug}`, name: card.name, image: card.imageUrl })) }) : null;
  const latest = data.through != null ? formatRelease(isoOfDay(data.through)) : null;
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Back in stock" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Stock · {r.name}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Back in stock in {r.inName}</h1>
        <p className="mt-3 leading-7 text-muted">
          Magic sealed product that no {r.adjective} store we track had in stock in one daily check, and that a store has in stock again in a later one (in the last {BACK_DAYS} days), most recent first.
          Store counts are independent stores; TCGplayer is shown apart. Stock moves fast: the store&rsquo;s own page is final.
        </p>
        <p className="mt-2 text-sm text-muted">
          {data.days > 0 ? `From MTG Compare's daily snapshots: ${data.days} ${data.days === 1 ? "day" : "days"} so far${latest ? `, the latest ${latest}` : ""}.` : "MTG Compare's daily snapshots are not available right now."}
        </p>
      </header>

      <Section id="back" title="Back in stock" kicker={data.enough ? `Last ${BACK_DAYS} days` : undefined}>
        {!data.enough ? (
          <Empty actions={[{ href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" }, { href: `/${r.region}/out-of-print`, label: "Older sets in stock" }]}>
            Not enough history yet: this list needs at least {MIN_DAYS_BACK} daily snapshots, and MTG Compare has {data.days}. It fills in by itself as the days are recorded.
          </Empty>
        ) : data.items.length ? (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
            {data.items.map(({ card, back }) => (
              <li key={card.slug}>
                <StockRow p={card} r={r} extra={<span className="text-[11px] text-muted">in stock again {formatRelease(isoOfDay(back.day))}</span>} />
              </li>
            ))}
          </ol>
        ) : (
          <Empty actions={[{ href: `/${r.region}/sealed?stock=in`, label: "Everything in stock" }, { href: `/${r.region}/out-of-print`, label: "Older sets in stock" }]}>
            Nothing came back into stock at a {r.adjective} store in the last {BACK_DAYS} days of snapshots.
          </Empty>
        )}
      </Section>

      <Section id="new" title="Newly listed" kicker="Recently added">
        <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">{digestCopy.newLabel}.</p>
        {fresh.length ? (
          <ProductRail products={fresh} region={r.region} label="Newly listed" />
        ) : (
          <Empty actions={[{ href: `/${r.region}/releases`, label: "Upcoming releases" }]}>MTG Compare hasn&rsquo;t started tracking anything new in {r.inName} in the last 14 days.</Empty>
        )}
      </Section>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}
