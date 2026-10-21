import Link from "next/link";
import type { ReactNode } from "react";
import {
  AFFILIATE_NOTE,
  ebayLabel,
  ebayRetailer,
  ebaySearchUrl,
  offerLink,
  REL_SPONSORED,
  TCGPLAYER_KEY,
  TCGPLAYER_RETAILER,
  tcgplayerSearchUrl,
  type OutboundHref,
  type Placement,
} from "@/lib/affiliate";
import { money } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import { offerStock } from "@/lib/sealed-offers";
import { AdPill } from "./Ebay";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";
import { PanelEbayPrice, type PanelPick } from "./PanelEbayPrice";
import { SoldOutEbay, type SoldOutPick } from "./SoldOutEbay";
import { StockPill } from "./StockPill";

// The marketplace links: eBay (EPN search) and TCGplayer (Impact). These are the
// site's only paid links, so every group of them carries its own disclosure —
// the FTC wants it next to the links, not only in the footer.
//
// TCGplayer is a US marketplace. In the US it is also one of the product's
// offers and ranks with the stores; everywhere else it is shown here, labelled
// as US$, and never enters the region's comparison.

export { AFFILIATE_NOTE };

/** The fields of a matched TCGplayer offer the marketplace links need (an OfferView or usMarketplace). */
export interface TcgplayerMatch {
  title: string; // TCGplayer's own product name: also the cleanest eBay search for it
  url: string;
  priceCents: number;
  inStock: boolean;
  lastSeen: string;
}

/** "US$54.99": outside the US a TCGplayer price is never shown as a bare "$". */
export function usd(cents: number): string {
  return `US${money(cents, "US")}`;
}

/** The matched product if we have one, else a search. Both wrapped. */
function tcgplayerLink(region: Region, name: string, match: TcgplayerMatch | null, placement: Placement): OutboundHref {
  if (match) return offerLink(TCGPLAYER_KEY, match.url, region, placement);
  return { href: tcgplayerSearchUrl(name, region, placement), rel: REL_SPONSORED, sponsored: true };
}

/** What to search eBay for: TCGplayer's clean name for the product when we have it, else ours. */
export function ebayQuery(productName: string, tcgplayer: Pick<TcgplayerMatch, "title"> | null | undefined): string {
  return tcgplayer?.title || productName;
}

// The focus ring is drawn inside (-2px): these rows sit in an overflow-hidden card, which would clip it.
const ROW = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3.5 text-sm transition-colors hover:bg-raised focus-visible:outline-offset-[-2px]";
// Muted, not faint: a disclosure must be as readable as what it discloses (WCAG AA).
const NOTE = "text-xs leading-5 text-muted";

/** Product page, under the best-price card: eBay and TCGplayer, in every region. */
export function MarketplacePanel({
  region,
  productName,
  preorder,
  tcgplayer,
  tcgplayerIsBest = false,
  popular = false,
  pick = null,
  storeCents = null,
}: {
  region: Region;
  productName: string;
  preorder: boolean;
  /** US: TCGplayer's row in the offer table. Elsewhere: the US$ offer (usMarketplace). */
  tcgplayer: TcgplayerMatch | null;
  /** US: TCGplayer is the best price above, so its button is already there. */
  tcgplayerIsBest?: boolean;
  /**
   * A product of one of the owner's hot sets (lib/popular.ts): the panel's heading carries a "Popular set" chip, outside the ad link.
   * The owner's pick (lib/popular.ts), so the words claim nothing about eBay's data.
   */
  popular?: boolean;
  /**
   * The price table's eBay pick (its exact useEbayPick arguments), where the best-price card may show the listing (not a pre-order, not
   * NZ or SG): the eBay row then shows the product's own new listing whenever the card does not (PanelEbayPrice.tsx). Null = a search.
   */
  pick?: PanelPick | null;
  /** The best-price card's store price, for its `cheaper` rule. */
  storeCents?: number | null;
}) {
  const r = REGIONS[region];
  const us = r.market === "US";
  const tcg = tcgplayerLink(region, productName, tcgplayer, "product-marketplace");
  const state = tcgplayer ? offerStock(tcgplayer) : null;
  // In the US a matched TCGplayer offer is already ranked in the table (and,
  // when cheapest, is the best-price button): no second price or pill here,
  // and no row at all when it would repeat the button just above.
  const showTcg = !(us && tcgplayer && tcgplayerIsBest);
  let tcgText: ReactNode;
  if (!tcgplayer) {
    tcgText = (
      <>
        <b>TCGplayer</b> <span className="text-muted">— {us ? "search its Pokémon sealed listings" : "US marketplace, prices in US$"}</span>
      </>
    );
  } else if (us) {
    tcgText = (
      <>
        <b>TCGplayer</b> <span className="text-muted">— {state === "open" ? (preorder ? "pre-order" : "in stock") : state === "soldout" ? "sold out" : "not checked recently"}, ranked in the table below</span>
      </>
    );
  } else if (state === "open") {
    tcgText = (
      <>
        <b className="tabular">{usd(tcgplayer.priceCents)} on TCGplayer</b> <span className="text-muted">(US marketplace, prices in US$)</span>
      </>
    );
  } else {
    tcgText = (
      <>
        <b>TCGplayer</b>{" "}
        <span className="text-muted">— {state === "soldout" ? "sold out" : "not checked recently"} (US marketplace, prices in US$)</span>
      </>
    );
  }
  return (
    <div data-ad="product-marketplace" className="card mt-3 overflow-hidden">
      <h2 className="eyebrow flex items-center justify-between gap-3 border-b border-line bg-raised px-5 py-2.5">
        Marketplaces
        {/* Outside the ad link: the site's own pick (lib/popular.ts HOT_SETS), not eBay's data and not a claim of a trend. */}
        {popular && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-brand-strong">Popular set</span>}
      </h2>
      <ul className="divide-y divide-line">
        {/* eBay's row: always eBay's blue button (the growth release); its own new listing's price when the card above is not showing it */}
        <li className="bg-ad">
          <PanelEbayPrice region={region} searchHref={ebaySearchUrl(ebayQuery(productName, tcgplayer), region, "product-marketplace")} pick={storeCents != null ? pick : null} storeCents={storeCents ?? 0} />
        </li>
        {showTcg && (
          <li>
            <OutboundLink href={tcg.href} rel={tcg.rel} retailer={TCGPLAYER_RETAILER} placement="product-marketplace" className={ROW}>
              <span className="min-w-0">{tcgText}</span>
              <span className="ml-auto flex shrink-0 items-center gap-3">
                <span className="font-semibold text-brand-strong">
                  {tcgplayer ? "View on TCGplayer" : "Search TCGplayer"} <span aria-hidden="true">↗</span>
                </span>
              </span>
            </OutboundLink>
          </li>
        )}
      </ul>
      <p className={`border-t border-line px-5 py-2.5 ${NOTE}`}>
        {AFFILIATE_NOTE}
        {!us && ` TCGplayer sells in US$ from the US; check it ships to ${r.name} before you buy.`}
      </p>
    </div>
  );
}

/**
 * Product page, in place of the best-price card when nothing in the region is open (in stock or pre-order): say so plainly, then where
 * it may still be bought. 61% of product pages are sold out, so this box is the page's main action for most visitors: an eBay box first
 * (one labelled unit, data-ad="soldout-ebay": eBay's blue "Find it on ebay.co.uk" search in the server HTML, the product's own new
 * listing with its price and age once the browser has it, SoldOutEbay.tsx), TCGplayer as a second, quieter button inside the same box,
 * the affiliate note under both; then an internal link to what is in stock instead. The product's listing strip sits further down the
 * page (soldOutAdPlan), never next to this box.
 */
export function SoldOutCallout({
  region,
  productName,
  storesListing,
  notChecked,
  tcgplayer,
  ebayQuery: query,
  pick = null,
  instead = null,
}: {
  region: Region;
  productName: string;
  /** Stores (not marketplaces) in this region that list the product. */
  storesListing: number;
  /** …of which we couldn't read recently, so "sold out" is a guess for them. */
  notChecked: number;
  tcgplayer: TcgplayerMatch | null;
  /** What to search eBay for (ebayQuery). */
  ebayQuery: string;
  /** The price table's eBay pick, or null (a pre-order product, NZ, SG): the box then stays the search. */
  pick?: SoldOutPick | null;
  /** An internal link to in-stock products of the type ("See Elite Trainer Boxes in stock in the UK →"). */
  instead?: { href: string; label: string } | null;
}) {
  const r = REGIONS[region];
  const us = r.market === "US";
  const tcg = tcgplayerLink(region, productName, tcgplayer, "product-soldout");
  const tcgOpen = !us && tcgplayer && offerStock(tcgplayer) === "open";
  const tcgBtn = (
    <OutboundLink href={tcg.href} rel={tcg.rel} retailer={TCGPLAYER_RETAILER} placement="product-soldout" className="btn-ghost mt-2 min-h-11 w-full px-4 py-2.5 text-center">
      <span className="tabular">
        {tcgOpen ? `${usd(tcgplayer!.priceCents)} on TCGplayer (US)` : `${tcgplayer ? "Check" : "Search"} TCGplayer${us ? "" : " (US)"}`} <span aria-hidden="true">↗</span>
      </span>
    </OutboundLink>
  );
  return (
    <div className="card p-5 sm:p-6">
      <StockPill state="soldout">Sold out</StockPill>
      <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight">
        {storesListing ? `Sold out at every ${r.adjective} store we track` : `No ${r.adjective} store we track lists this yet`}
      </h2>
      <p className="mt-1.5 text-sm text-muted">
        {storesListing > 0 && (
          <>
            {storesListing === 1 ? "The one store that lists it doesn’t have" : `None of the ${storesListing} stores that list it has`} it in stock
            {notChecked > 0 && ` (${notChecked} not checked recently)`}.{" "}
          </>
        )}
        Marketplaces may still have it.
      </p>
      <div data-ad="soldout-ebay" role="group" aria-label="Sponsored: eBay and TCGplayer" className="ad-box mt-4 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <EbayMark className="text-lg" />
          <AdPill />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">Marketplaces</span>
        </div>
        <div className="mt-2">
          <SoldOutEbay region={region} searchHref={ebaySearchUrl(query, region, "soldout-ebay")} pick={pick} />
        </div>
        {tcgBtn}
        <p className={`mt-2.5 ${NOTE}`}>
          {AFFILIATE_NOTE}
          {!us && ` TCGplayer sells in US$ from the US; check it ships to ${r.name} before you buy.`}
        </p>
      </div>
      {instead && (
        <Link href={instead.href} prefetch={false} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-strong hover:underline">
          {instead.label} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

/**
 * The pre-order page's marketplace rows (the owner, 2026-10-16: "make sure the eBay links stay at the very top, alongside the TCG ones,
 * and everything else is priced in order"): pinned at the top of each product's price list, above the numbered stores, labelled, never
 * numbered, never "Best price", never counted as a store.
 *   • eBay first: the region's eBay SEARCH for the product (preorders-ebay). The importer refuses eBay pre-sales of an unreleased set, so
 *     there is no listing to price: the row says it is a search, not a price we checked. eBay blue, "Ad".
 *   • TCGplayer second (preorders-tcgplayer). In the US its own offer (price and stock, a pre-order like any row); elsewhere its US$ offer
 *     (usMarketplace, labelled US$ and never compared with the region's prices) or, with none, a search.
 * Server-rendered links only: nothing here fetches.
 */
export function PreorderMarketplaces({ region, productName, tcgplayer }: { region: Region; productName: string; tcgplayer: TcgplayerMatch | null }) {
  const r = REGIONS[region];
  const us = r.market === "US";
  const tcg = tcgplayerLink(region, productName, tcgplayer, "preorders-tcgplayer");
  const state = tcgplayer ? offerStock(tcgplayer) : null;
  const price = tcgplayer && state === "open" ? (us ? money(tcgplayer.priceCents, "US") : usd(tcgplayer.priceCents)) : null;
  const ROW_M = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5";
  return (
    <div data-ad="preorders-ebay" role="group" aria-label="Marketplaces: eBay and TCGplayer (affiliate links, not ranked with the stores)" className="border-b border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 bg-raised px-4 py-2 sm:px-5">
        <span className="eyebrow">Marketplaces</span>
        <span className="text-[11px] text-muted">Not ranked with the stores · affiliate links</span>
      </div>
      <ul className="divide-y divide-line">
        <li className={`${ROW_M} bg-ad`}>
          <span className="flex min-w-0 items-center gap-2">
            <EbayMark className="text-lg" />
            <AdPill />
            <span className="min-w-0 text-sm text-muted">Search on {ebayLabel(region)}, not a price we checked</span>
          </span>
          <OutboundLink
            href={ebaySearchUrl(ebayQuery(productName, tcgplayer), region, "preorders-ebay")}
            rel={REL_SPONSORED}
            retailer={ebayRetailer(region)}
            placement="preorders-ebay"
            className="btn-ad ml-auto min-h-11 shrink-0 whitespace-nowrap px-4 sm:min-h-10"
          >
            Search eBay <span aria-hidden="true">↗</span>
          </OutboundLink>
        </li>
        <li className={ROW_M}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <b className="font-semibold">TCGplayer</b>
            {price ? (
              <span className="tabular font-display text-base font-bold">{price}</span>
            ) : (
              <span className="text-muted">{tcgplayer ? (state === "soldout" ? "sold out" : "not checked recently") : "search its sealed listings"}</span>
            )}
            {tcgplayer && state === "open" && (
              <StockPill state="open" preorder>
                Pre-order
              </StockPill>
            )}
            {!us && <span className="text-[11px] text-muted">US marketplace, prices in US$</span>}
          </span>
          <OutboundLink href={tcg.href} rel={tcg.rel} retailer={TCGPLAYER_RETAILER} placement="preorders-tcgplayer" className="btn-ghost ml-auto min-h-11 shrink-0 whitespace-nowrap px-4 sm:min-h-10">
            {tcgplayer ? "View" : "Search"} on TCGplayer <span aria-hidden="true">↗</span>
          </OutboundLink>
        </li>
      </ul>
      <p className={`px-4 pb-2.5 pt-1 sm:px-5 ${NOTE}`}>
        {AFFILIATE_NOTE}
        {!us && ` TCGplayer sells in US$ from the US; check it ships to ${r.name} before you buy.`}
      </p>
    </div>
  );
}

/**
 * The browse page's "nothing matches": the same words on eBay and TCGplayer.
 * The eBay half is a labelled unit; it stands in for the footer banner, which
 * the grid drops while this shows (NoPreFooter).
 */
export function MarketplaceSearch({ region, query, placement }: { region: Region; query: string; placement: Placement }) {
  const us = REGIONS[region].market === "US";
  return (
    <div data-ad={placement} role="group" aria-label="Sponsored: eBay and TCGplayer searches" className="ad-box mx-auto mt-6 max-w-xl p-5">
      <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted">
        <AdPill /> <span>eBay · sponsored link</span>
      </div>
      <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">No store we track matches. Search for it on eBay?</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <OutboundLink href={ebaySearchUrl(query, region, placement)} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement={placement} className="btn-ad max-w-full px-6 py-3 text-base">
          <span className="truncate">Search eBay for &ldquo;{query}&rdquo;</span> <span aria-hidden="true">↗</span>
        </OutboundLink>
        <OutboundLink href={tcgplayerSearchUrl(query, region, placement)} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement={placement} className="btn-ghost px-5 py-3 text-base">
          Search TCGplayer{us ? "" : " (US)"} <span aria-hidden="true">↗</span>
        </OutboundLink>
      </div>
      <p className={`mt-3 ${NOTE}`}>{AFFILIATE_NOTE}</p>
    </div>
  );
}
