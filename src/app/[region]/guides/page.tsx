import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { guidesFor } from "@/content/guides";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { andList, fixedPacks, newestReleased, packsBySeries, upcomingSets } from "@/content/guides/facts";
import { GuideCard, guideHref, setHref, typeHref } from "@/content/guides/kit";
import { regionOrNotFound } from "@/lib/regions";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// The guides index: the region's guides as cards. Built from the registry alone: no database read.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return pageMeta({
    title: `Pokémon sealed buying guides for ${r.inName}`,
    description: `Plain-English guides to buying Pokémon TCG sealed product in ${r.inName}: pack counts, booster box vs ETB vs bundle, pre-orders and more, with today’s prices.`,
    path: `/${r.region}/guides`,
    alternates: regionAlternates(r.region, "/guides"),
  });
}

export default function GuidesIndex({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const list = guidesFor(r.region);
  const [etbNow, etbBefore] = packsBySeries("etb");
  const today = new Date().toISOString().slice(0, 10);
  // Where the guides lead: the product types and the newest sets (sets.ts), as plain internal links.
  const sets = [...upcomingSets(today).slice(0, 2), ...newestReleased(today, 6)];
  // The answer most people come for, before they pick a guide: pack counts from packs.ts.
  const quick = [
    { k: "Booster box", v: fixedPacks("booster-box"), href: typeHref(r, "booster-box") },
    { k: "Elite Trainer Box", v: etbNow.packs, href: typeHref(r, "etb") },
    { k: "Booster bundle", v: fixedPacks("booster-bundle"), href: typeHref(r, "booster-bundle") },
    { k: "Build & Battle Box", v: fixedPacks("build-battle"), href: typeHref(r, "build-battle") },
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Pokémon sealed buying guides (${r.name})`,
    itemListElement: list.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.title, url: `${SITE_URL}${guideHref(r, g.slug)}` })),
  };
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Guides" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Guides</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Pokémon sealed buying guides</h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          Plain-English answers to what people ask before they buy Pokémon TCG sealed product in {r.inName}. Pack counts come from the publisher’s product listings, as
          recorded in our data, and prices from today’s listings at the stores we compare.
        </p>
      </header>

      <section aria-labelledby="quick" className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="quick" className="font-display text-lg font-bold">
            Packs at a glance
          </h2>
          <Link href={guideHref(r, "how-many-packs-in-pokemon-products")} prefetch={false} className="text-sm font-semibold text-brand hover:underline">
            Every product’s pack count →
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q) => (
            <div key={q.k} className="rounded-xl border border-line bg-raised px-4 py-3">
              <dt className="text-xs font-medium text-muted">
                <Link href={q.href} prefetch={false} className="hover:text-brand hover:underline">
                  {q.k}
                </Link>
              </dt>
              <dd className="tabular mt-1 font-display text-2xl font-bold">
                {q.v} <span className="text-sm font-semibold text-muted">packs</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted">
          Elite Trainer Boxes: {etbNow.packs} in {andList([...etbNow.series].reverse())} sets, {etbBefore.packs} in older ones.
        </p>
      </section>

      <ul role="list" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <li key={g.slug}>
            <GuideCard r={r} guide={g} />
          </li>
        ))}
        {/* The one guide that compares every market: the same page from every region's index. */}
        <li>
          <Link href={COUNTRY_GUIDE.path} prefetch={false} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-lift sm:p-6">
            <span className="eyebrow">{COUNTRY_GUIDE.kicker}</span>
            <h2 className="mt-2 font-display text-xl font-bold leading-snug tracking-tight group-hover:text-brand">{COUNTRY_GUIDE.h1}</h2>
            <p className="mt-2 flex-1 text-[15px] leading-6 text-muted">{COUNTRY_GUIDE.description}</p>
            <span className="mt-4 flex items-center justify-end gap-1 text-xs font-semibold text-brand">Compare all seven markets →</span>
          </Link>
        </li>
      </ul>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="by-product">
          <h2 id="by-product" className="font-display text-xl font-bold tracking-tight">
            Compare by product
          </h2>
          <ul role="list" className="mt-4 flex flex-wrap gap-2">
            {PRODUCT_TYPES.slice(0, 10).map((t) => (
              <li key={t.slug}>
                <Link href={typeHref(r, t.key)} prefetch={false} className="chip min-h-10">
                  {t.plural}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="by-set">
          <h2 id="by-set" className="font-display text-xl font-bold tracking-tight">
            Newest sets
          </h2>
          <ul role="list" className="mt-4 flex flex-wrap gap-2">
            {sets.map((s) => (
              <li key={s.code}>
                <Link href={setHref(r, s)} prefetch={false} className="chip min-h-10">
                  {s.name}
                  {s.releaseDate > today && <span className="rounded-full bg-pre-soft px-1.5 text-[11px] font-semibold text-pre">Coming soon</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}
