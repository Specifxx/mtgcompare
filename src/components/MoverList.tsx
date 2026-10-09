import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { finishLabel } from "@/lib/constants";
import { money } from "@/lib/format";
import { Sparkline } from "./Sparkline";
import { imageFor } from "@/lib/images";
import CardQuickLink from "./CardQuickLink";
import { EbayCardSearchRow } from "./EbayCardSearchRow";

export function MoverList({ title, sub, tone, rows, empty, spark, ebaySource }: { title: string; sub: string; tone: string; rows: { card: CardLite; right: React.ReactNode; price: number | null }[]; country?: Country; empty: string; spark?: Record<number, number[]>; /** Adds a "Search eBay" row naming the top three cards (the /movers page). */ ebaySource?: string }) {
  return (
    <div className="card-surface min-w-0">
      <div className="border-b border-ink-800 px-4 py-3">
        <h2 className={`text-lg ${tone}`}>{title}</h2>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{sub}</p>
      </div>
      {rows.length ? (
        <ol className="divide-y divide-ink-800">
          {rows.map(({ card, right, price }) => (
            <li key={card.id}>
              <CardQuickLink slug={card.slug} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-800/50">
                {imageFor(card, "thumb") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageFor(card, "thumb") ?? ""} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded-sm bg-ink-800 object-cover" />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded-sm bg-ink-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span data-card-name className="block truncate text-[15px] font-semibold text-slate-100">
                    {card.name}
                    {card.variant ? ` (${card.variant})` : ""}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {card.setCode} · {card.number ?? "—"}
                    {card.headFinish === "F" ? ` · ${finishLabel(card, "F")}` : ""}
                  </span>
                </span>
                {spark ? <Sparkline values={spark[card.id]} className="hidden h-7 w-14 min-[400px]:block lg:hidden 2xl:block" /> : null}
                <span className="flex shrink-0 flex-col items-end">
                  <span className="num text-sm font-semibold text-accent">{money(price, "US")}</span>
                  {right}
                </span>
              </CardQuickLink>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-slate-500">{empty}</p>
      )}
      {ebaySource && rows.length >= 2 ? (
        <div className="px-4 pb-3">
          <EbayCardSearchRow names={rows.slice(0, 3).map((r) => r.card.name)} source={ebaySource} page="movers" />
        </div>
      ) : null}
    </div>
  );
}
