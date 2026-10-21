import Link from "next/link";
import type { ReactNode } from "react";
import type { OfferView } from "@/lib/data";
import { offerLink, offerRetailer, type Placement } from "@/lib/affiliate";
import { ebayRowNote, moreClosedLabel, moreOpenLabel, splitRows, tableFooter, type PriceFloor } from "@/lib/ebay-offer-row";
import { money, timeAgo } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import { offerStock, offerStockLabel, type OfferStock } from "@/lib/sealed-offers";
import { Ago } from "./Ago";
import { OfferRowsWithEbay } from "./EbayStrip";
import { OutboundLink } from "./OutboundLink";
import { StockPill } from "./StockPill";

// The region's offers, ranked (in the US that includes TCGplayer's, badged as a marketplace), and, with `ebay`, ONE eBay row among
// them: the product's lowest-priced own eBay listing, ranked by its price among the stores you can buy from now, tinted, labelled "Ad",
// with eBay's blue button (EbayStrip.tsx OfferRowsWithEbay, lib/ebay-offer-row.ts). The owner's call: DexCompare compares websites, and
// eBay is one. When the eBay listing is cheaper than every store you can buy from it is the best price ("Best price" on it, "Best store
// price" on the cheapest store, and the product page's best-price card shows it: BestPriceCard.tsx); nothing counts it (the title's store
// count, the median).
// The store rows are decided here, on the server (StoreRowData); the browser's list renders them and places the eBay row among them.
//
// The growth release: the first eight rows of the ranked list show (lib/ebay-offer-row.ts VISIBLE_ROWS), the rest sit in two server-rendered
// <details> (more open rows; then the sold-out and not-checked ones), so every link stays in the HTML. One red button only, on the cheapest
// open row; the other open rows get the quieter .btn-soft, sold-out rows .btn-ghost. On a phone a row is three short lines (88 px): the
// store and its stock pill, the price, the host and when it was read, the button beside the last two. The long explanations sit in one
// "How these prices work" <details> under the table; the labels that belong next to a link ("affiliate link", "Ad") stay beside it.

const ROW_GRID = "grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-3 sm:grid-cols-[1fr_auto_7rem_auto] sm:gap-x-4 sm:px-5 sm:py-3.5";
const ROW_BUTTON = "min-h-11 justify-self-end whitespace-nowrap [grid-area:2/2/4] sm:min-h-10 sm:[grid-area:1/4/3]";

export function OfferTable({
  offers,
  region,
  preorder,
  packs = null,
  ebay = null,
  notes = [],
  placement = "product-table",
  top = null,
  numbered = false,
  bestLabel,
  ranked,
}: {
  offers: OfferView[];
  region: Region;
  preorder: boolean;
  /** Booster packs per unit (src/lib/packs.ts), for a per-pack price under each row's price. Null = not shown. */
  packs?: number | null;
  /** The product's eBay row: its slug (its own listings), the eBay search used when it has none, the store-price floor and the pack count
   *  listings are checked against (lib/ebay-offer-row.ts rowPacks). Null = no eBay row. */
  ebay?: { slug: string; query: string; floor: PriceFloor | null; packs: number | null } | null;
  /** The page's own explanations (shipping, TCGplayer, per pack, MSRP), first in "How these prices work". */
  notes?: string[];
  /** Whose buttons these are, for the affiliate sub-id and buy_click: the product page's table unless a page says otherwise (the pre-order page: "preorders"). */
  placement?: Placement;
  /** Rows pinned at the top of the card, above the ranked rows (the pre-order page's marketplace rows and its "Stores" label). */
  top?: ReactNode;
  /** Number the open rows 1, 2, 3… in price order (the pre-order page). The product page's table is not numbered. */
  numbered?: boolean;
  /** The cheapest open row's badge, when "Best price" would say more than the table knows (the pre-order page: "Cheapest" on a phone,
   *  "Cheapest store" from sm, so a long store name keeps its room). */
  bestLabel?: { short: string; full: string };
  /** The footer's ranking sentence, when the page ranks differently from "In stock first, then cheapest." */
  ranked?: string;
}) {
  const r = REGIONS[region];
  const now = Date.now();
  const cheapestOpen = offers.find((o) => offerStock(o, now) === "open");
  // Each row as data (prices formatted, stock state and links decided here, on the server): the browser's list (OfferRowsWithEbay)
  // renders the rows from it. Passing data, not rendered rows, keeps the page's RSC payload small: a row is ~350 bytes of data where
  // its element tree was ~1.5 KB, on top of the same row in the HTML.
  let rank = 0;
  const rows: StoreRowData[] = offers.map((o) => {
    const state = offerStock(o, now);
    const link = offerLink(o.store, o.url, region, placement);
    const open = state === "open";
    return {
      ...(numbered && open ? { rank: ++rank } : {}),
      ...(bestLabel && o === cheapestOpen ? { badge: bestLabel } : {}),
      key: o.store,
      cents: o.priceCents,
      open,
      state,
      best: o === cheapestOpen,
      name: o.storeName,
      host: o.storeHost,
      title: o.title,
      marketplace: o.marketplace,
      href: link.href,
      rel: link.rel,
      sponsored: link.sponsored,
      retailer: offerRetailer(o.store, o.storeName, r.market),
      placement,
      price: money(o.priceCents, r.market),
      // packs.ts perPackCents, inlined: this module is also in the browser's bundle (StoreRow), and packs.ts brings sets.ts and the
      // title classifier with it
      perPack: packs && open && o.priceCents > 0 ? money(Math.round(o.priceCents / packs), r.market) : null,
      lastSeen: o.lastSeen,
      ago: timeAgo(o.lastSeen, now),
    };
  });
  const footer = tableFooter(!!ebay);
  return (
    <>
      <div className="card overflow-hidden">
        {top}
        {ebay ? (
          <OfferRowsWithEbay rows={rows} region={region} slug={ebay.slug} query={ebay.query} floor={ebay.floor} packs={ebay.packs} allowBest={!preorder} preorder={preorder} />
        ) : (
          <StoreRows rows={rows} preorder={preorder} />
        )}
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
          {ranked ?? footer.ranked}{" "}
          <Link href="/about" prefetch={false} className="underline underline-offset-2 hover:text-ink">
            {footer.noPay}
          </Link>
          {footer.ad && ` ${footer.ad}`}
        </p>
      </div>
      <HowPricesWork>
        {notes.length > 0 && <p>{notes.join(" ")}</p>}
        <p>
          Prices are each store&rsquo;s own, in {r.currency}, read from their public product listings about twice a day; each row says when.
          &ldquo;Not checked recently&rdquo; means we couldn&rsquo;t read that store for over three days, so its stock is unknown. No store pays
          to be listed or to rank higher: <Link href="/about" prefetch={false} className="underline underline-offset-2 hover:text-ink">how DexCompare works</Link>.
          {offers.some((o) => o.marketplace) && " TCGplayer is a marketplace of many sellers; it ranks by price and stock like any store, and its link is an affiliate link."}
        </p>
        {ebay && <p>{ebayRowNote(region).trim()}</p>}
      </HowPricesWork>
    </>
  );
}

/** The long explanations, collapsed under the table: one tap away, all in the HTML. */
function HowPricesWork({ children }: { children: ReactNode }) {
  return (
    <details className="group/how mt-3 text-xs text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg font-semibold text-ink hover:text-brand-strong [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        How these prices work
        <Chevron className="group-open/how:rotate-180" />
      </summary>
      <div className="max-w-3xl space-y-2 pb-1 leading-5">{children}</div>
    </details>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform motion-reduce:transition-none ${className}`}>
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

/** The table without an eBay row (the eBay row's own list, OfferRowsWithEbay, is the same markup): eight rows, then the two groups. */
function StoreRows({ rows, preorder }: { rows: StoreRowData[]; preorder: boolean }) {
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
      </div>
      <OutboundLink href={d.href} rel={d.rel} retailer={d.retailer} placement={d.placement ?? "product-table"} className={`${d.best ? "btn-primary" : d.open ? "btn-soft" : "btn-ghost"} ${ROW_BUTTON}`}>
        {d.open ? "View deal" : "View"} <span aria-hidden="true">↗</span>
      </OutboundLink>
    </li>
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
