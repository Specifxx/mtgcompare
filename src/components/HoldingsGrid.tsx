import { money } from "@/lib/format";
import { PRINTINGS } from "@/lib/constants";
import type { Country } from "@/lib/country";
import type { Holding } from "@/lib/collection-server";
import CardQuickLink from "./CardQuickLink";

// Visual showcase of a collection: the actual card art, big, in a responsive grid,
// with quantity, live value and profit/loss read straight off each card. Dearest
// first (holdings already arrive sorted), so a collection leads with its best cards.
// RiftCompare's HoldingsGrid; OP Compare (wave 2) shows the card number and a
// printing dot for a non-standard printing (Parallel, Manga, SP…).
export function HoldingsGrid({ holdings, country }: { holdings: Holding[]; country: Country }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {holdings.map((h, i) => {
        const pl = h.plCents;
        const p = h.printing !== "standard" ? PRINTINGS[h.printing] : undefined;
        return (
          <CardQuickLink
            key={`${h.cardId}-${h.condition}-${h.isFoil}-${i}`}
            slug={h.slug}
            className="group relative block overflow-hidden rounded-lg border border-ink-700 bg-ink-900 transition-colors hover:border-ink-600"
          >
            <div className="relative aspect-[5/7]">
              {h.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.img} alt={`${h.name} ${h.number ?? ""} One Piece card`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-ink-850 text-xs text-slate-600">No image</div>
              )}

              {/* quantity + foil badges */}
              {h.quantity > 1 && (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-extrabold text-white shadow">
                  ×{h.quantity}
                </span>
              )}
              {/* No foil mark: a holding's isFoil is the card's own TCGplayer finish
                  (there is no foil toggle on OP Compare), and TCGplayer lists most
                  standard One Piece cards as Foil, so the mark said nothing. */}

              {/* gradient footer with name + value + P&L */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/85 to-transparent px-2 pb-2 pt-7">
                <div className="truncate text-[11px] font-semibold text-white" title={h.name} data-card-name>{h.name}</div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="num text-sm font-extrabold text-accent">
                    {h.valueCents > 0 ? money(h.valueCents, country) : "—"}
                  </span>
                  {pl != null && (
                    <span className={`num rounded px-1 text-[10px] font-bold ${pl >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
                      {pl >= 0 ? "+" : "−"}{money(Math.abs(pl), country)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-500">
                  <span className="num flex items-center gap-1">
                    {p && <span aria-label={p.label} title={p.label} className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />}
                    {h.setCode}{h.number ? ` · ${h.number}` : ""}
                  </span>
                  <span>{h.condition}</span>
                </div>
              </div>
            </div>
          </CardQuickLink>
        );
      })}
    </div>
  );
}
