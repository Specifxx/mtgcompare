"use client";

import { ebayLabel, ebayRetailer, ebayRetailerForHref, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { shipLabel } from "@/lib/ebay-context";
import type { PriceFloor } from "@/lib/ebay-offer-row";
import { money } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/regions";
import { useEbayPick } from "./EbayStrip";
import { OutboundLink } from "./OutboundLink";

// The eBay action of a SOLD-OUT product page (inside SoldOutCallout's eBay box, components/Marketplaces.tsx): the first thing a visitor
// who found nothing in stock can do. The server HTML is a full-width eBay-blue SEARCH button, "Find it on ebay.co.uk" (placement
// soldout-ebay, customid dex-<region>-soldout-ebay): no eBay data in the cached page. In the browser it reads the price table's pick
// (useEbayPick with the table's exact arguments: the same request, no second fetch) and, when that is the product's own NEW listing,
// becomes "On eBay from £99.50 + £3.38 shipping · updated 16 h ago" with "View on eBay", linking to the listing exactly as eBay returned
// it (placement listings-soldout-best). The search and the listing are stacked in one grid cell, the one not shown invisible, so nothing
// moves when it swaps (the first screen of the page).
//
// Never on a pre-order product, in NZ or in SG (the page passes no `pick`): an eBay listing of an unreleased product is a seller's
// pre-sale, and NZ and SG are served A$ and US$ listings that are never compared with the stores'. There the box stays the search.

export interface SoldOutPick {
  slug: string;
  floor: PriceFloor | null;
  packs: number | null;
}

const LINE = "line-clamp-2 min-h-10 text-sm leading-5 text-muted sm:line-clamp-1 sm:min-h-5";
const BUTTON = "btn-ad mt-2 min-h-12 w-full px-6 py-3 text-base";

export function SoldOutEbay({ region, searchHref, pick }: { region: Region; searchHref: string; pick: SoldOutPick | null }) {
  if (!pick) return <Search region={region} href={searchHref} />;
  return <WithListing region={region} searchHref={searchHref} pick={pick} />;
}

function WithListing({ region, searchHref, pick }: { region: Region; searchHref: string; pick: SoldOutPick }) {
  const placement: Placement = "listings-soldout-best";
  const { ref, item, cents, bestable, age } = useEbayPick({ region, slug: pick.slug, floor: pick.floor, packs: pick.packs, placement });
  const listing = bestable && item != null && cents != null ? { item, cents, ship: shipLabel(item.ship) } : null;
  const ship = listing ? (listing.ship.free ? " · free shipping" : listing.ship.text !== "Shipping on eBay" ? ` ${listing.ship.text}` : "") : "";
  return (
    <div ref={ref} className="grid grid-cols-[minmax(0,1fr)]">
      <div className={`col-start-1 row-start-1 ${listing ? "invisible" : ""}`} aria-hidden={listing ? true : undefined}>
        <Search region={region} href={searchHref} />
      </div>
      <div className={`col-start-1 row-start-1 ${listing ? "" : "invisible"}`} aria-hidden={listing ? undefined : true}>
        {listing ? (
          <>
            <p className={LINE}>
              On eBay from <b className="tabular font-semibold text-ink">{money(listing.cents, REGIONS[region].market)}</b>
              {ship} · updated {age}
            </p>
            <OutboundLink href={listing.item.href} rel={REL_SPONSORED} retailer={ebayRetailerForHref(listing.item.href, region)} placement={placement} className={BUTTON}>
              View on eBay <span aria-hidden="true">↗</span>
              <span className="sr-only"> (ad): {listing.item.title}</span>
            </OutboundLink>
          </>
        ) : (
          <>
            <p className={LINE}>On eBay from … · updated 26 h ago</p>
            <span className={BUTTON}>View on eBay ↗</span>
          </>
        )}
      </div>
    </div>
  );
}

/** The search: the server HTML, and what the box stays without a new listing of the product's own. */
function Search({ region, href }: { region: Region; href: string }) {
  return (
    <>
      <p className={LINE}>Sealed Buy It Now listings from eBay sellers.</p>
      <OutboundLink href={href} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement="soldout-ebay" className={BUTTON}>
        Find it on {ebayLabel(region)} <span aria-hidden="true">↗</span>
      </OutboundLink>
    </>
  );
}
