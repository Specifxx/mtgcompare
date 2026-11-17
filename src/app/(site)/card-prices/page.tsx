import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { Section } from "@/components/Section";
import { CARDS_HUB, readCards, setsWithCards, topCards } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, jsonLd, pageMeta } from "@/lib/seo";
import { SET_BY_CODE } from "@/lib/sets";
import { SITE_NAME } from "@/lib/site";

// The card prices hub (DECISIONS.md, 2026-11-17 "Card prices"): the most valuable cards across every set, then every set's list.
// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES); reads only data/cards/mtg-cards.json.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return pageMeta({
    title: "MTG Card Prices: the Most Valuable Cards by Set",
    description: "Magic: The Gathering card prices for the most valuable cards of every current set: TCGplayer market price, normal and foil, updated daily.",
    path: CARDS_HUB,
  });
}

export default function CardPricesHub() {
  const { rows, generatedAt } = readCards();
  if (!rows.length) notFound();
  const top = topCards(40);
  const sets = setsWithCards()
    .map(({ code, count }) => ({ s: SET_BY_CODE.get(code), count }))
    .filter((x): x is { s: NonNullable<typeof x.s>; count: number } => !!x.s)
    .sort((a, b) => b.s.releaseDate.localeCompare(a.s.releaseDate));
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ href: "/", label: SITE_NAME }, { label: "Card prices" }])) }} />
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "Card prices" }]} />
      <h1 className="page-title">MTG card prices</h1>
      <p className="mt-3 max-w-3xl text-muted">
        The most valuable cards of every set we compare sealed prices for, at TCGplayer&rsquo;s market price (what each card has recently sold
        for on TCGplayer, in US dollars), normal and foil.{generatedAt ? ` Updated ${shortDate(generatedAt.slice(0, 10))}.` : ""} Each card links
        to eBay and TCGplayer, and to its set&rsquo;s sealed boxes, compared store by store.
      </p>
      <Section id="top" title="The most valuable cards right now" className="mt-10">
        <CardTiles cards={top} showSet eager={10} />
      </Section>
      <Section id="sets" title="Card prices by set">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map(({ s, count }) => (
            <li key={s.code}>
              <Link href={`${CARDS_HUB}/${s.slug}`} prefetch={false} className="card flex min-h-12 items-center justify-between gap-3 px-4 py-3 hover:shadow-lift">
                <span className="font-semibold">{s.name}</span>
                <span className="shrink-0 text-xs text-muted">{count} cards</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
