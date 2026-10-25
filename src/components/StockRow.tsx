import type { ReactNode } from "react";
import Link from "@/components/Link";
import type { ProductCardData } from "@/lib/data";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import { isPreorderSet } from "@/lib/release";
import type { RegionInfo } from "@/lib/regions";
import { SET_BY_CODE } from "@/lib/sets";
import { stockHeadline } from "@/lib/stock";
import { StockPill } from "./StockPill";

/**
 * One product as a row of a stock list (/back-in-stock, /price-moves, /out-of-print, the region home's older-sets section): its photo,
 * name and set, then where it is in stock (independent stores, of those that list it; "+ TCGplayer" apart), then today's price.
 * `extra` is the list's own fact (when it came back, how far the price moved), printed after the stock line.
 */
export function StockRow({ p, r, extra }: { p: ProductCardData; r: RegionInfo; extra?: ReactNode }) {
  const img = thumb(p.imageUrl, 200);
  const set = p.setCode ? SET_BY_CODE.get(p.setCode) : null;
  const pre = isPreorderSet(p.setCode);
  const s = stockHeadline(p, pre);
  return (
    <Link
      href={`/${r.region}/p/${p.slug}`}
      prefetch={false}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 pr-3 shadow-card transition-shadow hover:shadow-lift"
    >
      <span className="plate flex h-16 w-16 shrink-0 items-center justify-center">
        {img ? <img src={img} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-contain p-1 mix-blend-multiply" /> : <span className="text-[10px] font-semibold text-faint">{p.productType}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand">{p.name}</span>
        <span className="block truncate text-xs text-faint">
          {p.productType}
          {set ? ` · ${set.name}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StockPill state={s.open ? "open" : "soldout"} preorder={pre} size="sm">
            {s.text}
          </StockPill>
          {s.tcg && <span className="text-[11px] font-medium text-muted">+ TCGplayer</span>}
          {extra}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {s.open && <span className="block text-[11px] font-medium text-muted">From</span>}
        <span className="tabular font-display text-base font-bold sm:text-lg">{s.open ? money(p.lowestPriceCents, r.market) : "—"}</span>
      </span>
    </Link>
  );
}
