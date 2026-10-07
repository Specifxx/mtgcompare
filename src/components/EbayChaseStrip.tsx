"use client";

import { cardEbayQuery, ebayAffiliateUrl, ebayLabel, ebaySearchUrl, outboundRel } from "@/lib/affiliate";
import type { ChaseTile } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayWordmark } from "./AffiliateAds";
import { useCountry } from "./CountryProvider";

const symbolFor = (cur: string) => ({ USD: "US$", AUD: "A$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" } as Record<string, string>)[cur] ?? `${cur} `;
const fmt = (cents: number, cur: string) => `${symbolFor(cur)}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The eBay chase-card banner: the dearest chase printings (SP, Manga, Parallel,
 * Treasure, Secret) as a strip of tiles. A tile shows the live eBay listing in
 * the visitor's market (price, image from eBay) when the script-side eBay pass
 * has a fresh one, and otherwise the card's art with an affiliate eBay SEARCH
 * link, so the strip is useful before the eBay keys exist. Client-side market
 * pick keeps the host pages static. Never calls eBay; labelled "Ad"; hidden for
 * ad-free members (data-ad-placement); the disclosure sits right under it.
 */
export function EbayChaseStrip({
  tiles,
  heading = "Chase cards on eBay",
  page,
  limit = 6,
  className = "",
}: {
  tiles: ChaseTile[];
  heading?: string;
  page: string;
  limit?: number;
  className?: string;
}) {
  const { country } = useCountry();
  if (!tiles.length) return null;
  // Live listings in this market first, then the dearest cards.
  const ordered = [...tiles].sort((a, b) => Number(!!b.listings[country]) - Number(!!a.listings[country]) || b.marketUsd - a.marketUsd).slice(0, limit);
  return (
    <section data-ad-placement="chase-strip" className={className} aria-label={heading}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <EbayWordmark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad · {ebayLabel(country)}</span>
        <span className="text-sm font-bold text-white">{heading}</span>
      </div>
      <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
        {ordered.map((t) => {
          const live = t.listings[country];
          const href = live ? ebayAffiliateUrl(live.url, "chase") : ebaySearchUrl(country, cardEbayQuery(t), "chase");
          return (
            <li key={t.id} className="w-[38vw] max-w-[150px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <a
                href={href}
                target="_blank"
                rel={outboundRel()}
                data-retailer={live ? "ebay_chase" : "ebay_chase_search"}
                data-page={page}
                data-card={t.slug}
                data-surface="ebay_chase"
                className="flex h-full flex-col rounded-lg border border-ink-700 bg-ink-900 p-2 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800"
              >
                <div className="aspect-[3/4] w-full overflow-hidden rounded bg-ink-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={live ? live.imageUrl : t.imageUrl} alt={live ? `${t.name}: live eBay listing` : t.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </div>
                <div className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight text-slate-200">
                  {t.name}
                  {t.variant ? <span className="font-normal text-slate-400"> · {t.variant}</span> : null}
                </div>
                {live ? (
                  <div className="num mt-auto pt-1 text-sm font-extrabold text-white">{fmt(live.priceCents, live.currency)}</div>
                ) : (
                  <div className="mt-auto pt-1 text-xs font-bold text-sky-300">Find on eBay →</div>
                )}
                {live && live.shippingCents === 0 ? <div className="text-[10px] text-brand-400">Free postage</div> : null}
              </a>
            </li>
          );
        })}
      </ul>
      <AffiliateDisclosure partner="ebay" tight />
    </section>
  );
}
