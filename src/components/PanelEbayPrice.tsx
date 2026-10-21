"use client";

import { ebayLabel, ebayRetailer, ebayRetailerForHref, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { shipLabel } from "@/lib/ebay-context";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import { money } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import { useEbayPick } from "./EbayStrip";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";

// The Marketplaces panel's eBay row (components/Marketplaces.tsx), in the browser. The server HTML is an eBay SEARCH for the product
// (placement product-marketplace), always eBay's blue button. When the product has its OWN new listing (the price table's pick:
// useEbayPick with the table's exact arguments, so the same request) and the best-price card above is NOT already showing it (the card's
// `cheaper` rule: a new listing strictly cheaper than the cheapest in-stock store), the row shows that listing's price and age and links to
// it, exactly as eBay returned the link (placement listings-marketplace). So a listing dearer than the cheapest store is still offered,
// once, and a cheaper one is never shown twice in the first screen.
//
// Never on a pre-order product, in NZ or in SG (the page passes no `pick`): eBay's pre-sale listings, and A$/US$ listings not compared
// with the stores', stay a search. The two versions are stacked in one grid cell, the one not shown invisible (BestPriceCard's pattern),
// so the row is the same height in both states and nothing moves when the listing arrives.

const ROW =
  "flex items-center justify-between gap-x-4 px-5 py-3 text-sm transition-colors hover:bg-raised focus-visible:outline-offset-[-2px]";
const BUTTON = "btn-ad min-h-10 shrink-0 whitespace-nowrap";

export interface PanelPick {
  slug: string;
  floor: PriceFloor | null;
  packs: number | null;
}

export function PanelEbayPrice({ region, searchHref, pick, storeCents }: { region: Region; searchHref: string; pick: PanelPick | null; storeCents: number }) {
  if (!pick) return <SearchRow region={region} href={searchHref} />;
  return <WithListing region={region} searchHref={searchHref} pick={pick} storeCents={storeCents} />;
}

function WithListing({ region, searchHref, pick, storeCents }: { region: Region; searchHref: string; pick: PanelPick; storeCents: number }) {
  const placement: Placement = "listings-marketplace";
  const { ref, item, cents, bestable, age } = useEbayPick({ region, slug: pick.slug, floor: pick.floor, packs: pick.packs, placement });
  // BestPriceCard's rule, to the letter: when it holds, the card above already shows this listing.
  const cheaper = bestable && item != null && cents != null && cents < storeCents;
  const listing = bestable && item != null && cents != null && !cheaper ? { item, cents, ship: shipLabel(item.ship) } : null;
  const show = listing != null;
  return (
    <div ref={ref} className="grid grid-cols-[minmax(0,1fr)]">
      <div className={`col-start-1 row-start-1 ${show ? "invisible" : ""}`} aria-hidden={show || undefined}>
        <SearchRow region={region} href={searchHref} />
      </div>
      <div className={`col-start-1 row-start-1 ${show ? "" : "invisible"}`} aria-hidden={!show || undefined}>
        {listing ? (
          <OutboundLink href={listing.item.href} rel={REL_SPONSORED} retailer={ebayRetailerForHref(listing.item.href, region)} placement={placement} className={ROW}>
            <Lines
              top={
                <>
                  <span className="text-muted">·</span> <span className="tabular font-semibold">from {money(listing.cents, REGIONS[region].market)}</span>
                </>
              }
              bottom={`${listing.ship.text !== "Shipping on eBay" ? `${listing.ship.text} · ` : ""}updated ${age}`}
            />
            <span className={BUTTON}>
              View on eBay <span aria-hidden="true">↗</span>
              <span className="sr-only"> (ad): {listing.item.title}</span>
            </span>
          </OutboundLink>
        ) : (
          // the placeholder: the listing row's shape, no link
          <div className={ROW}>
            <Lines top={<span className="tabular font-semibold">from …</span>} bottom="updated 26 h ago" />
            <span className={BUTTON}>View on eBay ↗</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The search row: what the server renders, and what the row stays without a listing to show. */
function SearchRow({ region, href }: { region: Region; href: string }) {
  return (
    <OutboundLink href={href} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement="product-marketplace" className={ROW}>
      <Lines top={null} bottom={`Buy It Now listings on ${ebayLabel(region)}`} />
      <span className={BUTTON}>
        Search eBay <span aria-hidden="true">↗</span>
      </span>
    </OutboundLink>
  );
}

/** Two single lines (nothing wraps), so both versions of the row are the same height: the wordmark, "Ad" and a fact; then a small line. */
function Lines({ top, bottom }: { top: React.ReactNode; bottom: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex h-6 min-w-0 items-center gap-1.5 whitespace-nowrap">
        <EbayMark className="text-lg" />
        <span className="ad-pill">Ad</span>
        {top}
      </span>
      <span className="block truncate text-xs leading-4 text-muted">{bottom}</span>
    </span>
  );
}
