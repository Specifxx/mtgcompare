import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Empty } from "@/components/Section";
import { StockRow } from "@/components/StockRow";
import { plural } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import { regionOrNotFound } from "@/lib/regions";
import { itemListJsonLd, jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { seoCopy, seoTitleText } from "@/lib/seo-titles";
import { olderCutoff, OLDER_MONTHS } from "@/lib/stock";
import { olderInStockData } from "@/lib/stock-data";

// /<region>/out-of-print: older sets' booster boxes, bundles and Commander decks that independent stores still have in stock today,
// grouped by set, the sets most stores carry first (lib/stock.ts groupOlderInStock). "Older" is a release date OLDER_MONTHS or more
// ago (sets.ts): a fact of the calendar, not a claim that Wizards has stopped printing it, and the copy says no more than that.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES), never ISR; reads no cookie.
export const dynamic = "force-dynamic";

/** At most this many products per set on the page (its set page has the rest). */
const PER_SET = 6;

export async function generateMetadata({ params }: { params: { region: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const groups = await olderInStockData(r.market);
  const title = seoCopy.oopTitle(r);
  return {
    ...pageMeta({
      title: seoTitleText(title),
      description: seoCopy.oopDescription(r, groups.length, groups.reduce((n, g) => n + g.stores, 0)),
      path: `/${r.region}/out-of-print`,
      alternates: regionAlternates(r.region, "/out-of-print"),
    }),
    title,
  };
}

export default async function OutOfPrintPage({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const today = new Date().toISOString().slice(0, 10);
  const groups = await olderInStockData(r.market, today);
  const path = `/${r.region}/out-of-print`;
  const shown = groups.flatMap((g) => g.items.slice(0, PER_SET));
  const ld = shown.length ? itemListJsonLd({ name: `Older Magic sets in stock in ${r.inName}`, path, items: shown.map((p) => ({ path: `/${r.region}/p/${p.slug}`, name: p.name, image: p.imageUrl })) }) : null;
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Older sets in stock" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Stock · {r.name}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Older MTG sets still in stock in {r.inName}</h1>
        <p className="mt-3 leading-7 text-muted">
          Booster boxes, bundles and Commander decks from sets released more than {OLDER_MONTHS} months ago (before {formatRelease(olderCutoff(today))}) that {r.adjective} stores, often local game
          stores, still have on the shelf today. Sets most stores carry come first. Older product is usually at only a few stores and its prices can move a lot; we show today&rsquo;s stock and
          price, and say nothing about where they will go.
        </p>
      </header>
      {groups.length ? (
        <div className="mt-8 grid gap-10">
          {groups.map((g) => (
            <section key={g.set.code} aria-labelledby={`set-${g.set.code}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={`set-${g.set.code}`} className="font-display text-xl font-bold tracking-tight">
                  <Link href={`/${r.region}/sets/${g.set.slug}`} prefetch={false} className="hover:text-brand">
                    {g.set.name}
                  </Link>
                </h2>
                <span className="text-sm text-muted">
                  Released {formatRelease(g.set.releaseDate)} · {plural(g.items.length, "product")} in stock
                </span>
              </div>
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                {g.items.slice(0, PER_SET).map((p) => (
                  <li key={p.slug}>
                    <StockRow p={p} r={r} />
                  </li>
                ))}
              </ol>
              {g.items.length > PER_SET && (
                <Link href={`/${r.region}/sets/${g.set.slug}`} prefetch={false} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-strong hover:underline">
                  All {g.items.length} in stock from {g.set.name} →
                </Link>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <Empty actions={[{ href: `/${r.region}/sets`, label: "Every set" }]}>No {r.adjective} store we track has an older set&rsquo;s booster box, bundle or Commander deck in stock today.</Empty>
        </div>
      )}
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />}
    </div>
  );
}
