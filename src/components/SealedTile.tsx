import SealedQuickLink from "./SealedQuickLink";
import type { Country } from "@/lib/country";
import type { SealedLite } from "@/lib/data";
import { tcgplayerImage } from "@/lib/images";
import { money } from "@/lib/format";
import { headline } from "@/lib/price";
import { SealedWatchButton } from "./SealedWatchButton";

export function SealedTile({ s, country, setCode, soldOut = false }: { s: SealedLite; country: Country; setCode?: string | null; /** Every store we track lists it and says sold out on a fresh read (sealed-offers.ts soldOutEverywhere). */ soldOut?: boolean }) {
  const h = headline(s, country);
  const perPack = s.packCount && s.packCount > 1 && h.cents != null ? Math.round(h.cents / s.packCount) : null;
  return (
    <SealedQuickLink slug={s.slug} className="group card-surface flex flex-col overflow-hidden hover:border-ink-600">
      <div className="relative bg-white/95 p-3">
        <span className="absolute left-2 top-2 z-[1] rounded-sm bg-ink-950/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-100">{s.kind}</span>
        <span className="absolute right-2 top-2 z-[1]">
          <SealedWatchButton sealedId={s.id} slug={s.slug} name={s.name} compact />
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tcgplayerImage(s.id, "400w")} alt={`${s.name} Magic: The Gathering sealed product`} loading="lazy" className="mx-auto aspect-square w-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {soldOut ? <span className="chip w-fit bg-red-500/15 text-[10px] font-bold uppercase tracking-wide text-red-400">Sold out at every store we track</span> : null}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{s.name}</h3>
        <p className="text-xs text-slate-400">
          {setCode ?? "Magic"}
          {s.presale ? " · pre-order" : ""}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {h.kind === "listing" ? (
            <>
              <div>
                <p className="text-[11px] text-slate-500">from</p>
                <p className="num text-lg font-bold text-accent">{money(h.cents, country)}</p>
                {perPack ? <p className="num text-[11px] text-slate-400">{money(perPack, country)} / pack</p> : null}
              </div>
              {h.stores > 0 ? (
                <p className="pb-1 text-[11px] font-semibold text-emerald-400">
                  {h.stores} {h.stores === 1 ? "store" : "stores"}
                </p>
              ) : null}
            </>
          ) : h.kind === "reference" ? (
            <div>
              <p className="text-[11px] text-slate-500">TCGplayer market</p>
              <p className="num text-lg font-semibold text-slate-300">≈ {money(h.cents, country)}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No price yet</p>
          )}
        </div>
      </div>
    </SealedQuickLink>
  );
}
