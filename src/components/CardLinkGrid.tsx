import CardQuickLink from "./CardQuickLink";
import { CardArt, PriceLine } from "./CardTile";
import { TREATMENT_BY_KEY, TREATMENT_KIND_DOT } from "@/lib/constants";
import type { Country } from "@/lib/country";
import type { CardLite, CardMini } from "@/lib/data";
import { money } from "@/lib/format";
import { hasImageFor } from "@/lib/images";

// A grid of card tiles for the SEO landing pages (treatment, rarity, type, colour,
// keyword and oracle hubs). Each tile is a CardQuickLink, so a plain click opens the
// card's QuickView where it is mounted and every tile stays a real /card/<slug> link
// for crawlers. It takes the engine's rows as they come: a CardLite (with the visitor's
// market low and store count) or a CardMini (the oracle hub's rows, which carry only the
// TCGplayer figure).
type Tile = CardMini & Partial<Pick<CardLite, "low" | "stores" | "setId">>;

function Ribbon({ card }: { card: Tile }) {
  const key = card.treat[0];
  const def = key ? TREATMENT_BY_KEY[key] : undefined;
  const text = card.label ?? def?.label;
  if (!text) return null;
  return (
    <span className="absolute left-2 top-2 z-[1] max-w-[75%] truncate rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a1203]" style={{ background: def ? (def.dot ?? TREATMENT_KIND_DOT[def.kind]) : "#d4af37" }}>
      {text}
    </span>
  );
}

function MiniPrice({ card }: { card: Tile }) {
  if (card.valueUsd == null) return <p className="text-xs text-slate-500">No TCGplayer price</p>;
  return (
    <div>
      <p className="text-[11px] text-slate-500">{card.lowOnly ? "TCGplayer low only" : "TCGplayer market"}</p>
      <p className="num text-lg font-bold text-accent">{money(card.valueUsd, "US")}</p>
    </div>
  );
}

export function CardLinkGrid({ cards, country, note }: { cards: Tile[]; country: Country; note?: (c: Tile) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {cards.map((card) => (
        <CardQuickLink key={card.id} slug={card.slug} className="group card-surface flex flex-col overflow-hidden hover:border-ink-600">
          <div className="relative bg-ink-850 p-3">
            <Ribbon card={card} />
            <CardArt id={card.id} hasImage={hasImageFor(card)} alt={`${card.name}${card.label ? ` (${card.label})` : ""} ${card.setCode} ${card.number ?? ""} Magic card`.replace(/\s+/g, " ")} />
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{card.name}</h3>
            <p className="text-xs text-slate-400">
              {card.setCode}
              {card.number ? ` · ${card.number}` : ""}
            </p>
            {note ? <div className="text-xs text-slate-400">{note(card)}</div> : null}
            <div className="mt-auto pt-2">
              {card.low && card.stores ? <PriceLine card={{ low: card.low, stores: card.stores, marketUsd: card.marketUsd }} country={country} /> : <MiniPrice card={card} />}
            </div>
          </div>
        </CardQuickLink>
      ))}
    </div>
  );
}
