"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AFFILIATE_NOTE_SHORT, ebayLabel, ebayRetailerForHref, ebaySearchUrl, ebayRetailer, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { useListings } from "./EbayStrip";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";
import { interleave } from "./AdDock";

// The in-page ad banners (owner, 2026-11-14: "separate, big ad banners for TCGplayer and eBay … at the top of a page, directly under the
// hero", replacing the one small mixed row of tiles of 2026-11-13). TWO banners side by side from md (stacked on a phone), each its own
// card: the retailer's wordmark, a headline, a big button, and a row of real products with photo, price and name that scrolls sideways.
//
//   • Where: at the top, once. A region home places it directly under the hero; a product page and a set page directly under their own
//     header; every other region page gets it from the layout, at the top of <main>. Never in the quick view, never a pop-up, never a rail.
//   • No layout shift: both banners are in the server HTML at their final height (every row height is set). TCGplayer's products come
//     from the server; eBay's are fetched in the browser once the banner nears the viewport (useListings: CDN-cached, shared with the
//     page's other eBay reads) and fill the same row. With nothing to list a banner keeps its height and shows its big search button.
//   • Paid links, labelled "Ad", rel sponsored, under their own placements (listings-inline, tcgplayer-strip-inline). eBay and
//     TCGplayer only. Never a store row, a best price, a deal, an alert, or counted as a store.
//   • The phone dock (AdDock.tsx) yields to it ([data-ad]).

export const INLINE_MAX = 6;
/** One banner's height on a desktop (the phone's is shorter, see BANNER): header, one row of tiles. */
export const INLINE_H = 300;

const EBAY: Placement = "listings-inline";
const TCG: Placement = "tcgplayer-strip-inline";

// Pages with their own spot for the banners (the region home, a product page, a set page): the layout's copy skips them.
// The sealed list (search and filter results) too (Fiverr review F4, 2026-11-17: two big banners pushed the results below the fold and
// ignored the search): its results lead, and its own listing strip / query box (BrowseGrid) follow them.
const OWN = [/^\/[a-z]{2}\/?$/, /^\/[a-z]{2}\/p\//, /^\/[a-z]{2}\/sets\/[^/]+\/?$/, /^\/[a-z]{2}\/sealed\/?$/];
export function layoutInlineAdsAllowed(path: string): boolean {
  return !OWN.some((r) => r.test(path));
}

/** eBay's and TCGplayer's tiles taking turns, eBay first, at most INLINE_MAX; one side short hands its turns to the other. Pure, for the tests. */
export function inlineOrder<E, T>(ebay: E[], tcg: T[], max = INLINE_MAX): Array<E | T> {
  return interleave<E | T>([{ items: ebay }, { items: tcg }]).slice(0, max);
}

/** The banners the region layout draws at the top of every page without a spot of its own. */
export function LayoutInlineAds({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const path = usePathname() || "";
  if (!layoutInlineAdsAllowed(path)) return null;
  return <InlineAds key={`${region}|${path}`} region={region} tiles={tiles} className="mb-2 mt-4 sm:mt-6" />;
}

type Tile = { key: string; href: string; img: string; title: string; price: string };

/** One banner: every height set (phone / desktop), so nothing moves when the tiles arrive. */
const BANNER = "ad-box flex h-[286px] min-w-0 flex-col p-3.5 sm:h-[300px] sm:p-4";
const ROW = "scroller mt-3 h-[184px] gap-2.5 sm:h-[200px] sm:gap-3";

function Banner({
  brand,
  headline,
  sub,
  cta,
  label,
  children,
}: {
  brand: ReactNode;
  headline: string;
  sub: string;
  cta: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section role="group" aria-label={label} className={BANNER}>
      <div className="flex h-11 items-center gap-2.5">
        <span className="ad-pill">Ad</span>
        {brand}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold leading-tight text-ink sm:text-base">{headline}</span>
          <span className="block truncate text-[11px] leading-tight text-muted">{sub}</span>
        </span>
        {cta}
      </div>
      {children}
    </section>
  );
}

function TileLink({ t, kind, region }: { t: Tile; kind: "ebay" | "tcg"; region: Region }) {
  return (
    <li className="w-[104px] sm:w-[120px]">
      <OutboundLink
        href={t.href}
        rel={REL_SPONSORED}
        retailer={kind === "ebay" ? ebayRetailerForHref(t.href, region) : TCGPLAYER_RETAILER}
        placement={kind === "ebay" ? EBAY : TCG}
        title={`${t.title} · ${t.price}`}
        className="group flex h-[184px] flex-col rounded-xl border border-line bg-surface p-1.5 transition-colors hover:border-ink/40 sm:h-[200px]"
      >
        <span className="plate relative block aspect-square w-full shrink-0 overflow-hidden rounded-lg">
          <img src={t.img} alt={t.title} width={108} height={108} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain p-1" />
        </span>
        <span className="mt-1 line-clamp-2 h-8 text-[11px] font-semibold leading-4">{t.title}</span>
        <span className="tabular mt-auto truncate text-sm font-bold">{t.price}</span>
        <span className="sr-only">, on {kind === "ebay" ? "eBay" : "TCGplayer"}</span>
      </OutboundLink>
    </li>
  );
}

/** What fills a banner's row when there is nothing to list (or the eBay read is still loading): placeholders, or one big search button. */
function Empty({ loading, href, retailer, placement, label, btn }: { loading: boolean; href: string; retailer: string; placement: Placement; label: string; btn: string }) {
  if (loading) {
    return (
      <ul role="list" aria-hidden="true" className={ROW}>
        {Array.from({ length: 4 }, (_, n) => (
          <li key={n} className="h-full w-[104px] rounded-xl bg-raised sm:w-[120px]" />
        ))}
      </ul>
    );
  }
  return (
    <div className={`${ROW.replace("scroller ", "")} flex items-center justify-center rounded-xl bg-raised`}>
      <OutboundLink href={href} rel={REL_SPONSORED} retailer={retailer} placement={placement} className={`${btn} px-5 py-2.5 text-sm`}>
        {label} <span aria-hidden="true">↗</span>
      </OutboundLink>
    </div>
  );
}

export function InlineAds({ region, tiles, className = "" }: { region: Region; tiles: TcgplayerTile[]; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { ref, state } = useListings({ region, context: "sealed", placement: EBAY, min: 1 });
  const us = region === "us";
  const usd = (cents: number) => (us ? money(cents, "US") : `US${money(cents, "US")}`);
  const ebay: Tile[] =
    state.status === "ready" ? state.a.items.slice(0, INLINE_MAX).map((i) => ({ key: `e${i.id}`, href: i.href, img: i.imageUrl, title: i.title, price: formatPrice(i.price) })) : [];
  const tcg: Tile[] = tiles.slice(0, INLINE_MAX).map((t) => ({ key: `t${t.slug}`, href: tcgplayerAffiliateUrl(t.url, region, TCG), img: thumb(t.imageUrl, 400) ?? t.imageUrl, title: t.name, price: usd(t.priceCents) }));
  const ebaySearch = ebaySearchUrl("", region, EBAY);
  const tcgSearch = tcgplayerSearchUrl("", region, TCG);
  // Browser only (as the one block always was): the server HTML holds two empty boxes of the banners' exact height, so no crawler
  // sees an ad unit and nothing moves when they draw.
  if (!mounted) {
    return (
      <div ref={ref} data-inline-ad aria-hidden="true" className={className}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-4">
          <div className="h-[286px] sm:h-[300px]" />
          <div className="h-[286px] sm:h-[300px]" />
        </div>
        <div className="h-[15px]" />
      </div>
    );
  }
  return (
    <div ref={ref} data-inline-ad data-ad={EBAY} className={className}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-4">
        <Banner
          label="Sponsored: sealed on TCGplayer"
          brand={
            <span className="shrink-0 text-lg font-black leading-none tracking-tight sm:text-xl" aria-label="TCGplayer">
              TCG<span className="text-[#1f6fe5]">player</span>
            </span>
          }
          headline="Sealed Magic on TCGplayer"
          sub={us ? "In stock on TCGplayer today" : "The US marketplace · prices in US$"}
          cta={
            <OutboundLink href={tcgSearch} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement={TCG} className="btn-tcg shrink-0 px-3 py-1.5 text-xs sm:px-4 sm:text-sm">
              Shop TCGplayer →
            </OutboundLink>
          }
        >
          {tcg.length >= 3 ? (
            <ul role="list" className={ROW}>
              {tcg.map((t) => (
                <TileLink key={t.key} t={t} kind="tcg" region={region} />
              ))}
            </ul>
          ) : (
            <Empty loading={false} href={tcgSearch} retailer={TCGPLAYER_RETAILER} placement={TCG} label="Search sealed Magic on TCGplayer" btn="btn-tcg" />
          )}
        </Banner>
        <Banner
          label="Sponsored: sealed on eBay"
          brand={<EbayMark className="text-xl sm:text-2xl" />}
          headline="Sealed Magic on eBay"
          sub={`Live listings on eBay ${ebayLabel(region)}`}
          cta={
            <OutboundLink href={ebaySearch} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement={EBAY} className="btn-ad shrink-0 px-3 py-1.5 text-xs sm:px-4 sm:text-sm">
              Shop eBay →
            </OutboundLink>
          }
        >
          {ebay.length >= 1 ? (
            <ul role="list" className={ROW}>
              {ebay.map((t) => (
                <TileLink key={t.key} t={t} kind="ebay" region={region} />
              ))}
            </ul>
          ) : (
            <Empty loading={state.status === "idle"} href={ebaySearch} retailer={ebayRetailer(region)} placement={EBAY} label="Search sealed Magic on eBay" btn="btn-ad" />
          )}
        </Banner>
      </div>
      <p className="mt-2 h-[15px] text-[11px] leading-[15px] text-muted">
        Sponsored. {AFFILIATE_NOTE_SHORT}
        {!us && " TCGplayer prices are in US$."}
      </p>
    </div>
  );
}
