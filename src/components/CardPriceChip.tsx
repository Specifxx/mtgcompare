import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { money } from "@/lib/format";
import { headline } from "@/lib/price";
import CardQuickLink from "./CardQuickLink";

// A card name with its live price in the visitor's market, inline in a post
// (RiftCompare's CardPriceChip): a plain click opens the card's QuickView, the
// href is the card page. A reference price is marked "≈"; an unpriced card shows
// the name alone rather than a dash.
export function CardPriceChip({ card, country }: { card: CardLite; country: Country }) {
  const h = headline(card, country);
  return (
    <CardQuickLink slug={card.slug} className="whitespace-nowrap">
      {card.name}
      {card.variant ? ` (${card.variant})` : ""}
      {h.kind !== "none" ? (
        <span className="num ml-1 rounded bg-ink-800 px-1.5 py-0.5 text-[12px] font-semibold text-accent no-underline">
          {h.kind === "reference" ? "≈ " : ""}
          {money(h.cents, country)}
        </span>
      ) : null}
    </CardQuickLink>
  );
}
