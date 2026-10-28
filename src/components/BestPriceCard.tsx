"use client";

import type { ReactNode } from "react";
import { ebayRetailerForHref, ebaySearchUrl, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { shipLabel } from "@/lib/ebay-context";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import { medianSaving, money, msrpBadge, pctOf, plural, timeAgo, type MsrpBadge } from "@/lib/format";
import { RRP_NOTE } from "@/lib/rrp-note";
import { Ago } from "./Ago";
import type { Region } from "@/lib/regions";
import { EbayMark } from "./EbayMark";
import { useEbayPick } from "./EbayStrip";
import { OutboundLink } from "./OutboundLink";
import { StockPill } from "./StockPill";
import { useShipMode } from "@/lib/ship-mode";

// The product page's best-price card. The best price is the cheapest store you can buy from, OR the product's eBay listing when that is
// cheaper (the owner's call, 2026-10-11: "eBay's price counts as the cheapest price if it is the cheapest"). The listing is the one the
// price table's eBay row shows (EbayStrip.tsx useEbayPick: the same request, the same pick, the same "best" rule: a NEW listing, strictly
// cheaper), fetched in the browser as the page runs: the server HTML is the store's card, and its top turns to eBay's only when the
// listing arrives and is cheaper. Never on a pre-order product (the page passes no `ebay`): an eBay listing of an unreleased product is
// a seller's pre-sale.
//
// Nothing moves when it does (the card is in the first screen). Only the TOP of the card swaps: the headline (price, per pack, where,
// button) and the badges under it (median, MSRP). The store's and eBay's versions are stacked in one grid cell, the one not shown kept
// invisible, so the cell is as tall as the taller from the first paint; eBay's has a fixed number of single lines (each nowrap), its
// badge line there only when the store's is, so its height never depends on the listing. Below the rule the card describes the
// stores ("In stock at …", "up to … — you save … by buying at the cheapest", median, "best store price … MSRP"): server facts that do
// not change.
//
// When eBay's listing is the best price it is labelled as what it is: the eBay wordmark, "Ad", how old the listing is, its shipping,
// eBay's blue button, and the cheapest store's price beside it. JSON-LD, meta tags and the "from" prices elsewhere stay the stores'
// (server-rendered, cached for a day: an eBay price there would outlive its age bound).

export interface BestStore {
  cents: number;
  /** "at TCGORA", "on TCGplayer" */
  where: string;
  marketplace: boolean;
  href: string;
  rel: string;
  sponsored: boolean;
  retailer: string;
  button: string;
  /** When the store's price was last read (ISO): "checked 3 hours ago" under the price. */
  checked?: string;
}

export interface BestPriceCardProps {
  region: Region;
  market: string;
  adjective: string;
  preorder: boolean;
  store: BestStore;
  /** Packs in one unit, for "≈ … per pack". Null = not shown. */
  packs: number | null;
  median: number | null;
  medianStores: number;
  msrp: number | null;
  openStores: number;
  storeCount: number;
  tcgOpen: boolean;
  /** In-stock offers (stores and TCGplayer) and the dearest of them, for "up to … — you save …". */
  openCount: number;
  highestOpenCents: number;
  /** The product's eBay listing, in the stores' currency only (not NZ or SG), never for a pre-order. Null = the stores' card only. */
  ebay: { slug: string; floor: PriceFloor | null; packs: number | null; query?: string } | null;
  /** The best price + cheapest measured shipping (the price table's "Price + shipping" ranking, lib/shipping-rank.ts): shown when the
   *  visitor picks that ranking. Null when no in-stock store has measured shipping. */
  total?: { store: BestStore; shipCents: number; shipText: string; shipTitle: string } | null;
}

const placement: Placement = "listings-best-price";

export function BestPriceCard(props: BestPriceCardProps) {
  const top = props.ebay ? <WithEbay {...props} ebay={props.ebay} /> : <StoreTop {...props} />;
  return <Card {...props} top={props.total ? <WithTotal {...props} total={props.total} priceTop={top} /> : top} />;
}

/** "Price" or "Price + shipping" (the table's switch): both tops stacked in one grid cell, the other invisible, so nothing moves. */
function WithTotal({ total, priceTop, ...props }: BestPriceCardProps & { total: NonNullable<BestPriceCardProps["total"]>; priceTop: ReactNode }) {
  const on = useShipMode() === "total";
  const { market, preorder } = props;
  const { store } = total;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      <div className={`col-start-1 row-start-1 ${on ? "invisible" : ""}`} aria-hidden={on || undefined}>
        {priceTop}
      </div>
      <div className={`col-start-1 row-start-1 ${on ? "" : "invisible"}`} aria-hidden={!on || undefined}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-muted">{preorder ? "Cheapest pre-order" : "Best price in stock"} + shipping</div>
            <div className="tabular font-display text-4xl font-extrabold tracking-tight">{money(store.cents + total.shipCents, market)}</div>
            <div className="tabular mt-0.5 truncate text-sm text-muted" title={total.shipTitle}>
              {money(store.cents, market)} {total.shipText.startsWith("+") ? total.shipText : `+ ${total.shipText.toLowerCase()}`}, cheapest measured
            </div>
            <div className="mt-1 truncate text-sm text-muted">
              {store.where}
              {store.sponsored && <span> · affiliate link</span>}
            </div>
          </div>
          <OutboundLink href={store.href} rel={store.rel} retailer={store.retailer} placement="product-best" className="btn-primary self-start px-6 py-3 text-base sm:self-auto">
            {store.button} <span aria-hidden="true">↗</span>
          </OutboundLink>
        </div>
      </div>
    </div>
  );
}

/** The median and MSRP badges of a price: present for the store when they are, and then for eBay (a cheaper price only adds to them). */
function badgesFor(cents: number, { median, medianStores, msrp }: BestPriceCardProps): { saving: string | null; msrpVs: MsrpBadge | null } {
  return { saving: medianSaving(cents, median, medianStores), msrpVs: msrpBadge(cents, msrp) };
}

/** The MSRP badge: green under it, plain at it, muted over it (a fact, never an alarm). RRP_NOTE as its tooltip. */
function MsrpPill({ b }: { b: MsrpBadge }) {
  const tone = b.tone === "under" ? "border-open/40 text-open" : b.tone === "at" ? "border-line text-ink" : "border-line text-muted";
  return (
    <span data-msrp={b.tone} title={RRP_NOTE} className={`shrink-0 rounded-full border px-2 ${tone}`}>
      {b.text}
    </span>
  );
}

function WithEbay(props: BestPriceCardProps & { ebay: NonNullable<BestPriceCardProps["ebay"]> }) {
  const { region, ebay, store } = props;
  const { ref, item, cents, bestable, age } = useEbayPick({ region, slug: ebay.slug, floor: ebay.floor, packs: ebay.packs, placement });
  const cheaper = bestable && item != null && cents != null && cents < store.cents;
  // eBay gets one more line under the headline (the owner, 2026-10-28: "promote eBay more"). When a store is the best price, the
  // listing's REAL price ("Also on eBay"); with no listing, or when the listing is already the headline, a labelled search. Never an
  // estimate, never presented as the best. Always one line once the server sent one, so nothing moves when the listing arrives.
  const search: EbayAlt | null = ebay.query ? { kind: "search", href: ebaySearchUrl(ebay.query, region, "best-price-ebay-search") } : null;
  const alt: EbayAlt | null =
    !cheaper && bestable && item != null && cents != null && search ? { kind: "listing", href: item.href, cents, title: item.title } : search;
  return (
    <div ref={ref} className="grid grid-cols-[minmax(0,1fr)]">
      <div className={`col-start-1 row-start-1 ${cheaper ? "invisible" : ""}`} aria-hidden={cheaper || undefined}>
        <StoreTop {...props} />
      </div>
      <div className={`col-start-1 row-start-1 ${cheaper ? "" : "invisible"}`} aria-hidden={!cheaper || undefined}>
        <EbayTop
          {...props}
          cents={cheaper ? cents : null}
          href={cheaper ? item.href : null}
          title={cheaper ? item.title : ""}
          age={cheaper ? age : ""}
          ship={cheaper ? shipLabel(item.ship).text : ""}
        />
      </div>
      {/* one nowrap line in its own row: the server's search and the listing that replaces it are the same height (nothing moves) */}
      {alt && <EbayAltLine alt={alt} market={props.market} region={region} />}
    </div>
  );
}

export type EbayAlt = { kind: "listing"; href: string; cents: number; title: string } | { kind: "search"; href: string };

/** "Also on eBay: A$X  View ↗" (the listing's own price, no comparison computed from it: eBay's terms 8.1(d)) under a store's best price, or "Compare listings on eBay". Labelled Ad; the link is eBay's, tagged. */
export function EbayAltLine({ alt, market, region }: { alt: EbayAlt; market: string; region: Region }) {
  return (
    <div className="col-start-1 mt-3 min-w-0" data-ebay-alt={alt.kind}>
      <OutboundLink
        href={alt.href}
        rel={REL_SPONSORED}
        retailer={ebayRetailerForHref(alt.href, region)}
        placement={alt.kind === "listing" ? "listings-best-price-alt" : "best-price-ebay-search"}
        className="flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised"
      >
        <EbayMark className="shrink-0 text-base" />
        <span className="ad-pill shrink-0">Ad</span>
        {alt.kind === "listing" ? (
          <span className="min-w-0 truncate text-muted" title={alt.title}>
            Also on eBay: <span className="tabular font-semibold text-ink">{money(alt.cents, market)}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate text-muted">Compare listings on eBay</span>
        )}
        <span className="ml-auto shrink-0 font-semibold text-[#3665f3] dark:text-[#7c9cff]">
          {alt.kind === "listing" ? "View" : "Search"} <span aria-hidden="true">↗</span>
        </span>
      </OutboundLink>
    </div>
  );
}

function StoreTop(props: BestPriceCardProps) {
  const { preorder, store, packs, market } = props;
  const perPack = packs ? Math.round(store.cents / packs) : null;
  const { saving, msrpVs } = badgesFor(store.cents, props);
  return (
    <>
      {/* on a phone the button is always on a line of its own, as in eBay's version (same height whichever is shown) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          {/* the shipping note sits by the price, as eBay's version says its shipping on the same line */}
          <div className="text-sm font-medium text-muted">
            {preorder ? "Cheapest pre-order" : "Best price in stock"}
            <span className="font-normal"> · prices exclude shipping</span>
          </div>
          <div className="tabular font-display text-4xl font-extrabold tracking-tight">{money(store.cents, market)}</div>
          {perPack != null && <div className="tabular mt-0.5 text-sm text-muted">≈ {money(perPack, market)} per pack</div>}
          <div className="mt-1 text-sm text-muted">
            {store.where}
            {store.sponsored && <span> · marketplace · affiliate link</span>}
            {store.checked && (
              <span>
                {" "}
                · checked <Ago iso={store.checked} initial={timeAgo(store.checked)} />
              </span>
            )}
          </div>
        </div>
        <OutboundLink
          href={store.href}
          rel={store.rel}
          retailer={store.retailer}
          placement="product-best"
          className="btn-primary self-start px-6 py-3 text-base sm:self-auto">
          {store.button} <span aria-hidden="true">↗</span>
        </OutboundLink>
      </div>
      {(saving || msrpVs) && (
        <p className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-open">
          {saving && <span>{saving}</span>}
          {msrpVs && <MsrpPill b={msrpVs} />}
        </p>
      )}
    </>
  );
}

/** eBay's top: single lines only (nothing wraps), so it is as tall as its invisible placeholder before the listing arrives. */
function EbayTop(props: BestPriceCardProps & { cents: number | null; href: string | null; title: string; age: string; ship: string }) {
  const { region, market, packs, store, cents, href, title, age, ship } = props;
  const shown = cents ?? store.cents; // the invisible placeholder takes the store's figures
  const perPack = packs ? Math.round(shown / packs) : null;
  // the badge line only where the store's card has one (a cheaper price only adds to the badges, so eBay's has them too)
  const storeBadges = badgesFor(store.cents, props);
  const { saving, msrpVs } = badgesFor(shown, props);
  const badgeLine = storeBadges.saving != null || storeBadges.msrpVs != null;
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-muted">
            Best price in stock<span className="font-normal"> · {ship || "Shipping on eBay"}</span>
          </div>
          <div className="tabular whitespace-nowrap font-display text-4xl font-extrabold tracking-tight">{money(shown, market)}</div>
          {perPack != null && <div className="tabular mt-0.5 whitespace-nowrap text-sm text-muted">≈ {money(perPack, market)} per pack</div>}
          <div className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted" title={title || undefined}>
            <EbayMark className="text-base" />
            <span className="ad-pill">Ad</span>
            {/* the listing's age always shows; the cheapest store's price after it is cut first on a narrow phone */}
            <span className="shrink-0">· updated {age || "26 h ago"}</span>
            <span className="min-w-0 truncate">
              · vs {money(store.cents, market)} {store.where}
            </span>
          </div>
        </div>
        {href ? (
          <OutboundLink
            href={href}
            rel={REL_SPONSORED}
            retailer={ebayRetailerForHref(href, region)}
            placement={placement}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full bg-[#3665f3] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#2a50c8] sm:self-auto"
          >
            View on eBay <span aria-hidden="true">↗</span>
            <span className="sr-only"> (ad): {title}</span>
          </OutboundLink>
        ) : (
          <span className="inline-flex shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full px-6 py-3 text-base font-semibold sm:self-auto">
            View on eBay <span aria-hidden="true">↗</span>
          </span>
        )}
      </div>
      {badgeLine && (
        <p className="mt-3 flex flex-nowrap gap-2 overflow-hidden whitespace-nowrap text-sm font-semibold text-open">
          {saving && <span className="min-w-0 truncate">{saving}</span>}
          {msrpVs && <MsrpPill b={msrpVs} />}
        </p>
      )}
    </>
  );
}

/** The card: its top (the store's, or the store's and eBay's stacked), then the stores' facts, which do not change. */
function Card({ top, ...p }: BestPriceCardProps & { top: ReactNode }) {
  const { market, preorder, store, median, medianStores, msrp } = p;
  const vsMsrp = msrp != null ? pctOf(store.cents, msrp) : null;
  return (
    <div className="card p-5">
      {/* Stock first (owner, 2026-10-25): where it can be bought leads the card, before the price. Independent stores only in the count;
          TCGplayer is named beside it, never counted as a store. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-4 text-sm text-muted" data-stock-first="">
        <StockPill state="open" preorder={preorder}>
          {p.openStores ? `${preorder ? "Pre-order" : "In stock"} at ${p.openStores} of ${plural(p.storeCount, "store")}` : `${preorder ? "Pre-order" : "In stock"} on TCGplayer`}
        </StockPill>
        {p.openStores > 0 && p.tcgOpen && <span className="font-medium">+ TCGplayer</span>}
        {!p.openStores && p.storeCount > 0 && <span>no {p.adjective} store we track has it in stock</span>}
      </div>
      {top}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-muted empty:hidden">
        {p.openCount > 1 && (
          <span>
            up to {money(p.highestOpenCents, market)} — you save {money(p.highestOpenCents - store.cents, market)} by buying at the cheapest
          </span>
        )}
      </div>
      {(median != null || msrp != null) && (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
          {median != null && (
            <div>
              <dt className="inline">Median in-stock price </dt>
              <dd className="tabular inline font-semibold text-ink">
                {money(median, market)} <span className="font-normal text-muted">across {plural(medianStores, "store")}</span>
              </dd>
            </div>
          )}
          {msrp != null && (
            <div>
              <dt className="inline">US MSRP </dt>
              <dd className="tabular inline font-semibold text-ink">
                {money(msrp, market)}
                {vsMsrp != null && vsMsrp !== 0 && (
                  <span className="font-normal text-muted">
                    {" "}
                    · best {store.marketplace ? "offer" : "store price"} {Math.abs(vsMsrp)}% {vsMsrp < 0 ? "below" : "above"} MSRP
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
