"use client";

import { AFFILIATE_NOTE_SHORT, ebayLabel, ebayRetailer, ebayRetailerForHref, ebaySearchUrl, REL_SPONSORED, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import type { ReactNode } from "react";
import { useListings } from "../EbayStrip";
import { EbayMark } from "../EbayMark";
import { OutboundLink } from "../OutboundLink";
import { useSuggestedRegion } from "../RegionSuggest";

// The landing page's eBay + TCGplayer banner (owner, 2026-11-03: "a side by side ebay and tcgplayer ad listing banner below the hero"),
// where the featured-creators strip was. Two panels, side by side from md and stacked on a phone: real sealed listings on eBay (the
// sealed feed of the visitor's region, fetched in the browser once the banner is near the viewport, exactly as EbayStrip does: the page
// never fetches while it renders) and real sealed products on TCGplayer (lib/data.ts tcgplayerTiles, in the server HTML). Each tile is
// one sponsored link with a photo, the price and the name, every height fixed (CLS 0): an eBay row still loading shows blank tiles of the
// same size, and one with nothing to list is a search button in the same row. Labelled "Ad", the affiliate note inside.
//
// The region follows the visitor (RegionSuggest.tsx useSuggestedRegion: the US until known, then the region they browse), so the
// eBay panel is their own eBay site and every TCGplayer link carries their region's sub-id (TCGplayer stays the US marketplace: outside
// the US the price is US$ and the panel says so). No page element moves when it changes: the panels keep their heights.

const EBAY_PLACEMENT: Placement = "listings-landing";
const TCG_PLACEMENT: Placement = "tcgplayer-strip-landing";
/** How many tiles the server HTML holds and a row shows at most: enough for a wide screen, the rest scrolls. */
const TILES = 8;
/** One tile: 104 px wide, the photo 88 px, the price line 18 px, the name 32 px (two lines). `relative`, so its sr-only span (position absolute) is clipped by the tile and not laid out at its static position in the page, which widened a phone to 814px. */
const TILE = "relative flex w-[104px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink/40";
const ROW = "flex h-[146px] min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]";

function Panel({ brand, title, sub, all, children }: { brand: ReactNode; title: string; sub: string; all: ReactNode; children: ReactNode }) {
  return (
    // min-w-0 here and minmax(0,1fr) on the grid: an auto grid track and a grid item both size to the scroll row's content, so without them the row widened the page to 800px on a 390px phone instead of scrolling (measured 2026-11-03).
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        {brand}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold leading-tight">{title}</span>
          <span className="block truncate text-[11px] text-muted">{sub}</span>
        </span>
        {all}
      </div>
      <ul role="list" className={ROW}>
        {children}
      </ul>
    </div>
  );
}

function Tile({ href, retailer, placement, image, price, name, color, site, plate = false }: { href: string; retailer: string; placement: Placement; image: string; price: string; name: string; color: string; site: string; plate?: boolean }) {
  return (
    <li>
      <OutboundLink href={href} rel={REL_SPONSORED} retailer={retailer} placement={placement} className={TILE} title={`${name} · ${price}`}>
        <span className={`relative block h-[88px] w-full overflow-hidden ${plate ? "plate" : "bg-raised"}`}>
          <img src={image} alt={name} width={104} height={88} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full object-contain p-1 ${plate ? "mix-blend-multiply" : ""}`} />
        </span>
        <span className="tabular block truncate px-1 text-center text-[11px] font-black leading-[18px] text-white" style={{ background: color }}>
          {price}
        </span>
        <span className="block h-8 overflow-hidden px-1.5 pt-0.5 text-[10px] leading-[14px] text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{name}</span>
        <span className="sr-only">on {site}</span>
      </OutboundLink>
    </li>
  );
}

// Calm palette (2026-11-12): the tiles' price tags are the site's ink, not a brand blue; only the TCGplayer wordmark keeps its colour.
const TAG = "#15171c";
const TCG_BLUE = "#1f6fe5";

export function LandingAds({ tcg, className = "" }: { tcg: TcgplayerTile[]; className?: string }) {
  const suggested = useSuggestedRegion();
  const region: Region = suggested.region ?? "us";
  const { ref, state } = useListings({ region, context: "sealed", placement: EBAY_PLACEMENT, min: 1 });
  const items = state.status === "ready" ? state.a.items.slice(0, TILES) : null;
  const searchAll = ebaySearchUrl("", region, EBAY_PLACEMENT);
  const usd = (cents: number) => (region === "us" ? money(cents, "US") : `US${money(cents, "US")}`);
  const tiles = tcg.slice(0, TILES);
  return (
    <div ref={ref} data-ad={EBAY_PLACEMENT} role="group" aria-label="Sponsored: eBay and TCGplayer" className={`ad-box grid grid-cols-[minmax(0,1fr)] gap-3 p-3 md:grid-cols-2 md:gap-4 md:p-4 ${className}`}>
      <Panel
        brand={<EbayMark className="text-lg" />}
        title="Sealed Magic on eBay"
        sub={`Live listings on eBay ${ebayLabel(region)}`}
        all={
          <OutboundLink href={searchAll} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement={EBAY_PLACEMENT} className="btn-ad shrink-0 px-2.5 py-1 text-[11px]">
            All on eBay →
          </OutboundLink>
        }
      >
        {items && items.length ? (
          items.map((i) => <Tile key={i.id} href={i.href} retailer={ebayRetailerForHref(i.href, region)} placement={EBAY_PLACEMENT} image={i.imageUrl} price={formatPrice(i.price)} name={i.title} color={TAG} site="eBay" />)
        ) : state.status === "idle" ? (
          Array.from({ length: TILES }, (_, n) => <li key={n} aria-hidden="true" className="h-[140px] w-[104px] shrink-0 rounded-lg bg-raised" />)
        ) : (
          <li className="flex items-center">
            <OutboundLink href={searchAll} rel={REL_SPONSORED} retailer={ebayRetailer(region)} placement={EBAY_PLACEMENT} className="btn-ad px-4 py-2 text-xs">
              Search sealed Magic on eBay {ebayLabel(region)} <span aria-hidden="true">↗</span>
            </OutboundLink>
          </li>
        )}
      </Panel>
      {tiles.length >= 3 && (
        <Panel
          brand={
            <span className="shrink-0 text-base font-black tracking-tight" aria-label="TCGplayer">
              TCG<span style={{ color: TCG_BLUE }}>player</span>
            </span>
          }
          title="Sealed Magic on TCGplayer"
          sub={region === "us" ? "In stock on TCGplayer today" : "The US marketplace · prices in US$"}
          all={
            <OutboundLink href={tcgplayerSearchUrl("", region, TCG_PLACEMENT)} rel={REL_SPONSORED} retailer="TCGplayer" placement={TCG_PLACEMENT} className="btn-ad shrink-0 px-2.5 py-1 text-[11px]">
              All on TCGplayer →
            </OutboundLink>
          }
        >
          {tiles.map((t) => (
            <Tile key={t.slug} href={tcgplayerAffiliateUrl(t.url, region, TCG_PLACEMENT)} retailer="TCGplayer" placement={TCG_PLACEMENT} image={thumb(t.imageUrl, 240) ?? t.imageUrl} price={usd(t.priceCents)} name={t.name} color={TAG} site="TCGplayer" plate />
          ))}
        </Panel>
      )}
      <p className="flex items-center gap-2 text-[10px] leading-tight text-muted md:col-span-2">
        <span className="rounded bg-raised px-1.5 py-0.5 font-semibold uppercase tracking-wide">Ad</span>
        <span>
          {AFFILIATE_NOTE_SHORT}
          {region !== "us" && tiles.length >= 3 ? " TCGplayer prices are in US$." : ""}
        </span>
      </p>
    </div>
  );
}
