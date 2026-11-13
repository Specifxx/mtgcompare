"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AFFILIATE_NOTE_SHORT, ebayRetailerForHref, ebaySearchUrl, ebayRetailer, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { useListings } from "./EbayStrip";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";
import { interleave } from "./AdDock";

// The one in-page ad block (owner, 2026-11-13: "a bigger, subtler horizontal ad inside the page, native to the site", in place of the
// side rails). A full-column-width box of up to six large tiles, eBay's and TCGplayer's taking turns (eBay first), each with its own
// logo word, a two-line title and a price; it scrolls sideways when the column is narrower than the row (.scroller).
//
//   • Where: below a page's main content, once. A region home page, a product page and a set page place it themselves, after their
//     own sections (never in the hero, above a first list, beside a buy button or above a price); every other region page gets it
//     from the layout, directly above the footer (the old pre-footer strips are gone). Never in the quick view.
//   • Browser only: the server HTML holds an empty box of the block's height (no SEO change, CLS 0); the tiles are fetched and drawn
//     once it nears the viewport (useListings: CDN-cached, the same request the page's own strips share). With fewer than three tiles
//     the box is removed.
//   • Paid links, labelled "Ad", rel sponsored, under their own placements (listings-inline, tcgplayer-strip-inline). eBay and
//     TCGplayer only. Never a store row, a best price, a deal, an alert, or counted as a store.
//   • Not a pop-up, no overlay; the phone dock (AdDock.tsx) yields to it ([data-ad]).

export const INLINE_MAX = 6;
/** The block's height in every state (server, loading, ready): the header, one row of tiles, the note. */
export const INLINE_H = 340;

const EBAY: Placement = "listings-inline";
const TCG: Placement = "tcgplayer-strip-inline";

// Pages with their own spot for the block (the region home, a product page, a set page): the layout's copy skips them.
const OWN = [/^\/[a-z]{2}\/?$/, /^\/[a-z]{2}\/p\//, /^\/[a-z]{2}\/sets\/[^/]+\/?$/];
export function layoutInlineAdsAllowed(path: string): boolean {
  return !OWN.some((r) => r.test(path));
}

/** eBay's and TCGplayer's tiles taking turns, eBay first, at most INLINE_MAX; one side short hands its turns to the other. Pure, for the tests. */
export function inlineOrder<E, T>(ebay: E[], tcg: T[], max = INLINE_MAX): Array<E | T> {
  return interleave<E | T>([{ items: ebay }, { items: tcg }]).slice(0, max);
}

/** The block the region layout draws above the footer on every page without a spot of its own. */
export function LayoutInlineAds({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const path = usePathname() || "";
  if (!layoutInlineAdsAllowed(path)) return null;
  return <InlineAds key={`${region}|${path}`} region={region} tiles={tiles} className="mt-6" />;
}

type Tile = { kind: "ebay"; key: string; href: string; img: string; title: string; price: string } | { kind: "tcg"; key: string; href: string; img: string; title: string; price: string };

export function InlineAds({ region, tiles, className = "" }: { region: Region; tiles: TcgplayerTile[]; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { ref, state } = useListings({ region, context: "sealed", placement: EBAY, min: 1 });
  const us = region === "us";
  const usd = (cents: number) => (us ? money(cents, "US") : `US${money(cents, "US")}`);
  const ebay: Tile[] =
    state.status === "ready"
      ? state.a.items.slice(0, INLINE_MAX).map((i) => ({ kind: "ebay", key: `e${i.id}`, href: i.href, img: i.imageUrl, title: i.title, price: formatPrice(i.price) }))
      : [];
  const tcg: Tile[] = tiles.slice(0, INLINE_MAX).map((t) => ({ kind: "tcg", key: `t${t.slug}`, href: tcgplayerAffiliateUrl(t.url, region, TCG), img: thumb(t.imageUrl, 400) ?? t.imageUrl, title: t.name, price: usd(t.priceCents) }));
  const shown = inlineOrder(ebay, tcg);
  const settled = state.status !== "idle";
  // Settled with too little to show: no block at all.
  if (mounted && settled && shown.length < 3) return <div ref={ref} hidden />;
  const ready = mounted && settled;
  return (
    <div ref={ref} className={className} style={{ minHeight: INLINE_H }}>
      {ready && (
        <section data-ad={EBAY} role="group" aria-label="Sponsored: sealed on eBay and TCGplayer" className="ad-box p-4" style={{ minHeight: INLINE_H }}>
          <div className="flex items-center gap-2">
            <span className="ad-pill">Ad</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">Sealed on eBay and TCGplayer</span>
            <OutboundLink href={ebaySearchUrl("", region, EBAY)} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement={EBAY} className="text-xs font-medium text-muted hover:text-ink hover:underline">
              All on eBay →
            </OutboundLink>
            <OutboundLink href={tcgplayerSearchUrl("", region, TCG)} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement={TCG} className="hidden text-xs font-medium text-muted hover:text-ink hover:underline sm:inline">
              All on TCGplayer →
            </OutboundLink>
          </div>
          <ul role="list" className="scroller mt-3 gap-3">
            {shown.map((t) => (
              <li key={t.key} className="w-[172px]">
                <OutboundLink
                  href={t.href}
                  rel={REL_SPONSORED}
                  retailer={t.kind === "ebay" ? ebayRetailerForHref(t.href, region) : TCGPLAYER_RETAILER}
                  placement={t.kind === "ebay" ? EBAY : TCG}
                  title={`${t.title} · ${t.price}`}
                  className="group flex h-[256px] flex-col rounded-xl border border-line bg-surface p-2 transition-colors hover:border-ink/40"
                >
                  <span className="plate relative block aspect-square w-full shrink-0 overflow-hidden rounded-lg">
                    <img src={t.img} alt={t.title} width={156} height={156} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain p-1" />
                  </span>
                  <span className="mt-1.5 flex h-[18px] items-center">
                    {t.kind === "ebay" ? (
                      <EbayMark className="text-[13px]" />
                    ) : (
                      <span className="text-[13px] font-black leading-none tracking-tight" aria-label="TCGplayer">
                        TCG<span className="text-[#1f6fe5]">player</span>
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 h-9 text-xs font-semibold leading-[18px]">{t.title}</span>
                  <span className="tabular mt-auto flex items-baseline justify-between gap-2 text-sm font-bold">
                    <span className="truncate">{t.price}</span>
                    <span className="shrink-0 text-xs font-medium text-muted group-hover:text-ink">View</span>
                  </span>
                  <span className="sr-only">, on {t.kind === "ebay" ? "eBay" : "TCGplayer"}</span>
                </OutboundLink>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Sponsored. {AFFILIATE_NOTE_SHORT}
            {!us && " TCGplayer prices are in US$."}
          </p>
        </section>
      )}
    </div>
  );
}
