"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AFFILIATE_NOTE_SHORT, ebayRetailer, ebayRetailerForHref, ebaySearchUrl, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { useListings } from "./EbayStrip";
import { useSoftRegion } from "./RegionSuggest";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";

// The two side rails (ported from DexCompare 2026-11-06, owner: "I really want those ads to be on MTG Compare"; DexCompare's brief, 2026-11-03: "a lot of space on the very, very left … and the very, very right … the left side could be
// eBay and the right side TCGplayer … only if you can fit it. If you can't fit it, then don't use the ads"): real sealed eBay listings
// stacked down the far left of a wide screen, the newest sets' TCGplayer products down the far right, both OUTSIDE the page shell
// (max-w-shell, 1480px), fixed beside it under the sticky header.
//
//   • Browser only, from 1280px wide (owner 2026-11-06: every regular 16:9 and 16:10 screen). Nothing is in the server HTML: the rails
//     mount after hydration and only while the viewport is at least MIN_WIDTH wide, so crawlers, tablets and phones never see them (no
//     SEO change, CLS 0: a fixed element takes no space; the room beside the shell is CSS, globals.css). The eBay rail asks /api/ebay/<region> for the sealed, Play Booster Box and
//     Collector Booster Box feeds only once it is mounted (CDN-cached, shared with the strips); the TCGplayer tiles are the pre-footer strip's (lib/data.ts tcgplayerTiles), already on the client as its props.
//   • Each rail runs from under the header to the window's foot and scrolls through up to ten tiles, popular first (owner
//     2026-11-06); a window too short for one whole tile shows no rail.
//   • Labelled "Ad" with the affiliate note, every link rel sponsored under its own placement (listings-side, tcgplayer-strip-side).
//     Not a pop-up: nothing moves, covers content or asks for anything.

/**
 * From MIN_WIDTH (1280px: every common 16:9 and 16:10 laptop and monitor, owner 2026-11-06: "it should appear on regular 16:9
 * screens … 16:10 even") a rail RAIL_W wide sits on each side of the shell, GUTTER from the window's edge and GUTTER from the
 * shell. Below 1864px the shell gives up that room (globals.css: max-width min(1480px, 100vw - 320px)); from 1864px it is its full
 * 1480px and the rails sit just outside it.
 */
const SHELL_W = 1480;
export const RAIL_W = 136;
const GUTTER = 12;
export const MIN_WIDTH = 1280; // the RAIL class below and the globals.css shell rule say the same
/** Vertical budget: the sticky header (--hdr, 64px from lg) and a gutter above, a gutter below, the rail's own top line and note. */
const TOP = 64 + GUTTER;
const HEAD = 30;
const NOTE = 34;
const PAD = 2 * 8;
/** One tile: 8px padding, a (RAIL_W - 16 - 16)px square picture, two title lines (36px) and a price line (20px). */
export const TILE_H = 8 + (RAIL_W - PAD - 16) + 6 + 36 + 20 + 8;
/** Up to ten tiles, popular first; the list scrolls inside the rail (owner, 2026-11-06: "scrollable … up to 10 products"). */
export const MAX_TILES = 10;

/** Whether a window this tall holds a rail with at least one whole tile in view (the rest scroll). Pure, for the tests. */
export function railFits(innerHeight: number): boolean {
  return innerHeight - TOP - GUTTER - HEAD - NOTE - PAD >= TILE_H;
}

export function SideAds({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const [fit, setFit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const update = () => setFit(mq.matches && railFits(window.innerHeight));
    update();
    mq.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  if (!fit) return null;
  return (
    <>
      <EbayRail region={region} />
      {tiles.length >= 2 && <TcgRail region={region} tiles={tiles} />}
    </>
  );
}

/**
 * The same rails on the pages with no region of their own (the home page, the blog, About…; owner 2026-11-06: "the home page must
 * have this as well"), in the visitor's suggested or picked region (RegionSuggest.tsx), like their header and sidebar.
 */
export function SoftSideAds({ tiles }: { tiles: TcgplayerTile[] }) {
  return <SideAds region={useSoftRegion()} tiles={tiles} />;
}

const LIST = "rail-scroll grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain";
const RAIL = "fixed z-30 hidden flex-col rounded-xl border border-line bg-surface p-2 shadow-card min-[1280px]:flex";
const TILE = "group flex flex-col rounded-lg border border-line bg-surface p-2 transition-colors hover:border-ink/40";
const EDGE = `max(${GUTTER}px, calc(50% - ${SHELL_W / 2 + GUTTER + RAIL_W}px))`;
const railStyle = (side: "left" | "right"): CSSProperties => ({ top: `calc(var(--hdr) + ${GUTTER}px)`, bottom: GUTTER, width: RAIL_W, ...(side === "left" ? { left: EDGE } : { right: EDGE }) });

function EbayRail({ region }: { region: Region }) {
  const placement: Placement = "listings-side";
  // Ten popular sealed listings: the sealed feed (the home strip's own request, so it is shared, not repeated), topped up from the
  // Play Booster Box and Collector Booster Box feeds (each at most eight rows, lib/ebay-context.ts), no listing twice.
  const { ref, state } = useListings({ region, context: "sealed", placement, min: 1, eager: true });
  const boxes = useListings({ region, context: "type:play-booster-boxes", placement, min: 1, eager: true }).state;
  const collectors = useListings({ region, context: "type:collector-booster-boxes", placement, min: 1, eager: true }).state;
  const items = state.status === "ready" ? mergeListings([state, boxes, collectors]) : null;
  if (state.status === "none") return null;
  return (
    <div ref={ref} role="group" data-ad={placement} aria-label="Sponsored: sealed Magic on eBay" className={RAIL} style={railStyle("left")}>
      <Head brand={<EbayMark className="text-lg" />} />
      <ul role="list" className={LIST}>
        {items
          ? items.map((i) => (
              <li key={i.id}>
                <OutboundLink href={i.href} rel={REL_SPONSORED} retailer={ebayRetailerForHref(i.href, region)} placement={placement} className={TILE} title={`${i.title} · ${formatPrice(i.price)}`}>
                  <span className="relative block aspect-square w-full overflow-hidden rounded-md bg-raised">
                    <img src={i.imageUrl} alt={i.title} width={128} height={128} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" />
                  </span>
                  <span className="mt-1.5 line-clamp-2 h-9 text-xs font-semibold leading-[18px] group-hover:text-brand">{i.title}</span>
                  <span className="tabular block h-5 truncate text-[15px] font-bold leading-5">{formatPrice(i.price)}</span>
                  <span className="sr-only">, on eBay</span>
                </OutboundLink>
              </li>
            ))
          : Array.from({ length: 3 }, (_, n) => <li key={n} aria-hidden="true" className="rounded-lg bg-raised" style={{ height: TILE_H }} />)}
      </ul>
      <Note href={ebaySearchUrl("", region, placement)} retailer={ebayRetailer(region)} placement={placement} label="All on eBay →" />
    </div>
  );
}

type ListingsState = ReturnType<typeof useListings>["state"];
type Listing = Extract<ListingsState, { status: "ready" }>["a"]["items"][number];

/** The ready feeds' listings in order, no listing twice, at most MAX_TILES. Pure, for the tests. */
export function mergeListings(states: ListingsState[]): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const st of states) {
    if (st.status !== "ready") continue;
    for (const i of st.a.items) {
      if (out.length >= MAX_TILES) return out;
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      out.push(i);
    }
  }
  return out;
}

function TcgRail({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const placement: Placement = "tcgplayer-strip-side";
  const us = region === "us";
  const price = (cents: number) => (us ? money(cents, "US") : `US${money(cents, "US")}`);
  return (
    <div role="group" data-ad={placement} aria-label="Sponsored: Magic sealed on TCGplayer" className={RAIL} style={railStyle("right")}>
      <Head
        brand={
          <span className="text-[15px] font-black tracking-tight" aria-label="TCGplayer">
            TCG<span className="text-[#1f6fe5]">player</span>
          </span>
        }
      />
      <ul role="list" className={LIST}>
        {tiles.slice(0).map((t) => (
          <li key={t.slug}>
            <OutboundLink href={tcgplayerAffiliateUrl(t.url, region, placement)} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement={placement} className={TILE} title={`${t.name} · ${price(t.priceCents)}`}>
              <span className="plate relative block aspect-square w-full overflow-hidden rounded-md">
                <img src={thumb(t.imageUrl, 200) ?? t.imageUrl} alt={t.name} width={128} height={128} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain p-1 mix-blend-multiply" />
              </span>
              <span className="mt-1.5 line-clamp-2 h-9 text-xs font-semibold leading-[18px] group-hover:text-[#1f6fe5]">{t.name}</span>
              <span className="tabular block h-5 truncate text-[15px] font-bold leading-5">{price(t.priceCents)}</span>
              <span className="sr-only">, on TCGplayer</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <Note href={tcgplayerSearchUrl("", region, placement)} retailer={TCGPLAYER_RETAILER} placement={placement} label="All on TCGplayer →" usd={!us} />
    </div>
  );
}

function Head({ brand }: { brand: ReactNode }) {
  return (
    <div className="mb-2 flex h-[22px] shrink-0 items-center justify-between px-1">
      {brand}
      <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Ad</span>
    </div>
  );
}

function Note({ href, retailer, placement, label, usd = false }: { href: string; retailer: string; placement: Placement; label: string; usd?: boolean }) {
  return (
    <p className="mt-2 flex h-[26px] shrink-0 flex-col justify-center px-1 text-[10px] leading-[13px] text-muted">
      <OutboundLink href={href} rel={REL_SPONSORED} retailer={retailer} placement={placement} className="truncate font-bold text-brand">
        {label}
      </OutboundLink>
      <span className="truncate" title={AFFILIATE_NOTE_SHORT}>
        {usd ? "Affiliate links · in US$" : "Affiliate links · we may earn"}
      </span>
    </p>
  );
}
