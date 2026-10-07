import { ebayAffiliateUrl, outboundRel } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { selectPicks, type PickCard } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayBuyCta } from "./EbayBuyCta";
import { EbayWordmark } from "./AffiliateAds";

const symbolFor = (cur: string) => ({ USD: "US$", AUD: "A$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" } as Record<string, string>)[cur] ?? `${cur} `;
const fmt = (cents: number, cur: string) => `${symbolFor(cur)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One tidy row everywhere: 6 at lg, 3 at sm, scrolling below. */
export const MAX_TILES = 6;

// The tailored eBay unit (RiftCompare's EbayPicksLive): real current listings for
// the chase cards of the newest booster, in the visitor's market, one tile per
// card. A snap-scrolling strip on phones and a grid from sm. Ad-free members
// never see the tiles (data-ad-placement); a market with no fresh cached listing
// gets the plain eBay search CTA, so the buy path is always present.
export function EbayPicksLive({
  cards,
  country,
  fallbackQuery,
  heading = "Chase cards on eBay right now",
  className,
  page = "browse",
}: {
  cards: PickCard[];
  country: Country;
  fallbackQuery: string;
  heading?: string;
  className?: string;
  page?: string;
}) {
  const items = selectPicks(cards, country, MAX_TILES);
  if (!items.length) return <EbayBuyCta query={fallbackQuery} className={className} source="picks-fallback" page={page} />;
  return (
    <section data-ad-placement="" className={className} aria-label={heading}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <EbayWordmark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad · live listings on eBay</span>
        <span className="text-sm font-bold text-white">{heading}</span>
      </div>
      <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
        {items.map((c) => (
          <li key={c.id} className="w-[38vw] max-w-[150px] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <a
              href={ebayAffiliateUrl(c.listing.url, "picks")}
              target="_blank"
              rel={outboundRel()}
              data-retailer="ebay_picks"
              data-page={page}
              data-card={c.slug}
              data-surface="ebay_picks"
              className="flex h-full flex-col rounded-lg border border-ink-700 bg-ink-900 p-2 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800"
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.listing.imageUrl} alt={`${c.name}: live eBay listing`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-slate-200">
                {c.name}
                {c.variant ? <span className="font-normal text-slate-400"> · {c.variant}</span> : null}
              </div>
              <div className="num mt-auto pt-1 text-sm font-extrabold text-white">{fmt(c.listing.priceCents, c.listing.currency)}</div>
              {c.listing.shippingCents === 0 ? <div className="text-[10px] text-brand-400">Free postage</div> : null}
            </a>
          </li>
        ))}
      </ul>
      <AffiliateDisclosure partner="ebay" tight />
    </section>
  );
}
