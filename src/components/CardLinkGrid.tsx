import CardQuickLink from "./CardQuickLink";
import { CardArt, PriceLine } from "./CardTile";
import { PRINTINGS } from "@/lib/constants";
import type { Country } from "@/lib/country";
import type { CardLite, Catalog } from "@/lib/data";

// A grid of card tiles for the SEO landing pages (printing, rarity, type,
// keyword, Leader and store pages). Each tile is a CardQuickLink, so a plain
// click opens the card's QuickView where it is mounted and every tile stays a
// real /card/<slug> link for crawlers.
export function CardLinkGrid({ cards, cat, country, note }: { cards: CardLite[]; cat: Catalog; country: Country; note?: (c: CardLite) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {cards.map((card) => {
        const p = PRINTINGS[card.printing];
        const ribbon = card.printing !== "standard" && card.printing !== "don" ? (card.variant?.split(" · ")[0] ?? p?.label) : null;
        return (
          <CardQuickLink key={card.id} slug={card.slug} className="group card-surface flex flex-col overflow-hidden hover:border-ink-600">
            <div className="relative bg-ink-850 p-3">
              {ribbon ? (
                <span className="absolute left-2 top-2 z-[1] max-w-[75%] truncate rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a1203]" style={{ background: p?.dot ?? "#e9c22a" }}>
                  ★ {ribbon}
                </span>
              ) : null}
              <CardArt id={card.id} hasImage={card.hasImage} alt={`${card.name}${card.variant ? ` (${card.variant})` : ""} ${card.number ?? ""} One Piece card`} />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{card.name}</h3>
              <p className="text-xs text-slate-400">
                {cat.setById.get(card.setId)?.code ?? ""}
                {card.number ? ` · ${card.number}` : ""}
              </p>
              {note ? <div className="text-xs text-slate-400">{note(card)}</div> : null}
              <div className="mt-auto pt-2">
                <PriceLine card={card} country={country} />
              </div>
            </div>
          </CardQuickLink>
        );
      })}
    </div>
  );
}
