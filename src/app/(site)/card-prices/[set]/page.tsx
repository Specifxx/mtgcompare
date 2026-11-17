import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardTiles } from "@/components/CardTiles";
import { CARDS_HUB, cardIndexable, cardPath, cardsOfSet, cardValue, readCards, usd } from "@/lib/cards";
import { shortDate } from "@/lib/hub-copy";
import { breadcrumbJsonLd, itemListJsonLd, jsonLd, pageMeta, withMtg } from "@/lib/seo";
import { SET_BY_SLUG } from "@/lib/sets";
import { SITE_NAME } from "@/lib/site";

// One set's most valuable cards (DECISIONS.md, 2026-11-17 "Card prices"). CDN-cached a day like every page; no request data read.
export const dynamic = "force-dynamic";

function load(slug: string) {
  const s = SET_BY_SLUG.get(slug);
  if (!s) return null;
  const cards = cardsOfSet(s.code);
  return cards.length ? { s, cards } : null;
}

export function generateMetadata({ params }: { params: { set: string } }): Metadata {
  const x = load(params.set);
  if (!x) return {};
  const top = x.cards.find((c) => cardIndexable(c));
  const full = `${withMtg(x.s.name)} Card Prices`;
  return pageMeta({
    title: full.length <= 46 ? full : `${x.s.name} Card Prices`,
    description: `${withMtg(x.s.name)} card prices: the ${x.cards.length} most valuable cards at TCGplayer's market price, normal and foil${top ? `, led by ${top.name} at ${usd(cardValue(top)!)}` : ""}.`.slice(0, 160),
    path: `${CARDS_HUB}/${x.s.slug}`,
    noindex: !x.cards.some(cardIndexable),
  });
}

export default function SetCardPrices({ params }: { params: { set: string } }) {
  const x = load(params.set);
  if (!x) notFound();
  const { s, cards } = x;
  const { generatedAt } = readCards();
  const path = `${CARDS_HUB}/${s.slug}`;
  const crumbs = [{ href: "/", label: SITE_NAME }, { href: CARDS_HUB, label: "Card prices" }, { label: s.name }];
  return (
    <div className="page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd({ name: `${s.name} card prices`, path, items: cards.map((c) => ({ path: cardPath(s.slug, c), name: c.name })) })) }} />
      <Breadcrumbs items={crumbs} />
      <div className="eyebrow">{s.series} series</div>
      <h1 className="page-title mt-1">{withMtg(s.name)} card prices</h1>
      <p className="mt-3 max-w-3xl text-muted">
        The {cards.length} most valuable {s.name} cards at TCGplayer&rsquo;s market price (recent sales on TCGplayer, US dollars), highest
        first.{generatedAt ? ` Updated ${shortDate(generatedAt.slice(0, 10))}.` : ""} Opening packs instead?{" "}
        <Link href={`/us/sets/${s.slug}`} prefetch={false} className="font-semibold text-brand hover:underline">
          Compare {s.name} booster boxes and bundles
        </Link>{" "}
        across stores.
      </p>
      <div className="mt-8">
        <CardTiles cards={cards} eager={10} />
      </div>
    </div>
  );
}
