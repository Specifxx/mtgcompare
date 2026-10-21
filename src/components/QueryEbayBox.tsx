"use client";

import { AFFILIATE_NOTE, ebayRetailer, ebaySearchUrl, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerSearchUrl } from "@/lib/affiliate";
import { REGIONS, type Region } from "@/lib/regions";
import { AdPill } from "./Ebay";
import { OutboundLink } from "./OutboundLink";

/** The query as the box shows it: whitespace collapsed, and cut at 60 characters (the link searches up to 100). */
export function shownQuery(q: string): string {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
}

/**
 * The browse page with a search typed (?q=, the header's "See all results"): ONE query-matched, labelled box on its own grid row after
 * the first four results, in the slot the unfiltered page's listing strip uses (ProductGrid `strip`), so a search page never carries
 * more units than the unfiltered one. eBay's Buy It Now search for the words typed and, in the US, TCGplayer's.
 *
 * Client-only by construction: BrowseGrid reads the query after hydration, so it never reaches the cached HTML, the database or a log
 * of ours (the visitor's own click takes it to eBay or TCGplayer). Placement browse-search.
 */
export function QueryEbayBox({ region, q }: { region: Region; q: string }) {
  const term = q.replace(/\s+/g, " ").trim().slice(0, 100);
  if (!term) return null;
  const us = REGIONS[region].market === "US";
  const shown = shownQuery(term);
  return (
    <div data-ad="browse-search" role="group" aria-label="Sponsored: marketplace searches" className="ad-box flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          <AdPill /> <span>Sponsored search</span>
        </div>
        <p className="mt-1.5 font-display text-base font-bold leading-snug text-ink sm:text-lg">Also check the marketplaces</p>
        <p className="mt-1 text-xs leading-5 text-muted">{AFFILIATE_NOTE}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:shrink-0 lg:flex-nowrap">
        <OutboundLink
          href={ebaySearchUrl(term, region, "browse-search")}
          rel={REL_SPONSORED}
          retailer={ebayRetailer(region)}
          placement="browse-search"
          className="btn-ad min-h-11 max-w-full px-5 py-2.5 text-center leading-snug"
        >
          <span className="text-balance">See &ldquo;{shown}&rdquo; on eBay — Buy It Now</span> <span aria-hidden="true">↗</span>
        </OutboundLink>
        {us && (
          <span className="flex items-center gap-2">
            <OutboundLink
              href={tcgplayerSearchUrl(term, region, "browse-search")}
              rel={REL_SPONSORED}
              retailer={TCGPLAYER_RETAILER}
              placement="browse-search"
              className="btn-ghost min-h-11 flex-1 px-5"
            >
              Search TCGplayer <span aria-hidden="true">↗</span>
            </OutboundLink>
            <span className="shrink-0 text-[11px] font-medium text-muted">affiliate link</span>
          </span>
        )}
      </div>
    </div>
  );
}
