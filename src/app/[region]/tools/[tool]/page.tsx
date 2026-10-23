import Link from "@/components/Link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { FeeCalculator } from "@/components/tools/FeeCalculator";
import { ValueChecker } from "@/components/tools/ValueChecker";
import { guideFor } from "@/content/guides";
import { SETS } from "@/lib/sets";
import { guideHref, typeHref } from "@/content/guides/kit";
import { TOOL_BY_SLUG, TOOLS, toolHref, toolMetaTitle, toolRegions, type Tool } from "@/content/tools";
import { FEES_CHECKED, schedulesFor, scheduleText } from "@/lib/fees";
import { money } from "@/lib/format";
import { regionOrNotFound, type RegionInfo } from "@/lib/regions";
import { jsonLd, ORG_ID, pageMeta, regionAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// TODO(seo agent): move this builder into src/lib/seo.ts with the other JSON-LD builders (kept local to stay out of seo.ts).
function toolJsonLd(t: { title: string; description: string; path: string; faq: readonly { q: string; a: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebApplication", name: t.title, description: t.description, url: `${SITE_URL}${t.path}`, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@id": ORG_ID } },
      { "@type": "FAQPage", mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

// A tool: its own copy, steps and FAQ in the server HTML, and the calculator itself as a client island (src/components/tools). No
// database read: the value checker loads the region's CDN-cached browse index in the browser, like the header's search box.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES), like every page under [region].
export const dynamic = "force-dynamic";

function load(params: { region: string; tool: string }): { r: RegionInfo; t: Tool } {
  const r = regionOrNotFound(params.region);
  const t = TOOL_BY_SLUG.get(params.tool);
  if (!t) notFound();
  return { r, t };
}

export function generateMetadata({ params }: { params: { region: string; tool: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  const t = TOOL_BY_SLUG.get(params.tool);
  if (!t) return {};
  const meta = pageMeta({
    title: t.title,
    description: t.description,
    path: toolHref(r.region, t.slug),
    alternates: regionAlternates(r.region, `/tools/${t.slug}`, toolRegions(t)),
  });
  return { ...meta, title: toolMetaTitle(t.title) };
}

export default function ToolPage({ params }: { params: { region: string; tool: string } }) {
  const { r, t } = load(params);
  const path = toolHref(r.region, t.slug);
  const today = new Date().toISOString().slice(0, 10);
  const sets = SETS.filter((s) => s.releaseDate <= today && s.series === "Standard").slice(0, 4);
  const guides = t.guides.map((g) => guideFor(g, r.region)).filter((g): g is NonNullable<typeof g> => !!g);
  const others = TOOLS.filter((x) => x.slug !== t.slug);
  const schedules = schedulesFor(r.market);
  const m = (c: number) => money(c, r.market);

  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { href: `/${r.region}/tools`, label: "Tools" }, { label: t.title }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">{t.kicker}</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-3 text-lg leading-8 text-muted">{t.lede}</p>
      </header>

      {t.slug === "value-checker" && (
        <ValueChecker region={r.region} market={r.market} place={r.inName} examples={sets.slice(0, 3).flatMap((s, i) => (i === 0 ? [`${s.name} play booster box`, `${s.name} collector booster box`] : [`${s.name} bundle`]))} />
      )}
      {t.slug === "selling-fee-calculator" && <FeeCalculator region={r.region} market={r.market} schedules={schedules.map((s) => ({ key: s.key }))} />}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,68ch)_minmax(0,1fr)] lg:gap-16">
        <article className="min-w-0">
          <section aria-labelledby="how">
            <h2 id="how" className="font-display text-2xl font-bold tracking-tight">
              How to use it
            </h2>
            <ol className="mt-4 grid gap-2">
              {t.steps.map((s, i) => (
                <li key={s} className="flex gap-3 rounded-xl border border-line bg-surface p-3.5 text-[15px] leading-6">
                  <span aria-hidden="true" className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{s}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="about" className="mt-12">
            <h2 id="about" className="font-display text-2xl font-bold tracking-tight">
              About the {t.kicker.toLowerCase()}
            </h2>
            <div className="prose-dex mt-4">
              {t.about.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {t.slug === "selling-fee-calculator" &&
                (schedules.length ? (
                  <p>
                    The presets for {r.inName}, as eBay published them when we checked on {FEES_CHECKED}:{" "}
                    {schedules.map((s, i) => (
                      <span key={s.key}>
                        {i > 0 && "; "}
                        <strong>{s.label}</strong>: {scheduleText(s, m)}
                      </span>
                    ))}
                    . Your own rate is in Seller Hub.
                  </p>
                ) : (
                  <p>
                    We keep eBay’s published rates for Australia and the US. In {r.inName}, choose Custom and enter the final value fee and per-order fee your
                    Seller Hub shows; the calculator works the same way with any marketplace’s percentage fee.
                  </p>
                ))}
            </div>
          </section>

          <section aria-labelledby="faq" className="mt-12">
            <h2 id="faq" className="font-display text-2xl font-bold tracking-tight">
              Questions
            </h2>
            <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {t.faq.map((f) => (
                <div key={f.q} className="p-4 sm:p-5">
                  <dt className="font-semibold leading-6 text-ink">{f.q}</dt>
                  <dd className="mt-1.5 text-[15px] leading-6 text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>

        <aside className="min-w-0" aria-label="Related">
          {guides.length > 0 && (
            <section>
              <h2 className="eyebrow">Guides</h2>
              <ul className="mt-3 grid gap-2">
                {guides.map((g) => (
                  <li key={g.slug}>
                    <Link href={guideHref(r, g.slug)} prefetch={false} className="card group flex items-start gap-3 p-3.5 transition-shadow hover:shadow-lift">
                      <Icon name="arrow-right" size={16} className="mt-1 shrink-0 text-muted group-hover:text-brand" />
                      <span className="font-semibold leading-6 group-hover:text-brand">{g.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-8">
            <h2 className="eyebrow">More tools</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {others.map((x) => (
                <li key={x.slug}>
                  <Link href={toolHref(r.region, x.slug)} prefetch={false} className="chip min-h-10">
                    {x.title.replace(/^MTG /, "").replace(/^./, (c) => c.toUpperCase())}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-8">
            <h2 className="eyebrow">Prices in {r.inName} today</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              <li>
                <Link href={`/${r.region}/deals`} prefetch={false} className="chip min-h-10">
                  Today’s deals
                </Link>
              </li>
              <li>
                <Link href={`/${r.region}/cheapest-packs`} prefetch={false} className="chip min-h-10">
                  Cheapest per pack
                </Link>
              </li>
              <li>
                <Link href={typeHref(r, "play-booster-box") ?? `/${r.region}/sealed`} prefetch={false} className="chip min-h-10">
                  Play Booster Boxes
                </Link>
              </li>
              <li>
                <Link href={typeHref(r, "collector-booster-box") ?? `/${r.region}/sealed`} prefetch={false} className="chip min-h-10">
                  Collector Booster Boxes
                </Link>
              </li>
              {sets.slice(0, 3).map((s) => (
                <li key={s.code}>
                  <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="chip min-h-10">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(toolJsonLd({ title: t.title, description: t.description, path, faq: t.faq })) }} />
    </div>
  );
}
