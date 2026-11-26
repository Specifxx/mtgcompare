import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { boxValueHref, boxValueRanking, RANK_FLOOR } from "@/lib/box-ev/page-data";
import { KIND_LABEL } from "@/lib/box-ev/shared";
import { detailIndexed } from "@/lib/index-tiers";
import { regionOrNotFound, REGIONS } from "@/lib/regions";
import { pageMeta, regionAlternates } from "@/lib/seo";

// Which Magic box opens best: every box we can value (src/content/box-odds), its average opened value at the default floor against
// the cheapest US box. Rendered per request and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES).
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

export function generateMetadata({ params }: { params: { region: string } }): Metadata {
  const r = regionOrNotFound(params.region);
  return pageMeta({
    title: "Which MTG Booster Box Is Worth Opening? Expected Value by Set",
    description: "Every Magic booster box we can value, ranked by what its cards are worth against what the box costs. Worked out from Wizards' published pull rates and TCGplayer prices.",
    path: `/${r.region}/box-value`,
    alternates: detailIndexed(r.region) ? regionAlternates(r.region, "/box-value", Object.values(REGIONS).filter((x) => detailIndexed(x.region))) : undefined,
    noindex: !detailIndexed(r.region),
  });
}

export default async function BoxValueIndex({ params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const rows = await boxValueRanking();
  const top = Math.max(...rows.map((x) => x.ratio ?? 0), 1);
  return (
    <div className="page py-8">
      <Breadcrumbs items={[{ href: `/${r.region}`, label: r.name }, { label: "Box worth" }]} />
      <header className="max-w-3xl">
        <div className="eyebrow">Box worth</div>
        <h1 className="page-title mt-2">Which Magic box is worth opening?</h1>
        <p className="page-lead mt-3">
          What the cards in an average box are worth against what the box costs, best first. Wizards&rsquo; published pull rates, TCGplayer&rsquo;s US$ card prices, cards
          under {usd(RANK_FLOOR)} counted as nothing.
        </p>
      </header>

      <ol className="mt-8 grid grid-cols-1 gap-3">
        {rows.map((x, i) => {
          const good = x.ratio != null && x.ratio >= 1;
          return (
            <li key={`${x.set.code}-${x.kind}`}>
              <Link href={boxValueHref(r.region, x.set.slug, x.kind)} className="card lift group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 sm:p-5">
                <span aria-hidden="true" className="tabular flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink group-hover:underline">{x.set.name}</span>
                  <span className="block text-sm text-muted">{KIND_LABEL[x.kind]}</span>
                </span>
                <span className="text-right">
                  <span className="tabular block text-lg font-bold text-ink">{usd(x.ev)}</span>
                  <span className="block text-xs text-muted">{x.price ? `box ${usd(x.price)}` : "no US price"}</span>
                </span>
                {x.ratio != null && (
                  <span className="col-span-3 flex items-center gap-3">
                    <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                      <span className={`block h-full rounded-full ${good ? "bg-open" : "bg-stale"}`} style={{ width: `${Math.min(100, (x.ratio / top) * 100)}%` }} />
                    </span>
                    <span className={`tabular shrink-0 text-xs font-bold ${good ? "text-open" : "text-stale"}`}>{Math.round(x.ratio * 100)}% back</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 max-w-3xl text-sm text-muted">
        &ldquo;% back&rdquo; is the average box&rsquo;s cards at TCGplayer&rsquo;s market price, divided by the cheapest US box today, before selling fees. Open a set to change
        which cards count and to see how often a single box beats its price.
      </p>
    </div>
  );
}
