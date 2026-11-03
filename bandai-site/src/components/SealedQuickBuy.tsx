"use client";
// A set's booster boxes and sealed with a buy button each, at the top of its
// set page. Reddit posts and searches land on set pages, which listed sealed
// only as tiles: YGO Compare's set page took most of its visitors in October
// and turned 4% of them into a store click. DexCompare (~44%) puts the best
// price and its button on the first screen; this does the same per product,
// in the visitor's market, through /go like every buy button (from=set_quickbuy).
import Link from "@/components/Link";
import { goHref } from "@/lib/affiliate";
import { money } from "@/lib/format";
import { MARKET_LABEL, type Offer } from "@/lib/site-types";
import { useMarket } from "./ClientPrefs";
import { sourceName } from "./PriceTable";

export interface QuickBuyItem {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  /** summaryOf(id).best: the cheapest in-stock offer per market, plus TCGplayer. */
  best: Offer[];
  stores: number;
}

export function SealedQuickBuy({ items, title }: { items: QuickBuyItem[]; title: string }) {
  const { market } = useMarket();
  if (!items.length) return null;
  return (
    <section className="card-surface overflow-hidden" data-quickbuy>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-800 bg-ink-850 px-4 py-2.5">
        <h2 className="text-base font-bold">{title}</h2>
        <span className="text-xs text-muted">Cheapest in stock in {MARKET_LABEL[market]} · change market at the top</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {items.map((p) => {
          const local = p.best.find((o) => o.market === market && o.inStock && o.source !== "tcgplayer");
          const tcg = p.best.find((o) => o.source === "tcgplayer" && o.inStock);
          const o = local ?? tcg ?? null;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              {p.image ? <img src={p.image} alt={p.name} className="h-12 w-12 shrink-0 object-contain" loading="lazy" /> : <span className="h-12 w-12 shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link href={`/card/${p.slug}`} className="line-clamp-1 text-sm font-semibold hover:underline">{p.name}</Link>
                <p className="text-xs text-muted">
                  {o ? <><b className="text-base text-fg tabular-nums">{money(o.cents, o.currency)}</b> at {sourceName(o)}</> : "No live price in your market yet"}
                  {" · "}
                  <Link href={`/card/${p.slug}`} className="link">compare {p.stores} store{p.stores === 1 ? "" : "s"}</Link>
                </p>
              </div>
              {o ? (
                <a href={goHref(o, p.id, "set_quickbuy")} rel="sponsored nofollow noopener" target="_blank" className="btn-buy min-h-10 shrink-0 whitespace-nowrap">
                  Buy now <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <Link href={`/card/${p.slug}`} className="btn-ghost min-h-10 shrink-0 px-3 py-1.5">Compare</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
