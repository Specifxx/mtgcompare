import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { CardSearchForm } from "@/components/CardSearchForm";
import { Section } from "@/components/Section";
import { CARDS_HUB, readSets, readTop } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, jsonLd, pageMeta } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

// The card prices hub (DECISIONS.md "Card prices: every card"): a card search, the most valuable cards, then every set by year.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES); reads only data/cards/.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return pageMeta({
    title: "MTG Card Prices: Every Magic Card by Set",
    description: "Magic: The Gathering card prices for every card in every set: TCGplayer market price, normal and foil, updated daily. Search by name, set or card number.",
    path: CARDS_HUB,
  });
}

export default function CardPricesHub() {
  const { sets, generatedAt } = readSets();
  const top = readTop().hub;
  if (!sets.length) notFound();
  const names = new Map(sets.map((s) => [s.slug, s.name]));
  const byYear = new Map<string, typeof sets>();
  for (const s of sets) {
    const y = s.released?.slice(0, 4) ?? "Other";
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(s);
  }
  const total = sets.reduce((n, s) => n + s.cards, 0);
  const crumbs = [{ href: "/", label: SITE_NAME }, { label: "Card prices" }];
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <Breadcrumbs items={crumbs} />
      <h1 className="page-title">MTG card prices</h1>
      <p className="mt-3 max-w-3xl text-muted">
        {total.toLocaleString("en-US")} Magic cards in {sets.length} sets at TCGplayer&rsquo;s market price: what each card has recently sold for on
        TCGplayer, in US dollars, normal and foil.{generatedAt ? ` Updated ${shortDate(generatedAt.slice(0, 10))}.` : ""}
      </p>
      <CardSearchForm className="mt-5 max-w-xl" />
      {top.length > 0 && (
        <Section id="top" title="The most valuable cards right now" className="mt-10">
          <CardTiles cards={top.map((c) => ({ ...c, setName: names.get(c.set) }))} eager={10} />
        </Section>
      )}
      <Section id="sets" title="Card prices by set">
        <div className="grid gap-8">
          {[...byYear].map(([year, list]) => (
            <div key={year}>
              <h3 className="mb-3 font-display text-lg font-bold">{year}</h3>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <li key={s.slug}>
                    <Link href={`${CARDS_HUB}/${s.slug}`} prefetch={false} className="flex min-h-10 items-center justify-between gap-3 border-b border-line py-1.5 hover:text-brand">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0 text-xs text-muted">{s.cards} cards</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
