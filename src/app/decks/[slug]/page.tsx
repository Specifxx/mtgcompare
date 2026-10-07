import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { RelatedGuides } from "@/components/RelatedGuides";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { PublishedDeckView } from "@/components/decks/PublishedDeckView";
import { getCatalog, getPublishedDeck } from "@/lib/data";
import { deckViewLines } from "@/lib/deck-library";
import { encodeDeckParam } from "@/lib/deck";
import { deckTotals, massEntry } from "@/lib/published-decks";
import { guidesForTool } from "@/lib/content/tool-guides";
import { money } from "@/lib/format";
import { pageOgOwnImage } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/site";

// A published deck (RiftCompare's /decks/[slug]). ISR, an hour; nothing is
// prerendered at build (an EMPTY generateStaticParams, the card page's device:
// it makes Next cache each on-demand render for `revalidate` without adding
// any build-time database load), and publishing/hiding revalidates it.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

const getDeck = cache(async (slug: string) => getPublishedDeck(slug).catch(() => null));

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const deck = await getDeck(params.slug);
  if (!deck) return { title: "Deck not found", robots: { index: false } };
  const cat = await getCatalog();
  const us = deckTotals(deck.lines.map((l) => ({ qty: l.qty, card: cat.byId.get(l.cardId) }))).US ?? null;
  const cost = us != null ? money(us, "US") : null;
  const title = `${deck.leaderName} deck — ${cost ? `${cost} to build` : deck.title} | OP Compare`;
  const description = `${deck.title}: a ${deck.cardCount}-card ${deck.leaderName} deck${deck.authorName ? ` by ${deck.authorName}` : ""}, priced card by card at the cheapest store in your market${
    cost ? ` — ${cost} in the US today` : ""
  }.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/decks/${deck.slug}` },
    openGraph: pageOgOwnImage(`/decks/${deck.slug}`, { title, description }),
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DeckPage({ params }: { params: { slug: string } }) {
  const deck = await getDeck(params.slug);
  if (!deck) notFound();
  const lines = await deckViewLines(deck);
  const ld = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: deck.title,
    headline: `${deck.leaderName} deck — ${deck.title}`,
    url: `${SITE_URL}/decks/${deck.slug}`,
    datePublished: deck.createdAt,
    ...(deck.authorName ? { author: { "@type": "Person", name: deck.authorName } } : {}),
    hasPart: {
      "@type": "ItemList",
      numberOfItems: lines.length,
      itemListElement: lines.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: `${l.qty} ${l.card.name}`, url: `${SITE_URL}${l.card.href}` })),
    },
  };
  const param = encodeDeckParam(deck.list);
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/decks", name: "Decks" }, { href: `/decks/leader/${deck.leaderSlug}`, name: `${deck.leaderName} decks` }, { name: deck.title }]} />
      <JsonLd data={ld} />
      <PublishedDeckView
        title={deck.title}
        leaderName={deck.leaderName}
        leaderSlug={deck.leaderSlug}
        authorName={deck.authorName}
        description={deck.description}
        colors={deck.colors ? deck.colors.split(",").filter(Boolean) : []}
        publishedAt={deck.createdAt}
        cardCount={deck.cardCount}
        lines={lines}
        publishedTotals={deck.publishedTotals}
        massEntry={massEntry(lines.map((l) => ({ qty: l.qty, name: l.card.name, number: l.card.number })))}
        basketHref={`/tools/best-basket?list=${param}`}
        builderHref={`/deck?list=${param}`}
      />
      {/* Each card's Buy link is its cheapest store through affiliateUrl(), so the disclosure sits right under the list. */}
      <AffiliateDisclosure partner="both" />
      <InlineSignupPrompt
        surface="inline-published-deck"
        className="mt-6"
        title="Buy this deck for less"
        body="Premium's Best Basket finds the cheapest delivered way to buy this list, store by store, postage included. A free account watches its cards for a price drop."
      />
      <RelatedGuides guides={guidesForTool("/decks")} className="card-surface mt-8 p-5" />
    </div>
  );
}
