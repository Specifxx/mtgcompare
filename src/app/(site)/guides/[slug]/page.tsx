import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Ago } from "@/components/Ago";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { countryFaqs, COUNTRY_GUIDE, BOX, marketLines, setByCode } from "@/content/guides/country-prices";
import { countryOutline, CountryBody } from "@/content/guides/country-prices-body";
import { loadCountryData } from "@/content/guides/country-prices-data";
import { Toc, TocDisclosure } from "@/content/guides/kit";
import { timeAgo } from "@/lib/format";
import { hubTitle, titleText } from "@/lib/hub-copy";
import { formatRelease } from "@/lib/release";
import { articleJsonLd, jsonLd, ogCardImage, pageMeta } from "@/lib/seo";

// /guides/<slug>: the guides that compare every market at once, so they belong to no region (one canonical URL, no hreflang). Today
// there is one, "Pokémon booster box prices by country" (src/content/guides/country-prices*.ts{,x}); any other slug is a 404, and
// next.config.js still sends every other /guides/<old slug> of the old site to /about before it gets here.
//
// Never at build, so a build reads no data (src/lib/build-env.ts).
// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), never ISR: an ISR write
// costs about twenty renders, and the data only changes with a release, which empties the CDN anyway.
export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

export function generateMetadata({ params }: Params): Metadata {
  if (params.slug !== COUNTRY_GUIDE.slug) return {};
  const title = hubTitle(COUNTRY_GUIDE.title);
  const meta = pageMeta({ title: titleText(title), description: COUNTRY_GUIDE.description, path: COUNTRY_GUIDE.path });
  return {
    ...meta,
    title,
    openGraph: {
      ...meta.openGraph,
      type: "article",
      publishedTime: COUNTRY_GUIDE.published,
      modifiedTime: COUNTRY_GUIDE.updated,
      images: [ogCardImage(`/og/guides/${COUNTRY_GUIDE.slug}`, COUNTRY_GUIDE.title)],
    },
  };
}

export default async function CrossMarketGuide({ params }: Params) {
  if (params.slug !== COUNTRY_GUIDE.slug) notFound();
  const data = await loadCountryData();
  const toc = countryOutline(data).sections.map(({ id, title }) => ({ id, title }));
  const lead = data.sets[0] ? setByCode(data.sets[0]) : null;
  const faqs = countryFaqs(lead ? { set: lead, lines: marketLines(data.cards, lead.code, BOX) } : null, data.today);
  const ld = [
    articleJsonLd({ title: COUNTRY_GUIDE.title, description: COUNTRY_GUIDE.description, path: COUNTRY_GUIDE.path, published: COUNTRY_GUIDE.published, updated: COUNTRY_GUIDE.updated }),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: "/", label: "DexCompare" }, { label: "Booster box prices by country" }]} />
      <div className="lg:grid lg:grid-cols-[minmax(0,68ch)_14rem] lg:gap-x-12 xl:gap-x-20">
        <article className="min-w-0 max-w-[68ch]">
          <header>
            <div className="eyebrow">{COUNTRY_GUIDE.kicker}</div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{COUNTRY_GUIDE.h1}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="font-medium text-ink">By DexCompare</span>
              <span aria-hidden="true">·</span>
              <span>
                Updated <time dateTime={COUNTRY_GUIDE.updated}>{formatRelease(COUNTRY_GUIDE.updated)}</time>
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
          <CountryBody data={data} />
        </article>
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--hdr)+2rem)] max-h-[calc(100vh-var(--hdr)-4rem)] overflow-y-auto pb-6 pt-1">
            <Toc sections={toc} />
          </div>
        </aside>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}
