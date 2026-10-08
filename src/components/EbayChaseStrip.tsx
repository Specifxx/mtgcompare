"use client";

import { useEffect, useState } from "react";
import { ebayAffiliateUrl, ebayLabel, ebaySearchUrl, magicEbayQuery, outboundRel } from "@/lib/affiliate";
import { currencyOf } from "@/lib/country";
import { isLikelyBot } from "@/lib/data/plane/crawler";
import { ageLabel, chaseQuery, ebayImg, ebaySrcSet, formatMoney, itemUrl, liveOfTile, pickVisible, type ChaseArt, type ChaseLive } from "@/lib/listing-panel";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { EbayWordmark } from "./AffiliateAds";
import { useCountry } from "./CountryProvider";

/** The payload route (a public, cached /api read of the single EbayBanner row). The strip works without it: art tiles with an affiliate search link. */
export const CHASE_ENDPOINT = "/api/ebay/chase";
const LIVE_HEADING_MIN = 3;

interface Wire { v: 1; tiles: { id: number; name: string; image: string | null; cents: number; ship: boolean | null; market: ChaseLive["market"]; itemId: string; checkedAt: string; finish?: "N" | "F"; sc?: string; label?: string; usd?: number }[] }

/**
 * "Chase cards on eBay right now" (the owner's screenshot of RiftCompare's strip): six tiles of real chase cards. A tile shows a LIVE eBay listing in the visitor's market (eBay's own photo, the
 * price in the market's currency, "Free shipping" when the seller states it, and how old the listing is) when the script-side eBay pass has a fresh one, and otherwise the card's art with an
 * affiliate eBay SEARCH link, so the strip is useful before the eBay keys exist and when the database is down. The pool (`art`) is public data from the server render; the listings are fetched
 * in the browser after mount, never by a public page's server render and never for a crawler. Never calls eBay; labelled "Ad"; hidden for ad-free members (data-ad-placement); the disclosure
 * sits right under it. The market comes from useCountry() only, so a region home that locks the market quotes that market for every visitor.
 */
export function EbayChaseStrip({ art, heading = "Chase cards on eBay right now", page, limit = 6, className = "", onlySet }: { art: ChaseArt[]; heading?: string; page: string; limit?: number; className?: string; onlySet?: string }) {
  const { country } = useCountry();
  const [live, setLive] = useState<ChaseLive[]>([]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (isLikelyBot(typeof navigator === "undefined" ? "" : navigator.userAgent)) return;
    const ctl = new AbortController();
    fetch(CHASE_ENDPOINT, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Wire>) : null))
      .then((w) => {
        if (!w || w.v !== 1 || !Array.isArray(w.tiles)) return;
        setLive(w.tiles.map((t) => liveOfTile(t, currencyOf(t.market))).filter((t): t is ChaseLive => t != null));
        setNow(Date.now());
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  const tiles = pickVisible(art, onlySet ? live.filter((l) => (l.setCode ?? "").toLowerCase() === onlySet.toLowerCase()) : live, country, now, limit);
  if (!tiles.length) return null;
  const nLive = tiles.filter((t) => t.kind === "live").length;
  const label = nLive >= LIVE_HEADING_MIN ? "Ad · live listings on eBay" : `Ad · ${ebayLabel(country)}`;
  const title = nLive >= LIVE_HEADING_MIN ? heading : "Chase cards on eBay";
  return (
    <section data-ad-placement="chase-strip" data-page={page} className={className} aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <EbayWordmark className="text-sm" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <ul className="-mx-1 flex min-h-[15.5rem] snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
        {tiles.map((t) => {
          const isLive = t.kind === "live";
          const c = isLive ? t.live : t.art;
          const href = isLive ? ebayAffiliateUrl(itemUrl(country, t.live.itemId), `chase-${page}`) : ebaySearchUrl(country, magicEbayQuery(chaseQuery(c)), `chase-${page}`);
          const name = isLive ? t.live.name : t.art.name;
          const set = (isLive ? t.live.setCode : t.art.setCode) ?? "";
          const cardLabel = isLive ? t.live.label : t.art.label;
          return (
            <li key={`${isLive ? "l" : "a"}${c.id}`} className="w-[38vw] max-w-[150px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <a
                href={href}
                target="_blank"
                rel={outboundRel()}
                data-retailer={isLive ? "ebay_chase" : "ebay_chase_search"}
                data-page={page}
                data-card={isLive ? String(c.id) : t.art.slug}
                data-surface="ebay_chase"
                className="flex h-full flex-col rounded-lg border border-ink-700 bg-ink-900 p-2 transition-colors hover:border-[#0064d2]/60 hover:bg-ink-800"
              >
                <div className="aspect-[5/7] w-full overflow-hidden rounded bg-ink-950">
                  {isLive ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ebayImg(t.live.imageUrl, 300)} srcSet={ebaySrcSet(t.live.imageUrl)} sizes="(min-width:1024px) 160px, 38vw" width={225} height={315} alt={`${name}: live eBay listing`} loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-cover" />
                  ) : t.art.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.art.imageUrl} width={225} height={315} alt={name} loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-contain" />
                  ) : null}
                </div>
                <div className="mt-1.5 line-clamp-1 text-[11px] font-semibold leading-tight text-slate-200">{name}</div>
                <div className="line-clamp-1 h-3 text-[10px] leading-tight text-slate-500">{[set.toUpperCase(), cardLabel].filter(Boolean).join(" · ")}</div>
                {isLive ? (
                  <div className="num mt-auto pt-1 text-sm font-extrabold text-white">{formatMoney(t.live.priceCents, t.live.currency)}</div>
                ) : (
                  <div className="mt-auto pt-1 text-xs font-bold text-sky-300">Find on eBay →</div>
                )}
                <div className="h-4 text-[10px] text-emerald-400">{isLive && t.live.freeShipping ? "Free shipping" : ""}</div>
                <div className="h-3 text-[9px] text-slate-500">{isLive && now != null ? <time dateTime={t.live.checkedAt}>{ageLabel(t.live.checkedAt, now)}</time> : ""}</div>
              </a>
            </li>
          );
        })}
      </ul>
      <AffiliateDisclosure partner="ebay" tight />
    </section>
  );
}
