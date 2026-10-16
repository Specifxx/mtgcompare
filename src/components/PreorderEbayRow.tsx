"use client";

import { useEffect, useRef, useState } from "react";
import { ebayAffiliateUrl, ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { isLikelyBot } from "@/lib/data/plane/crawler";
import { ageLabel, formatMoney, itemUrl, panelFor, panelTitle, type EbayPanelData, type PanelListing } from "@/lib/listing-panel";
import { sealedEbayQuery } from "@/lib/sealed-quick-view";
import { EbayWordmark } from "./AffiliateAds";
import { PANEL_ENDPOINT } from "./EbayCardPanel";

// The eBay line of a pre-order product's "Marketplaces" group (components/PreorderProduct.tsx), always its first line. eBay data lives in Neon
// only (licence), so a public page never reads it in its server render: this island asks the panel route the sealed page already uses
// (/api/ebay/panel/<productId>: the rows scripts/ebay.ts captured from a COMPLETED search, CDN-cached) once the block is near the viewport,
// and not at all for a crawler. With a fresh listing in the visitor's market it shows that listing's ITEM price, in the listing's currency,
// and what the seller says about postage (free, a charge, or not stated: never "delivered"). Otherwise, before it loads, and in the server
// render, it is the EPN-tagged eBay search for the product. Never numbered, never "Cheapest", never counted as a store.
export function PreorderEbayRow({ productId, name, slug, country, page }: { productId: number; name: string; slug: string; country: Country; page: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const [listing, setListing] = useState<PanelListing | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || isLikelyBot(typeof navigator === "undefined" ? "" : navigator.userAgent)) return;
    const ctl = new AbortController();
    const load = () =>
      fetch(`${PANEL_ENDPOINT}/${productId}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Partial<EbayPanelData>>) : null))
        .then((d) => {
          if (!d) return;
          const at = Date.now();
          const first = panelFor({ listings: Array.isArray(d.listings) ? d.listings : [], graded: [] }, country, at, 1).listings[0] ?? null;
          setNow(at);
          setListing(first);
        })
        .catch(() => {});
    if (typeof IntersectionObserver === "undefined") {
      void load();
      return () => ctl.abort();
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      ctl.abort();
    };
  }, [productId, country]);

  const postage = (l: PanelListing) => (l.shippingCents === 0 ? "free postage" : l.shippingCents != null ? `+ ${formatMoney(l.shippingCents, l.currency)} postage` : "postage not stated");
  const search = ebaySearchUrl(country, sealedEbayQuery(name), "preorder-marketplace");
  return (
    <li ref={ref} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-marketplace="ebay">
      <span className="flex w-[4.5rem] shrink-0 items-center sm:w-20" aria-hidden>
        <EbayWordmark className="text-base" />
      </span>
      <div className="min-w-0 flex-1">
        {listing ? (
          <>
            <p className="text-sm font-semibold text-white sm:hidden">Listing</p>
            <p className="hidden truncate text-[15px] font-semibold text-white sm:block" title={listing.title}>
              {panelTitle(listing.title, 64)}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              <span className="hidden sm:inline">Listing on {ebayLabel(country)} · </span>
              {postage(listing)}
              {now != null ? (
                <>
                  {" "}
                  · <time dateTime={listing.checkedAt}>{ageLabel(listing.checkedAt, now)}</time>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-white sm:text-[15px]">Search {ebayLabel(country)}</p>
            <p className="mt-0.5 text-xs text-slate-400">Every eBay listing for this product, pre-orders included</p>
          </>
        )}
      </div>
      {listing ? <span className="num shrink-0 text-right text-base font-bold text-white sm:text-lg">{formatMoney(listing.priceCents, listing.currency)}</span> : null}
      <a
        href={listing ? ebayAffiliateUrl(itemUrl(country, listing.itemId), "preorder-marketplace") : search}
        target="_blank"
        rel={outboundRel()}
        data-retailer={listing ? "ebay_listing" : "ebay_sealed_search"}
        data-page={page}
        data-card={slug}
        data-surface="preorder_marketplace_ebay"
        className="btn-ebay shrink-0 whitespace-nowrap px-3 sm:w-44 sm:px-4"
        aria-label={listing ? `View the eBay listing for ${name}` : `Search eBay for ${name}`}
      >
        <span className="hidden sm:inline">{listing ? "View on eBay →" : "Search eBay →"}</span>
        <span className="sm:hidden">→</span>
      </a>
    </li>
  );
}
