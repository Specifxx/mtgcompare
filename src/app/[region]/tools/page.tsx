import Link from "@/components/Link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { TOOLS, toolHref } from "@/content/tools";
import { regionOrNotFound } from "@/lib/regions";
import { jsonLd, pageMeta, regionAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// The tools index: the registry as cards (src/content/tools). No database read.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return pageMeta({
    title: "MTG tools: sealed value checker and eBay fee calculator",
    description: `Free Magic: The Gathering tools for ${r.inName}: a sealed value checker and an eBay selling-fee calculator.`,
    path: `/${r.region}/tools`,
    alternates: regionAlternates(r.region, "/tools"),
  });
}

export default function ToolsIndex({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `MTG tools (${r.name})`,
    itemListElement: TOOLS.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title, url: `${SITE_URL}${toolHref(r.region, t.slug)}` })),
  };
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Tools" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Tools</div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">MTG tools</h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          Free calculators for buying and selling sealed Magic in {r.inName}. The value checker reads today’s prices at the stores we compare; the fee calculator works
          from the numbers you enter, in {r.currency}, and keep them in your own browser.
        </p>
      </header>
      <ul role="list" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <li key={t.slug}>
            <Link href={toolHref(r.region, t.slug)} prefetch={false} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-lift sm:p-6">
              <span className="eyebrow">{t.kicker}</span>
              <h2 className="mt-2 font-display text-xl font-bold leading-snug tracking-tight group-hover:text-brand">{t.title}</h2>
              <p className="mt-2 flex-1 text-[15px] leading-6 text-muted">{t.description}</p>
              <span className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand">
                Open <Icon name="arrow-right" size={14} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 max-w-3xl text-sm leading-6 text-muted">
        Looking for a price? <Link href={`/${r.region}/deals`} className="font-semibold text-brand hover:underline">Today’s deals</Link> list sealed products under the median
        store price, and <Link href={`/${r.region}/guides`} className="font-semibold text-brand hover:underline">the guides</Link> explain what each product holds.
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </div>
  );
}
