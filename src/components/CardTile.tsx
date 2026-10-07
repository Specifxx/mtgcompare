import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { money } from "@/lib/format";
import { headline } from "@/lib/price";

// The card tile is a client component (QuickView on click, the visitor's market
// from CountryProvider): CardTileClient.tsx. This module stays server-safe so
// detail pages keep importing CardArt and PriceLine from here.
export { CardTile, type CardTileCard } from "./CardTileClient";
export { CardArt, CardImage } from "./CardImage";

export function PriceLine({ card, country }: { card: Pick<CardLite, "low" | "stores" | "marketUsd">; country: Country }) {
  const h = headline(card, country);
  if (h.kind === "listing") {
    return (
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-slate-500">from</p>
          <p className="num text-lg font-bold text-accent">{money(h.cents, country)}</p>
        </div>
        {/* Real stores only: a TCGplayer or eBay low has no store to count. */}
        {h.stores > 0 ? (
          <p className="pb-1 text-[11px] font-semibold text-brand-400">
            {h.stores} {h.stores === 1 ? "store" : "stores"}
          </p>
        ) : null}
      </div>
    );
  }
  if (h.kind === "reference") {
    return (
      <div>
        <p className="text-[11px] text-slate-500">TCGplayer market</p>
        <p className="num text-lg font-semibold text-slate-300">≈ {money(h.cents, country)}</p>
      </div>
    );
  }
  return <p className="pt-3 text-sm text-slate-500">No price yet</p>;
}
