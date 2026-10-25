"use client";

import { useMemo, type ReactNode } from "react";
import { moreClosedLabel, moreOpenLabel, splitRows } from "@/lib/ebay-offer-row";
import { useShipMode, setShipMode } from "@/lib/ship-mode";
import { rankRows, type ShipMode } from "@/lib/shipping-rank";
import type { Placement } from "@/lib/affiliate";
import { offerStockLabel, type OfferStock } from "@/lib/sealed-offers";
import { SHIP_UNKNOWN, type ShipCell } from "@/lib/shipping-quote";
import { Ago } from "./Ago";
import { OutboundLink } from "./OutboundLink";
import { StockPill } from "./StockPill";

// The price table's rows (OfferTable.tsx decides them on the server, as data): a client module because the visitor's "Price + shipping"
// choice re-ranks them in the browser. Nothing here may import the stores' data or the shipping snapshot (they would join the bundle).

const ROW_GRID = "grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-3 sm:grid-cols-[1fr_auto_10rem_auto] sm:gap-x-4 sm:px-5 sm:py-3.5";
const ROW_BUTTON = "min-h-11 justify-self-end whitespace-nowrap [grid-area:2/2/4] sm:min-h-10 sm:[grid-area:1/4/3]";


/**
 * The rows as the visitor's "Price" / "Price + shipping" choice ranks them (lib/shipping-rank.ts), with the "Best price" badge, the red
 * button and the pre-order page's numbers following the new order. "price" is the server's order unchanged.
 */
export function useRankedRows(rows: StoreRowData[]): { mode: ShipMode; rows: StoreRowData[] } {
  const mode = useShipMode();
  const ranked = useMemo(() => {
    if (mode === "price") return rows;
    const badge = rows.find((r) => r.badge)?.badge;
    const numbered = rows.some((r) => r.rank != null);
    const order = rankRows(rows, mode);
    const best = order.find((r) => r.open);
    let n = 0;
    return order.map((r) => {
      const next: StoreRowData = { ...r, best: r === best };
      delete next.badge;
      delete next.rank;
      if (badge && r === best) next.badge = badge;
      if (numbered && r.open) next.rank = ++n;
      return next;
    });
  }, [rows, mode]);
  return { mode, rows: ranked };
}

/** The table without an eBay row (the eBay row's own list, EbayStrip.tsx OfferRowsWithEbay, is the same markup): eight rows, then the two groups. */
export function StoreRows({ rows: given, preorder }: { rows: StoreRowData[]; preorder: boolean }) {
  const { rows } = useRankedRows(given);
  const { shown, moreOpen, moreClosed } = splitRows(rows);
  const list = (part: StoreRowData[]) => part.map((d) => <StoreRow key={d.key} d={d} preorder={preorder} />);
  return (
    <div className="group/offers divide-y divide-line">
      <ul className="divide-y divide-line">{list(shown)}</ul>
      {moreOpen.length > 0 && <MoreRows label={moreOpenLabel(moreOpen, preorder)}>{list(moreOpen)}</MoreRows>}
      {moreClosed.length > 0 && <MoreRows label={moreClosedLabel(moreClosed.length, shown.some((r) => !r.open))}>{list(moreClosed)}</MoreRows>}
    </div>
  );
}

function MoreRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group/more px-4 py-1 sm:px-5">
      <summary className="btn-ghost min-h-11 w-full cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden">
        <span className="group-open/more:hidden">{label}</span>
        <span className="hidden group-open/more:inline">Show fewer</span>
        <Chevron className="group-open/more:rotate-180" />
      </summary>
      <ul className="-mx-4 -mb-1 mt-1 divide-y divide-line border-t border-line sm:-mx-5">{children}</ul>
    </details>
  );
}

/** "Price" | "Price + shipping": a two-button switch, the same size in either state (no layout shift). */
export function ShippingToggle() {
  const mode = useShipMode();
  const btn = (m: ShipMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => setShipMode(m)}
      className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors ${mode === m ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Rank by" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
      {btn("price", "Price")}
      {btn("total", "Price + shipping")}
    </div>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform motion-reduce:transition-none ${className}`}>
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

/** A store row of the price table, as its data says (OfferTable builds it on the server). */
export interface StoreRowData {
  key: string;
  /** The row's price, in the region's currency, cents: the eBay row is ranked against it (lib/ebay-offer-row.ts ebayRowIndex). */
  cents: number;
  /** Buyable now (in stock or pre-order, checked recently). */
  open: boolean;
  state: OfferStock;
  /** The cheapest open row: the table's one red button and the "Best price" badge. */
  best: boolean;
  name: string;
  host: string;
  /** The store's own title for the listing (the host line's tooltip). */
  title: string;
  marketplace: boolean;
  href: string;
  rel: string;
  sponsored: boolean;
  retailer: string;
  /** The table's placement (product-table unless the page says otherwise). */
  placement?: Placement;
  /** Its place among the open rows, 1 = cheapest, when the table is numbered (the pre-order page). */
  rank?: number;
  /** The best row's badge in place of "Best price": `short` on a phone, `full` from sm (the pre-order page: "Cheapest" / "Cheapest store"). */
  badge?: { short: string; full: string };
  price: string;
  perPack: string | null;
  lastSeen: string;
  /** "3 hours ago" as the server rendered it (Ago corrects it in the browser). */
  ago: string;
  /** The store's measured shipping for one item at this price (lib/shipping.ts); null: "Shipping at checkout". */
  ship: ShipCell | null;
}

/**
 * One store row: a grid whose cells are placed by grid-area (short enough to repeat on 30 rows). On a phone, two columns: the store
 * and its stock pill [1/2]; the price [2/1]; the host line; the button [2/2/4], 44 px, beside the last two (88 px a row). From sm one
 * line: the store over the host line, then the pill, the price, the button. The store and host cells take the free cells in order (grid
 * auto-placement) and clip, so `1fr` columns cannot overflow. Rendered on the server (no eBay row) and in the browser (OfferRowsWithEbay).
 */
export function StoreRow({ d, preorder }: { d: StoreRowData; preorder: boolean }) {
  return (
    <li data-offer-row="" className={`${ROW_GRID} ${d.best ? "bg-open-soft/40" : ""}`}>
      <div className="flex h-5 items-center gap-2 overflow-hidden sm:h-6">
        {d.rank != null && (
          <span className="tabular -mr-0.5 shrink-0 text-sm font-bold text-muted" aria-label={`Number ${d.rank} by price`}>
            {d.rank}.
          </span>
        )}
        <span className="truncate text-[15px] font-semibold sm:text-base">{d.name}</span>
        {d.marketplace && (
          <span className="shrink-0 rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] font-bold uppercase leading-3 tracking-wide text-muted">Marketplace</span>
        )}
        {d.best &&
          (d.badge ? (
            <span className="shrink-0 rounded-full bg-open px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-surface">
              <span className="sm:hidden">{d.badge.short}</span>
              <span className="hidden sm:inline">{d.badge.full}</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-open px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-surface">
              Best <span className="hidden group-data-[ebay=cheaper]/offers:inline">store </span>
              price
            </span>
          ))}
      </div>
      <div className="truncate text-[11px] leading-4 text-faint sm:text-xs" title={d.title}>
        {d.host} · checked <Ago iso={d.lastSeen} initial={d.ago} />
        {d.sponsored && <span className="text-muted"> · affiliate link</span>}
      </div>
      <div className="flex h-5 items-center justify-self-end [grid-area:1/2] sm:[grid-area:1/2/3]">
        <StockPill state={d.state} preorder={preorder}>
          {offerStockLabel(d.state, preorder)}
        </StockPill>
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2 [grid-area:2/1] sm:mt-0 sm:block sm:text-right sm:[grid-area:1/3/3]">
        <span className={`tabular font-display text-lg font-bold leading-6 ${d.open ? "" : "text-faint line-through decoration-1"}`}>{d.price}</span>
        {d.perPack && <span className="tabular truncate text-[11px] leading-4 text-muted sm:block sm:text-xs">≈ {d.perPack} / pack</span>}
        <ShipLine ship={d.ship} />
      </div>
      <OutboundLink href={d.href} rel={d.rel} retailer={d.retailer} placement={d.placement ?? "product-table"} className={`${d.best ? "btn-primary" : d.open ? "btn-soft" : "btn-ghost"} ${ROW_BUTTON}`}>
        {d.open ? "View deal" : "View"} <span aria-hidden="true">↗</span>
      </OutboundLink>
    </li>
  );
}

/** The row's shipping: always one line (known or not), so a row is the same height in either ranking. */
function ShipLine({ ship }: { ship: ShipCell | null }) {
  if (!ship) return <span className="truncate text-[11px] leading-4 text-faint sm:block sm:text-xs">{SHIP_UNKNOWN}</span>;
  return (
    <span title={ship.title} className={`tabular truncate text-[11px] leading-4 sm:block sm:text-xs ${ship.max === 0 ? "font-semibold text-open" : "text-muted"}`}>
      {ship.text}
      {ship.hint && <span className="hidden sm:inline">{ship.hint}</span>}
      <span className="sr-only">. {ship.title}</span>
    </span>
  );
}
