import { ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { EbayWordmark } from "./AffiliateAds";

// The card-contextual eBay banner (RiftCompare's EbayAd, leaderboard size): a
// first-party house banner — eBay retired its hosted creatives — linking to an
// EPN-tagged SEARCH for this card on the visitor's own eBay. Labelled "Ad" and
// marked data-ad-placement, so Plus and Premium members (ad-free) never see it.
// Fixed heights (90px from md, 100px below) so it never shifts the page.
// "Find <card> on eBay" converts far better than a generic banner.
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function EbayCardBanner({
  country,
  query,
  name,
  page,
  card,
  className = "",
}: {
  country: Country;
  /** eBay keywords (cardEbayQuery / magicEbayQuery: the game named exactly once). */
  query: string;
  /** What the banner says it finds: the card's display name. */
  name: string;
  page: string;
  card?: string;
  className?: string;
}) {
  const href = ebaySearchUrl(country, query, `${page}-banner`);
  const label = ebayLabel(country);
  return (
    <div data-ad-placement="card-banner" className={`flex flex-col items-center ${className}`}>
      <a
        href={href}
        target="_blank"
        rel={outboundRel()}
        data-retailer="ebay_banner"
        data-page={page}
        data-card={card}
        data-surface="ebay_banner"
        className="relative flex h-[100px] w-full max-w-[728px] items-center justify-center gap-3 overflow-hidden rounded-lg border border-[#e53238]/30 bg-ink-900 bg-gradient-to-r from-transparent via-[#e53238]/[0.05] to-transparent px-4 transition-colors hover:border-[#e53238]/60 md:h-[90px]"
      >
        <span className="absolute left-1.5 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Ad</span>
        <EbayWordmark className="shrink-0 text-lg" />
        <span className="min-w-0 text-left">
          <span className="block truncate text-[13px] font-semibold text-slate-100">Find {truncate(name, 34)} on eBay</span>
          <span className="block truncate text-[11px] text-slate-400">New, used &amp; graded listings on {label}</span>
        </span>
        <span className="shrink-0 rounded-md bg-[#0064d2]/20 px-2.5 py-1 text-[11px] font-bold text-sky-300">Search eBay →</span>
      </a>
      <p className="mt-1.5 max-w-2xl text-center text-[11px] text-slate-500">
        As an eBay Partner Network affiliate, MTG Compare earns from qualifying purchases.
      </p>
    </div>
  );
}
