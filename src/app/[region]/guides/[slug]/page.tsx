import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoPreFooter } from "@/components/Ebay";
import { Icon } from "@/components/Icon";
import { loadGuideData } from "@/content/guides/data";
import { guideFor, guideMetaTitle, guideRegions, guidesFor } from "@/content/guides";
import { GuideCard, Toc, TocDisclosure, typeHref } from "@/content/guides/kit";
import { GUIDE_MODULES } from "@/content/guides/modules";
import { timeAgo } from "@/lib/format";
import { regionOrNotFound } from "@/lib/regions";
import { formatRelease } from "@/lib/release";
import { TYPE_BY_KEY } from "@/lib/sealed-title";
import { articleJsonLd, jsonLd, ogCardImage, pageMeta, regionAlternates } from "@/lib/seo";

// A guide: evergreen prose from src/content/guides/<slug>.tsx and live blocks rendered from the region's prices at render time. Never
// at build: a build must not depend on the database.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string; slug: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  const g = guideFor(params.slug, r.region);
  if (!g) return {};
  const meta = pageMeta({
    title: g.title,
    description: g.description,
    path: `/${r.region}/guides/${g.slug}`,
    // hreflang lists only the regions the guide is offered in (the MSRP guide: the US alone).
    alternates: regionAlternates(r.region, `/guides/${g.slug}`, guideRegions(g)),
  });
  return {
    ...meta,
    title: guideMetaTitle(g.title),
    openGraph: { ...meta.openGraph, type: "article", publishedTime: g.published, modifiedTime: g.updated, images: [ogCardImage(`/og/guides/${g.slug}`, g.title)] },
  };
}

export default async function GuidePage({ params }: { params: { region: string; slug: string } }) {
  const r = regionOrNotFound(params.region);
  const g = guideFor(params.slug, r.region);
  if (!g) notFound();
  const mod = GUIDE_MODULES[g.slug];
  const data = await loadGuideData(g.slug, r);
  const toc = mod.outline(r, data).sections.map(({ id, title }) => ({ id, title }));
  const path = `/${r.region}/guides/${g.slug}`;
  const more = guidesFor(r.region).filter((x) => x.slug !== g.slug);
  const related = [
    { href: `/${r.region}/deals`, label: "Today’s deals", sub: `Prices in ${r.inName} today`, icon: "tag" as const },
    { href: `/${r.region}/cheapest-packs`, label: "Cheapest per pack", sub: "Every set, by price per pack", icon: "check" as const },
    { href: `/${r.region}/releases`, label: "Release calendar", sub: "New and upcoming sets", icon: "calendar" as const },
    { href: `/${r.region}/stores`, label: "Where to buy", sub: `The stores we compare in ${r.inName}`, icon: "store" as const },
  ];

  return (
    <div className="page py-8">
      {/* The guide's own strip (after its first live block) is its one eBay unit: the layout's pre-footer strip stands down. */}
      <NoPreFooter />
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/guides`, label: "Guides" }, { label: g.title }]} />
      <div className="lg:grid lg:grid-cols-[minmax(0,68ch)_14rem] lg:gap-x-12 xl:gap-x-20">
        <article className="min-w-0 max-w-[68ch]">
          <header>
            <div className="eyebrow">{g.kicker}</div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{g.title}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="font-medium text-ink">By DexCompare</span>
              <span aria-hidden="true">·</span>
              <span>
                Updated <time dateTime={g.updated}>{formatRelease(g.updated)}</time>
              </span>
              {data.checked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    prices checked <Ago iso={data.checked} initial={timeAgo(data.checked)} />
                  </span>
                </>
              )}
            </p>
          </header>
          <TocDisclosure sections={toc} />
          <mod.Body r={r} data={data} />
        </article>
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--hdr)+2rem)] max-h-[calc(100vh-var(--hdr)-4rem)] overflow-y-auto pb-6 pt-1">
            <Toc sections={toc} />
          </div>
        </aside>
      </div>

      <section aria-labelledby="related" className="mt-16 border-t border-line pt-10">
        <h2 id="related" className="font-display text-2xl font-bold tracking-tight">
          Related
        </h2>
        <ul role="list" className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {related.map((l) => (
            <li key={l.href}>
              <Link href={l.href} prefetch={false} className="card group flex h-full flex-col items-start gap-2 p-3.5 transition-shadow hover:shadow-lift sm:flex-row sm:gap-3 sm:p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                  <Icon name={l.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold group-hover:text-brand">{l.label}</span>
                  <span className="block text-sm text-muted">{l.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {g.topic.types && g.topic.types.length > 0 && (
          <ul role="list" className="mt-4 flex flex-wrap gap-2">
            {g.topic.types.map((t) => (
              <li key={t}>
                <Link href={typeHref(r, t)} prefetch={false} className="chip min-h-10">
                  {TYPE_BY_KEY.get(t)!.plural} in {r.inName}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {more.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl font-bold tracking-tight">More guides</h2>
            <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((x) => (
                <li key={x.slug}>
                  <GuideCard r={r} guide={x} headingLevel={3} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd({ title: g.title, description: g.description, path, published: g.published, updated: g.updated })) }}
      />
    </div>
  );
}
