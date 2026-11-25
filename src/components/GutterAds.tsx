"use client";
// The gutter ads (owner, 2026-11-25: "Why are the display ads at the very bottom of the site? … there's so much space on the left and
// the right side of the website"). On a wide desktop the page is one 1200px column with empty space either side; each side now holds
// one slim, labelled column: eBay's live sealed listings on the left (the same CDN-cached read as the banners, useListings) and the
// newest sets' TCGplayer products on the right. This reverses "never a rail" (2026-11-13) on the owner's word; it is not the old rail:
// the page column keeps its full width at every size.
//
//   • Only where it fits: from GUTTER_MIN px wide (1440px laptops up), sized to the empty space (globals.css `.gutter-ads`), never over
//     the page column, the header or the footer: each column sits absolutely inside <main> beside the page and its card is sticky under
//     the header, so it ends where the content ends. Below GUTTER_MIN nothing mounts (phones keep the dock).
//   • Browser only: nothing in the server HTML (no SEO change), absolutely placed, so nothing on the page moves when it mounts (CLS 0).
//   • Labelled "Ad", rel sponsored, under the placements `gutter-ebay` / `gutter-tcg`. eBay and TCGplayer only, never Amazon.
//   • Never for ad-free members or in the app ([data-adfree], .capacitor-native). Static: nothing animates, opens or covers anything.
//   • `sides`: "both" on a heavy-ad site, "right" (TCGplayer only) on a light one. MTG Compare is a light site (the ad-intensity
//     test's control, to 10 Dec): the TCGplayer column only.
import { useEffect, useState } from "react";
import { ebayRetailer, ebayRetailerForHref, ebaySearchUrl, REL_SPONSORED, TCGPLAYER_RETAILER, tcgplayerAffiliateUrl, tcgplayerSearchUrl, type Placement } from "@/lib/affiliate";
import type { TcgplayerTile } from "@/lib/data";
import { formatPrice } from "@/lib/ebay-context";
import { money } from "@/lib/format";
import { thumb } from "@/lib/images";
import type { Region } from "@/lib/regions";
import { useListings } from "./EbayStrip";
import { OutboundLink } from "./OutboundLink";
import { useSoftRegion } from "./RegionSuggest";

/** The narrowest window with room for a column beside the page's 1152px content (about 110px each, 14px clear of it). */
export const GUTTER_MIN = 1440;
/** Up to this many tiles a column. */
export const GUTTER_TILES = 8;
/** The banners show the first six of each side (InlineAds INLINE_MAX); the columns start after them when enough are left. */
const SKIP = 6;
const EBAY: Placement = "gutter-ebay";
const TCG: Placement = "gutter-tcg";

type Tile = { key: string; href: string; img: string; title: string; price: string };

/** The tiles after the banner's own, so a page never shows the same product twice side by side; all of them when too few are left. */
export function pastBanner<T>(tiles: T[]): T[] {
  const rest = tiles.slice(SKIP);
  return (rest.length >= GUTTER_TILES / 2 ? rest : tiles).slice(0, GUTTER_TILES);
}

function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (document.documentElement.matches("[data-adfree], .capacitor-native")) return;
    const mq = window.matchMedia(`(min-width: ${GUTTER_MIN}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export function GutterAds({ region, tiles, sides = "both" }: { region: Region; tiles: TcgplayerTile[]; sides?: "both" | "right" }) {
  const wide = useWide();
  if (!wide) return null;
  return (
    <>
      {sides === "both" && <EbayColumn region={region} />}
      <TcgColumn region={region} tiles={tiles} />
    </>
  );
}

/** The same columns on the pages with no region of their own (the landing page, the blog…), in the visitor's suggested region. */
export function SoftGutterAds({ tiles, sides = "both" }: { tiles: TcgplayerTile[]; sides?: "both" | "right" }) {
  const region = useSoftRegion();
  return <GutterAds key={region} region={region} tiles={tiles} sides={sides} />;
}

function EbayColumn({ region }: { region: Region }) {
  const { ref, state } = useListings({ region, context: "sealed", placement: EBAY, min: 1, eager: true });
  const items: Tile[] =
    state.status === "ready"
      ? pastBanner(state.a.items).map((i) => ({ key: `e${i.id}`, href: i.href, img: i.imageUrl, title: i.title, price: formatPrice(i.price) }))
      : [];
  return (
    <div ref={ref} className="gutter-ads gutter-ads-left">
      {items.length >= 2 && (
        <Column brand="eBay" sub="Live sealed listings" line="Buy It Now" tiles={items} retailer={(t) => ebayRetailerForHref(t.href, region)} placement={EBAY}
          ctaHref={ebaySearchUrl("", region, EBAY)} ctaRetailer={ebayRetailer(region)} />
      )}
    </div>
  );
}

function TcgColumn({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const us = region === "us";
  const items: Tile[] = pastBanner(tiles).map((t) => ({
    key: `t${t.slug}`,
    href: tcgplayerAffiliateUrl(t.url, region, TCG),
    img: thumb(t.imageUrl, 400) ?? t.imageUrl,
    title: t.name,
    price: us ? money(t.priceCents, "US") : `US${money(t.priceCents, "US")}`,
  }));
  if (items.length < 2) return null;
  return (
    <div className="gutter-ads gutter-ads-right">
      <Column brand="TCGplayer" sub={us ? "In stock today" : "Prices in US$"} line="TCGplayer" tiles={items} retailer={() => TCGPLAYER_RETAILER} placement={TCG}
        ctaHref={tcgplayerSearchUrl("", region, TCG)} ctaRetailer={TCGPLAYER_RETAILER} />
    </div>
  );
}

function Column({ brand, sub, line, tiles, retailer, placement, ctaHref, ctaRetailer }: {
  brand: string;
  sub: string;
  line: string;
  tiles: Tile[];
  retailer: (t: Tile) => string;
  placement: Placement;
  ctaHref: string;
  ctaRetailer: string;
}) {
  return (
    <aside data-ad={placement} aria-label={`Sponsored: ${brand}`} className="gutter-card ad-box">
      <p className="flex shrink-0 items-center gap-1.5">
        <span className="ad-pill">Ad</span>
        <span className="truncate font-display text-sm font-bold tracking-tight">{brand}</span>
      </p>
      <p className="mt-0.5 shrink-0 truncate text-[11px] leading-4 text-muted">{sub}</p>
      <ul role="list" className="gutter-list">
        {tiles.map((t) => (
          <li key={t.key}>
            <OutboundLink href={t.href} rel={REL_SPONSORED} retailer={retailer(t)} placement={placement} title={`${t.title} · ${t.price}`} className="group block">
              <span className="plate relative block aspect-square w-full overflow-hidden rounded-lg">
                <img src={t.img} alt={t.title} width={160} height={160} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain p-1" />
              </span>
              <span className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 group-hover:text-brand">{t.title}</span>
              <span className="tabular block truncate text-sm font-bold leading-[18px]">{t.price}</span>
              <span className="block truncate text-[10px] uppercase leading-[14px] tracking-wide text-muted">{line}</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <OutboundLink href={ctaHref} rel={REL_SPONSORED} retailer={ctaRetailer} placement={placement} className={`${brand === "eBay" ? "btn-ad" : "btn-tcg"} mt-2 block w-full shrink-0 px-2 py-1.5 text-center text-xs`}>
        See all <span aria-hidden="true">→</span>
        <span className="sr-only"> on {brand}</span>
      </OutboundLink>
    </aside>
  );
}
