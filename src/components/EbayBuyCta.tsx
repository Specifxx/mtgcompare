"use client";

import { ebayLabel, ebaySearchUrl, onePieceEbayQuery, outboundRel } from "@/lib/affiliate";
import { EbayWordmark } from "./AffiliateAds";
import { useCountry } from "./CountryProvider";

// The eBay buy path (RiftCompare's EbayBuyCta): an EPN-tagged eBay SEARCH on the
// visitor's own eBay, shown where a shopper has a card in mind and no store row
// to click — the movers lists, a /browse search, a card no store stocks, a set
// that has not released. A buy path, not an ad (no "Ad" label, shown to members
// too), and it never outranks a store: it sits beside the comparison, not in it.
//
// Copy follows RiftCompare's rules: a visitor's own words get "Search eBay for
// “q”", never "Buy q"; a pre-release card says nothing ships yet; nothing claims
// eBay has a listing. A client component so the market label follows the
// visitor's market on pages that stay cookie-free. Carries its own disclosure.
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function EbayBuyCta({
  query,
  name,
  heading,
  sub,
  compact = false,
  className,
  preRelease = false,
  freeText = false,
  source,
  page,
  card,
}: {
  /** A card name (or the visitor's search when `freeText`). Omit for "shop all singles". */
  query?: string;
  /** What the heading calls it, when the search keywords differ (a card's display name). */
  name?: string;
  heading?: string;
  sub?: string;
  compact?: boolean;
  className?: string;
  preRelease?: boolean;
  freeText?: boolean;
  /** EPN customid segment: which placement earned the click. */
  source?: string;
  /** data-page for the click beacon. */
  page?: string;
  /** data-card: a card slug, when the CTA is for one card. */
  card?: string;
}) {
  const { country } = useCountry();
  const label = ebayLabel(country);
  const href = ebaySearchUrl(country, query ? onePieceEbayQuery(query) : "One Piece Card Game singles", source ?? (query ? "card-cta" : "shop-all"));
  const short = query ? truncate(name ?? query, 40) : "";
  const title =
    heading ??
    (!query
      ? "Shop One Piece singles on eBay"
      : preRelease || freeText
        ? `Search ${label} for ${freeText ? `“${short}”` : short}`
        : `Buy ${short} on eBay`);
  const line =
    sub ??
    (!query
      ? `One Piece Card Game singles from eBay sellers on ${label}.`
      : preRelease
        ? "This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing."
        : freeText
          ? `Listings from eBay sellers on ${label}.`
          : `Search new, used & graded listings on ${label}.`);
  return (
    <div className={className}>
      <a
        href={href}
        target="_blank"
        rel={outboundRel()}
        data-retailer="ebay_search"
        data-page={page}
        data-card={card}
        data-surface="ebay_cta"
        className={`group relative flex flex-wrap items-center gap-3 overflow-hidden rounded-lg border border-[#0064d2]/40 bg-gradient-to-r from-[#0064d2]/15 via-ink-900 to-ink-900 transition-colors hover:border-[#0064d2]/70 hover:from-[#0064d2]/25 ${compact ? "p-3" : "p-4 sm:p-5"}`}
      >
        <span className="min-w-0 flex-1 basis-56">
          <span className="flex items-center gap-2">
            <EbayWordmark className={compact ? "text-base" : "text-lg"} />
            <span className={`font-extrabold text-white ${compact ? "text-sm" : "text-base sm:text-lg"}`}>{title}</span>
          </span>
          <span className={`mt-0.5 block text-slate-400 ${compact ? "text-[11px]" : "text-xs sm:text-sm"}`}>{line}</span>
        </span>
        <span className={`shrink-0 rounded-md bg-[#0064d2] font-bold text-[#ffffff] transition-colors group-hover:bg-[#0079e6] ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}>
          {preRelease || freeText ? "Search eBay →" : "Shop on eBay →"}
        </span>
      </a>
      <p className="mt-1.5 text-[11px] text-slate-500">As an eBay Partner Network affiliate, OP Compare earns from qualifying purchases.</p>
    </div>
  );
}
