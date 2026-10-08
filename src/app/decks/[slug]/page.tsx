import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { RelatedGuides } from "@/components/RelatedGuides";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { PublishedDeckView, type DeckViewLine } from "@/components/decks/PublishedDeckView";
import { FORMAT_LABEL, colorsOfMask, type Format } from "@/lib/constants";
import { getPublishedDeck } from "@/lib/data";
import { deckViewLines } from "@/lib/deck-library";
import { encodeDeckParam } from "@/lib/deck";
import { commanderDeckPath, deckTotals, massEntry } from "@/lib/published-decks";
import { guidesForTool } from "@/lib/content/tool-guides";
import { money } from "@/lib/format";
import { pageOgOwnImage } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/site";

// A published deck. Rendered per request (the deck is a Neon row, read through the library's one cached entry; the CDN caches the page and publishing or
// hiding purges the tag and the path); nothing is prerendered at build. Priced NOW from the loaders, so an import moves the total.
export const dynamic = "force-dynamic";

const getDeck = cache(async (slug: string) => getPublishedDeck(slug).catch(() => null));
const getLines = cache(async (slug: string) => {
  const deck = await getDeck(slug);
  return deck ? deckViewLines(deck).catch((): DeckViewLine[] => []) : [];
});

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const deck = await getDeck(params.slug);
  if (!deck) return { title: "Deck not found", robots: { index: false } };
  const lines = await getLines(params.slug);
  const us = lines.length ? (deckTotals(lines.map((l) => ({ qty: l.qty, card: l.card }))).US ?? null) : null;
  const cost = us != null ? money(us, "US") : null;
  const title = `${deck.commanderName} deck — ${cost ? `${cost} to build` : deck.title} | MTG Compare`;
  const description = `${deck.title}: a ${deck.cardCount}-card ${deck.commanderName} ${deck.format} deck${deck.authorName ? ` by ${deck.authorName}` : ""}, priced card by card at the cheapest store in your market${
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
  const lines = await getLines(params.slug);
  const ld = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: deck.title,
    headline: `${deck.commanderName} deck — ${deck.title}`,
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
      <Breadcrumbs trail={[{ href: "/decks", name: "Decks" }, { href: commanderDeckPath(deck.commanderSlug), name: `${deck.commanderName} decks` }, { name: deck.title }]} />
      <JsonLd data={ld} />
      <PublishedDeckView
        title={deck.title}
        commanderName={deck.commanderName}
        commanderSlug={deck.commanderSlug}
        partnerName={deck.partnerName}
        format={FORMAT_LABEL[deck.format as Format] ?? deck.format}
        authorName={deck.authorName}
        description={deck.description}
        colors={colorsOfMask(deck.identity)}
        publishedAt={deck.createdAt}
        cardCount={deck.cardCount}
        lines={lines}
        publishedTotals={deck.publishedTotals}
        massEntry={massEntry(lines.map((l) => ({ qty: l.qty, name: l.card.name, setCode: l.card.setCode })))}
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
