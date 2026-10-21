"use client";

import type { ReactNode } from "react";
import { ebayRetailerForHref, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { shipLabel } from "@/lib/ebay-context";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import { medianSaving, money, pctOf, plural } from "@/lib/format";
import type { Region } from "@/lib/regions";
import { EbayMark } from "./EbayMark";
import { useEbayPick } from "./EbayStrip";
import { OutboundLink } from "./OutboundLink";
import { StockPill } from "./StockPill";

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
  ebay: { slug: string; floor: PriceFloor | null; packs: number | null } | null;
}

const placement: Placement = "listings-best-price";

export function BestPriceCard(props: BestPriceCardProps) {
  return <Card {...props} top={props.ebay ? <WithEbay {...props} ebay={props.ebay} /> : <StoreTop {...props} />} />;
}

/** The median and MSRP badges of a price: present for the store when they are, and then for eBay (a cheaper price only adds to them). */
function badgesFor(cents: number, { median, medianStores, msrp }: BestPriceCardProps): { saving: string | null; belowMsrp: number | null } {
  const vs = msrp != null ? pctOf(cents, msrp) : null;
  return { saving: medianSaving(cents, median, medianStores), belowMsrp: vs != null && vs < 0 ? -vs : null };
}

function WithEbay(props: BestPriceCardProps & { ebay: NonNullable<BestPriceCardProps["ebay"]> }) {
  const { region, ebay, store } = props;
  const { ref, item, cents, bestable, age } = useEbayPick({ region, slug: ebay.slug, floor: ebay.floor, packs: ebay.packs, placement });
  const cheaper = bestable && item != null && cents != null && cents < store.cents;
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
    </div>
  );
}

function StoreTop(props: BestPriceCardProps) {
  const { preorder, store, packs, market } = props;
  const perPack = packs ? Math.round(store.cents / packs) : null;
  const { saving, belowMsrp } = badgesFor(store.cents, props);
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
          </div>
        </div>
        <OutboundLink href={store.href} rel={store.rel} retailer={store.retailer} placement="product-best" className="btn-primary self-start px-6 py-3 text-base sm:self-auto">
          {store.button} <span aria-hidden="true">↗</span>
        </OutboundLink>
      </div>
      {(saving || belowMsrp != null) && (
        <p className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-open">
          {saving && <span>{saving}</span>}
          {belowMsrp != null && <span className="rounded-full border border-open/40 px-2">{belowMsrp}% below US MSRP</span>}
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
  const { saving, belowMsrp } = badgesFor(shown, props);
  const badgeLine = storeBadges.saving != null || storeBadges.belowMsrp != null;
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
          {belowMsrp != null && <span className="shrink-0 rounded-full border border-open/40 px-2">{belowMsrp}% below US MSRP</span>}
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
      {top}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-muted">
        <StockPill state="open" preorder={preorder}>
          {preorder ? "Pre-order" : "In stock"}{" "}
          {p.openStores ? `at ${p.openStores} of ${plural(p.storeCount, "store")}${p.tcgOpen ? " + TCGplayer" : ""}` : "on TCGplayer"}
        </StockPill>
        {!p.openStores && p.storeCount > 0 && <span>no {p.adjective} store we track has it in stock</span>}
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
