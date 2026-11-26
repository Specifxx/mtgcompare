import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BoxWorth } from "@/components/box-worth/BoxWorth";
import { boxValuePage, RANK_FLOOR, type BoxValuePage } from "@/lib/box-ev/page-data";
import { KIND_LABEL } from "@/lib/box-ev/shared";
import { CARDS_HUB } from "@/lib/cards";
import { detailIndexed } from "@/lib/index-tiers";
import { regionOrNotFound, REGIONS } from "@/lib/regions";
import { jsonLd, pageMeta, regionAlternates, withMtg } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { cache } from "react";

// Box worth (DECISIONS.md 2026-11-26 "Box worth: published odds only"): is a box of this set worth opening? Wizards' published
// odds (src/content/box-odds) against TCGplayer's US$ card prices (lib/cards.ts), worked out in lib/box-ev. Rendered per request
// and kept by Vercel's CDN for a day (next.config.js, CDN_PAGES) like every page under [region]; the data changes only with a release.
export const dynamic = "force-dynamic";

const load = cache((region: string, set: string) => boxValuePage(regionOrNotFound(region), set));

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const dayText = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

function describe(d: BoxValuePage): string {
  const parts = d.boxes.map((b) => {
    const ev = d.ev[b.kind] ?? 0;
    const price = d.prices[b.kind]?.us?.cents;
    return `a ${KIND_LABEL[b.kind]} opens to about ${usd(ev)} in cards${price ? ` (box ${usd(price)})` : ""}`;
  });
  return `Is a ${d.set.name} box worth opening? On average ${parts.join("; ")}. Worked out from Wizards' published pull rates and TCGplayer prices, with the best pulls and their odds.`;
}

export async function generateMetadata({ params }: { params: { region: string; set: string } }): Promise<Metadata> {
  const r = regionOrNotFound(params.region);
  const d = await load(params.region, params.set);
  if (!d) return {};
  const path = `/${r.region}/box-value/${d.set.slug}`;
  return pageMeta({
    title: `Is a ${withMtg(d.set.name)} Box Worth Opening? Expected Value`,
    description: describe(d),
    path,
    alternates: detailIndexed(r.region) ? regionAlternates(r.region, `/box-value/${d.set.slug}`, Object.values(REGIONS).filter((x) => detailIndexed(x.region))) : undefined,
    noindex: !detailIndexed(r.region),
  });
}

export default async function BoxValueSetPage({ params }: { params: { region: string; set: string } }) {
  const r = regionOrNotFound(params.region);
  const d = await load(params.region, params.set);
  if (!d) notFound();
  const { set, odds } = d;
  const path = `/${r.region}/box-value/${set.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Is a ${withMtg(set.name)} box worth opening?`,
    description: describe(d),
    url: `${SITE_URL}${path}`,
    isBasedOn: odds.source,
    dateModified: d.pricesAt || undefined,
  };
  const unmatched = d.boxes.flatMap((b) => b.notCounted.filter((n) => n.why === "unmatched").map((n) => ({ ...n, kind: b.kind })));
  const lt1 = d.boxes.reduce((t, b) => t + b.notCounted.filter((n) => n.why === "lt1").length, 0);

  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <Breadcrumbs
        items={[
          { href: `/${r.region}`, label: r.name },
          { href: `/${r.region}/box-value`, label: "Box worth" },
          { label: set.name },
        ]}
      />
      <header className="max-w-3xl">
        <div className="eyebrow">Box worth · {set.name}</div>
        <h1 className="page-title mt-2">Is a {withMtg(set.name)} box worth opening?</h1>
        <p className="page-lead mt-3">What the cards in a box are worth on average, how often a box beats its price, and the pulls that make it. From Wizards&rsquo; own pull rates.</p>
      </header>

      <BoxWorth setName={set.name} boxes={d.boxes} prices={d.prices} />

      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,68ch)_minmax(0,1fr)] lg:gap-12">
        <section aria-labelledby="how" className="min-w-0">
          <h2 id="how" className="font-display text-2xl font-bold tracking-tight">
            How it&rsquo;s worked out
          </h2>
          <ul className="mt-4 grid gap-2 text-[15px] leading-6">
            <li className="rounded-xl border border-line bg-surface p-3.5">
              <strong>Odds:</strong> every percentage is Wizards&rsquo; own, from{" "}
              <a href={odds.source} rel="noopener" target="_blank" className="font-semibold text-brand-strong underline underline-offset-2">
                {odds.sourceTitle}
              </a>{" "}
              (read {dayText(odds.read)}). Nothing is guessed.
            </li>
            <li className="rounded-xl border border-line bg-surface p-3.5">
              <strong>Prices:</strong> TCGplayer&rsquo;s US$ market price of each card and finish (recent sales), updated daily
              {d.pricesAt ? `; these are from ${dayText(d.pricesAt)}` : ""}. Before selling fees.
            </li>
            <li className="rounded-xl border border-line bg-surface p-3.5">
              <strong>A floor, not a promise:</strong> anything Wizards lists as &ldquo;less than 1%&rdquo; counts as zero, so the real average is a little higher.
            </li>
          </ul>
          <details className="group mt-4 rounded-xl border border-line bg-surface p-3.5 text-sm leading-6 text-muted">
            <summary className="cursor-pointer font-semibold text-ink">The fine print</summary>
            <div className="mt-3 space-y-3">
              <p>
                Within each line of Wizards&rsquo; odds (&ldquo;a rare from the main set, 80.4%&rdquo;) every card is counted as equally likely: Wizards prints the odds of
                the line, not of each card. Where Wizards names the cards a slot can hold but prints no odds (the commons, most uncommons), each card in that pool is
                counted as equally likely too.
              </p>
              <p>
                The average adds up every slot of every pack. The 2,000 boxes are opened one card at a time with the same odds, which shows the spread a single
                average hides. Cards under the floor you pick count as nothing (by default under {usd(RANK_FLOOR)}), because bulk rarely sells for its market price.
                Cards with no recent TCGplayer sale are left out of their line&rsquo;s average.
              </p>
              {lt1 > 0 && <p>{lt1} lines printed as &ldquo;less than 1%&rdquo; are counted as zero.</p>}
              {unmatched.length > 0 && (
                <div>
                  <p>Counted as zero because we can&rsquo;t yet single out those cards in TCGplayer&rsquo;s list:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {unmatched.map((n) => (
                      <li key={`${n.kind}-${n.slot}-${n.label}`}>
                        {KIND_LABEL[n.kind]}, {n.slot.toLowerCase()}: {n.label.toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </section>
        <aside className="min-w-0 space-y-3 self-start">
          <div className="card p-5">
            <div className="eyebrow">Next</div>
            <ul className="mt-3 grid gap-2 text-sm font-semibold">
              <li>
                <Link href={`/${r.region}/sets/${set.slug}`} className="text-brand-strong hover:underline">
                  Every {set.name} product, store by store →
                </Link>
              </li>
              <li>
                <Link href={`${CARDS_HUB}/${d.group}`} className="text-brand-strong hover:underline">
                  {set.name} card prices →
                </Link>
              </li>
              <li>
                <Link href={`/${r.region}/box-value`} className="text-brand-strong hover:underline">
                  Which box opens best →
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
