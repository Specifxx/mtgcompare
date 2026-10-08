// The card page's cross-links, as pure selections over the catalogue
// ("cheaper alternatives", "more printings of this card" and "do more with this
// price"). Nothing here reads a database: the page hands in the cards its
// loaders returned.
import type { CardLite } from "./data";

/**
 * Same set, same colour, same card type, STRICTLY cheaper on TCGplayer than the
 * card being viewed, dearest first. Empty when the card is unpriced: with no
 * price there is nothing it can be cheaper than.
 */
export function cheaperAlternatives(card: CardLite, cards: CardLite[], limit = 6): CardLite[] {
  if (card.marketUsd == null || card.cardType == null) return [];
  const colour = card.colors[0];
  return cards
    .filter(
      (x) =>
        x.id !== card.id &&
        x.setId === card.setId &&
        x.cardType === card.cardType &&
        x.number !== card.number &&
        x.marketUsd != null &&
        x.marketUsd > 0 &&
        x.marketUsd < card.marketUsd! &&
        (colour ? x.colors.includes(colour) : x.colors.length === 0),
    )
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id)
    .slice(0, limit);
}

/** Printings of the same card (same name) in OTHER sets, dearest first, one tile per set. */
export function sameCharacter(card: CardLite, cards: CardLite[], limit = 6): CardLite[] {
  const seen = new Set<number>();
  return cards
    .filter((x) => x.name === card.name && x.id !== card.id && x.setId !== card.setId)
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0) || a.id - b.id)
    .filter((x) => {
      if (seen.has(x.setId)) return false;
      seen.add(x.setId);
      return true;
    })
    .slice(0, limit);
}

/** How many OTHER sets print this name (the narrative's "N other cards"). */
export function sameNameCount(card: CardLite, cards: CardLite[]): number {
  const sets = new Set<number>();
  for (const x of cards) if (x.name === card.name && x.id !== card.id && x.setId !== card.setId) sets.add(x.setId);
  return sets.size;
}

export interface ToolChip {
  href: string;
  label: string;
  sub: string;
}

/** The "Do more with this price" chips: only routes that exist. */
export function priceToolChips(card: { cardType: string | null; name: string; setSlug: string; hasSealed: boolean; priced: boolean }): ToolChip[] {
  const out: ToolChip[] = [];
  out.push({ href: "/deck", label: "Price a deck", sub: "Paste a list and see what it costs in your market" });
  if (card.priced) out.push({ href: "/tools/best-basket", label: "Best Basket", sub: "Find the cheapest stores for an order with postage" });
  if (card.hasSealed) out.push({ href: `/sealed?set=${card.setSlug}`, label: "Sealed for this set", sub: "Boxes and packs, priced across stores" });
  out.push({ href: "/tools/box-ev", label: "Box EV", sub: "Is a booster box worth more opened?" });
  return out;
}
