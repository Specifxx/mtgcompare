"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { money } from "@/lib/format";
import { headline } from "@/lib/price";
import { CardImage } from "./CardImage";
import { PrintingBadge, rarityColor } from "./Badge";
import { useCountry } from "./CountryProvider";
import { useQuickView } from "./QuickViewProvider";
import { PriceWatchButton } from "./PriceWatchButton";

export type CardTileCard = Pick<
  CardLite,
  "id" | "slug" | "name" | "number" | "rarity" | "variant" | "printing" | "hasImage" | "marketUsd" | "low" | "stores"
>;

// RiftCompare's CardTile, markup and classes verbatim: a cv-auto card-surface
// that lifts on hover, the art in an aspect-[5/7] box tinted with the rarity
// colour at 8% (`${hex}14`), the printing chips stacked top-left, the watch
// heart top-right, then name, "SET · number", "from" + price and "N stores".
//
// A plain left click opens the card's QuickView; a modifier click, a middle
// click or a drag that started on the tile falls through to the link (the card
// page), so "open in new tab" and scrolling a carousel never pop the dialog.
//
// The price is for `country` when the page passes it (a server page that read
// getCountry()), else the visitor's market from CountryProvider — the static
// homepage renders for the default market and localises after mount.
export function CardTile({ card, setCode, country: fixed, priority = false }: { card: CardTileCard; setCode: string; country?: Country; priority?: boolean }) {
  const qv = useQuickView();
  const { country: ctx } = useCountry();
  const country = fixed ?? ctx;
  const h = headline(card, country);
  const tint = rarityColor(card.rarity);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const label = `${card.name}${card.variant ? ` (${card.variant})` : ""}`;

  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!qv || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const down = downRef.current;
    if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8 || Date.now() - down.t > 600)) return;
    e.preventDefault();
    const img = e.currentTarget.querySelector("img");
    qv.open(card.slug, { thumb: img?.currentSrc || img?.src || null, label });
  }
  const warm = qv ? () => qv.prefetch(card.slug) : undefined;

  return (
    <div className="cv-auto group card-surface relative flex h-full flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-base ease-out motion-safe:hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-glow focus-within:border-brand-500/60 active:translate-y-0">
      <div className="absolute right-2 top-2 z-30">
        <PriceWatchButton cardId={card.id} slug={card.slug} name={card.name} />
      </div>
      <Link
        href={`/card/${card.slug}`}
        prefetch={false}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onPointerEnter={warm}
        onFocus={warm}
        className="flex flex-1 flex-col"
      >
        <div className="relative aspect-[5/7] w-full overflow-hidden p-1.5 sm:p-3" style={{ backgroundColor: `${tint}14` }}>
          <CardImage
            id={card.id}
            hasImage={card.hasImage}
            priority={priority}
            alt={`${label} ${card.number ?? ""} One Piece card`.trim()}
            className="h-full w-full transition-transform duration-slow ease-out motion-safe:group-hover:scale-[1.03]"
          />
          <div className="absolute left-2 right-12 top-2 z-20 flex flex-col items-start gap-1 [&>*]:max-w-full [&>*]:truncate">
            <PrintingBadge printing={card.printing} variant={card.variant} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 border-t border-ink-700 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white" title={card.name}>
            {card.name}
          </h3>
          <p className="text-xs text-slate-500">
            {setCode}
            {card.number ? ` · ${card.number}` : ""}
          </p>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5 pt-1">
            <div className="min-w-[min(6.5rem,100%)] flex-1">
              {h.kind === "listing" ? (
                <>
                  <div className="text-[11px] text-slate-500">from</div>
                  <div className="truncate text-base font-bold leading-tight text-accent sm:text-lg">{money(h.cents, country)}</div>
                </>
              ) : h.kind === "reference" ? (
                <>
                  <div className="text-[11px] text-slate-500">TCGplayer market</div>
                  <div className="truncate text-base font-semibold leading-tight text-slate-300 sm:text-lg">≈ {money(h.cents, country)}</div>
                </>
              ) : (
                <div className="text-sm font-medium text-slate-500">No price yet</div>
              )}
            </div>
            {/* Real stores only: a TCGplayer or eBay low has no store to count. */}
            {h.kind === "listing" && h.stores > 0 ? (
              <div className="shrink-0 whitespace-nowrap pb-0.5 text-right text-[11px] font-semibold text-brand-400">
                {h.stores} {h.stores === 1 ? "store" : "stores"}
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    </div>
  );
}
