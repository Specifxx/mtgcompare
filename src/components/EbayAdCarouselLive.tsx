import { ebayAffiliateUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import type { PanelListing } from "@/lib/listing-panel";
import { panelTitle } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayBuyCta } from "./EbayBuyCta";
import { EbayWordmark } from "./AffiliateAds";

// A native-style "eBay Ad" carousel: real current listings (image, title, price,
// free-postage badge) captured from the SAME Browse search the price pass makes
// (zero extra calls; lib/ebay-import.ts). Server component taking the visitor's
// market. Ad-free members never see the carousel (data-ad-placement); they get
// the plain EbayBuyCta search instead, and so does a market with no cached
// listing yet: the eBay buy path is always present. Display only: these rows
// are never ranked into the price board, alerts or baskets.
const symbolFor = (cur: string) => ({ USD: "US$", AUD: "A$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" } as Record<string, string>)[cur] ?? `${cur} `;
const fmt = (cents: number, cur: string) => `${symbolFor(cur)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EbayAdCarouselLive({
  listings,
  country,
  query,
  name,
  page = "card",
  card,
  bare,
  compact,
  preRelease,
  className,
}: {
  listings: PanelListing[];
  country: Country;
  query: string;
  name?: string;
  page?: string;
  card?: string;
  /** The parent renders one disclosure for every tab. Never set without one above. */
  bare?: boolean;
  compact?: boolean;
  preRelease?: boolean;
  className?: string;
}) {
  const items = listings.filter((l) => l.market === country).sort((a, b) => a.rank - b.rank).slice(0, compact ? 4 : 8);
  const cta = <EbayBuyCta query={query} name={name} compact={compact} preRelease={preRelease} source="card-panel" page={page} card={card} className={className} />;
  if (!items.length) return cta;
  return (
    <>
      <div data-ad-placement="" className={className}>
        <div className="mb-2 flex items-center gap-2">
          <EbayWordmark className="text-sm" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad · live listings on eBay</span>
        </div>
        <div className={`flex overflow-x-auto pb-1 ${compact ? "gap-2" : "gap-3"}`}>
          {items.map((l) => (
            <a
              key={l.rank}
              href={ebayAffiliateUrl(l.url, "card-panel")}
              target="_blank"
              rel={outboundRel()}
              data-retailer="ebay_carousel"
              data-page={page}
              data-card={card}
              data-surface="ebay_carousel"
              className={`flex shrink-0 flex-col rounded-lg border border-ink-700 bg-ink-900 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800 ${compact ? "w-20 p-1.5" : "w-32 p-2"}`}
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt={`${panelTitle(l.title, 60)}: live eBay listing`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : null}
              </div>
              {compact ? null : <div className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-slate-300">{panelTitle(l.title, 60)}</div>}
              <div className={`num mt-1 font-extrabold text-white ${compact ? "text-xs" : "text-sm"}`}>{fmt(l.priceCents, l.currency)}</div>
              {!compact && l.shippingCents === 0 ? <div className="text-[10px] text-brand-400">Free postage</div> : null}
            </a>
          ))}
        </div>
        {bare ? null : <AffiliateDisclosure partner="ebay" tight />}
      </div>
      {/* Ad-free members: the same eBay route as a plain search, no "Ad" label. */}
      <div className="hidden [:root[data-adfree]_&]:block">{cta}</div>
    </>
  );
}
