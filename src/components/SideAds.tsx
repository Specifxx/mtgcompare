"use client";

import { useEffect, useState } from "react";
import { ebayRetailerForHref, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { useListings } from "./EbayStrip";
import { useSoftRegion } from "./RegionSuggest";
import { EbayMark } from "./EbayMark";
import { OutboundLink } from "./OutboundLink";
import { AdDock, DockGate, DockTile, DOCK_LINK, type DockSide } from "./AdDock";

// The phone dock's host (the side rails that shared this file were removed 2026-11-13, owner: the ads are one horizontal block inside
// the page, components/InlineAds.tsx). Browser only, narrow screens only (below MIN_WIDTH); nothing is in the server HTML. The eBay
// listings (the sealed, Play Booster Box and Collector Booster Box feeds) and the newest sets' TCGplayer products are the dock's tiles.
export const MIN_WIDTH = 1280;
/** Up to ten dock tiles per side, popular first. */
export const MAX_TILES = 10;

export function SideAds({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const update = () => setNarrow(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Wide screens have the in-page block (InlineAds.tsx); narrow ones get the dock after a scroll.
  return narrow ? <PhoneDock region={region} tiles={tiles} /> : null;
}

/**
 * The same dock on the pages with no region of their own (the home page, the blog, About…; owner 2026-11-06: "the home page must
 * have this as well"), in the visitor's suggested or picked region (RegionSuggest.tsx), like their header and sidebar.
 */
export function SoftSideAds({ tiles }: { tiles: TcgplayerTile[] }) {
  return <SideAds region={useSoftRegion()} tiles={tiles} />;
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

/** The phone dock: the in-page block's tiles, eBay's on the left and TCGplayer's on the right (AdDock.tsx has the rules). */
function PhoneDock({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  return (
    <DockGate minWidth={MIN_WIDTH}>
      <DockAds region={region} tiles={tiles} />
    </DockGate>
  );
}

function DockAds({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const placement: Placement = "listings-dock";
  const tcgPlacement: Placement = "tcgplayer-strip-dock";
  // The block's three feeds, the same requests (CDN-cached, shared with the strips).
  const { state } = useListings({ region, context: "sealed", placement, min: 1, eager: true });
  const boxes = useListings({ region, context: "type:play-booster-boxes", placement, min: 1, eager: true }).state;
  const collectors = useListings({ region, context: "type:collector-booster-boxes", placement, min: 1, eager: true }).state;
  const items = state.status === "ready" ? mergeListings([state, boxes, collectors]) : [];
  const us = region === "us";
  const price = (cents: number) => (us ? money(cents, "US") : `US${money(cents, "US")}`);
  const tcgBrand = (
    <span className="font-black tracking-tight text-ink" aria-label="TCGplayer">
      TCG<span className="text-[#1f6fe5]">player</span>
    </span>
  );
  const sides: DockSide[] = [];
  if (items.length > 0)
    sides.push({
      key: "ebay",
      items: items.map((i) => (
        <OutboundLink key={i.id} href={i.href} rel={REL_SPONSORED} retailer={ebayRetailerForHref(i.href, region)} placement={placement} className={DOCK_LINK} title={`${i.title} · ${formatPrice(i.price)}`}>
          <DockTile img={i.imageUrl} alt={i.title} brand={<EbayMark className="text-[11px]" />} title={i.title} price={formatPrice(i.price)} cta="View" />
          <span className="sr-only">, on eBay</span>
        </OutboundLink>
      )),
    });
  if (tiles.length >= 2)
    sides.push({
      key: "tcgplayer",
      items: tiles.slice(0, MAX_TILES).map((t) => (
        <OutboundLink key={t.slug} href={tcgplayerAffiliateUrl(t.url, region, tcgPlacement)} rel={REL_SPONSORED} retailer={TCGPLAYER_RETAILER} placement={tcgPlacement} className={DOCK_LINK} title={`${t.name} · ${price(t.priceCents)}`}>
          <DockTile img={thumb(t.imageUrl, 100) ?? t.imageUrl} alt={t.name} brand={tcgBrand} title={t.name} price={price(t.priceCents)} cta="View" plate />
          <span className="sr-only">, on TCGplayer</span>
        </OutboundLink>
      )),
    });
  if (sides.length === 0) return null;
  return <AdDock label="Sponsored: sealed Magic on eBay and TCGplayer" sides={sides} placement={placement} minWidth={MIN_WIDTH} />;
}
