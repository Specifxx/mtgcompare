import type { ReactNode } from "react";
import { ebayRetailer, ebaySearchUrl, REL_SPONSORED, type Placement } from "@/lib/affiliate";
import { HOT_SET_QUERY, HOT_SETS, isHotSet } from "@/lib/popular";
import type { Region } from "@/lib/regions";
import { isPreorderSet } from "@/lib/release";
import { SET_BY_CODE, type PokemonSet } from "@/lib/sets";
import { OutboundLink } from "./OutboundLink";

// The small pieces of the eBay units that are not the listing strips (EbayStrip.tsx):
//   • the "Ad" label, used wherever an eBay link sits inside another component;
//   • <NoPreFooter/>: a page too short to hold its own units beside the strip above the footer asks for it to go;
//   • EbaySearchLink: a plain <a> to an EPN-tagged eBay SEARCH (affiliate.ts ebaySearchUrl), through OutboundLink,
//     for the header's "eBay" item and the product page's functional marketplace rows.
//
// What they all do, and never do:
//   • rel is "sponsored nofollow noopener noreferrer"; one buy_click {retailer, placement} per click; no redirect hop;
//   • each is visibly an ad ("Ad" pill, or the affiliate note beside the group it belongs to);
//   • none is part of a ranking, a count, a median, JSON-LD, meta or the sitemap;
//   • no script, no iframe, no overlay, no countdown. Every unit's root carries data-ad="<placement>" for the sweep.

// ─── Popular sets and products: the highlighted eBay button ────────────────────
// The owner's hot sets (lib/popular.ts HOT_SETS, 30th Celebration first) get a prominent eBay search button inside their
// strip's own top line (EbayStrip `highlight`, placements hot-home / hot-set / hot-product): on the region home's sealed strip (the first hot set
// that is out), on a hot set's page, and on a hot product's page (whose marketplace panel also makes eBay its primary
// button, and a "Popular set" chip outside the ad link: the owner's pick, not a claim about eBay's data or a trend).
// A hot set that is not released yet gets nothing until it is out, as in the importer, which refuses pre-sale listings.
// Every OTHER released set's page gets the same kind of button, "Shop <set> sealed on eBay", under its own placement, set-sealed
// (setSealedHighlight): no new unit, only a button inside the strip the page already has.

/** A highlighted eBay search: the button's words, and what it searches for (through ebaySearchUrl, so "sealed" is added). */
export interface EbayHighlight {
  label: string;
  query: string;
  /**
   * The button's own placement (affiliate.ts PLACEMENTS), when it is not a hot one: a released set's "Shop <set> sealed on eBay" is
   * set-sealed. Without it the strip picks its surface's hot placement (EbayStrip.tsx hotPlacement: hot-home / hot-set / hot-product).
   */
  placement?: Placement;
}

type SetName = Pick<PokemonSet, "code" | "name">;

/**
 * What a hot set's button searches eBay for: "Pokemon " and the set's eBay keyword (HOT_SET_QUERY) or its name. ebaySearchUrl
 * then adds "sealed", the type-neutral word every sealed search on the site carries, so 30th Celebration searches
 * "Pokemon 30th sealed": eBay requires every word, and sellers list the set as "30th Celebration", "30th Anniversary" or
 * "30th Anniversary Celebration", which "30th Celebration" would cut to the first.
 */
export function hotSetQuery(set: SetName): string {
  return `Pokemon ${HOT_SET_QUERY[set.code] ?? set.name}`;
}

/** Is this a hot set that is out (its products and its page get the highlight)? */
export function isHotReleased(setCode: string | null | undefined, now: Date = new Date()): boolean {
  return isHotSet(setCode) && !isPreorderSet(setCode, now);
}

/** A hot, released set's button: "Shop 30th Celebration on eBay". Undefined for any other set. */
export function hotSetHighlight(set: SetName | null | undefined, now: Date = new Date()): EbayHighlight | undefined {
  if (!set || !isHotReleased(set.code, now)) return undefined;
  return { label: `Shop ${set.name} on eBay`, query: hotSetQuery(set) };
}

/**
 * A set page's highlighted button (the growth release: every released set's page, not only the hot ones'). A hot set that is out keeps
 * its hot-set button ("Shop 30th Celebration on eBay"); any other released set gets "Shop <set> sealed on eBay", a search for the set's
 * sealed product (what the page compares) under its own placement, set-sealed; a set that is not out yet gets none, as in the importer,
 * which refuses pre-sale listings. A set whose name already says Pokémon is not searched as "Pokemon Pokémon …".
 */
export function setSealedHighlight(set: SetName | null | undefined, now: Date = new Date()): EbayHighlight | undefined {
  if (!set || isPreorderSet(set.code, now)) return undefined;
  if (isHotSet(set.code)) return hotSetHighlight(set, now);
  const query = /pok[eé]mon/i.test(set.name) ? set.name : `Pokemon ${set.name}`;
  return { label: `Shop ${set.name} sealed on eBay`, query, placement: "set-sealed" };
}

/** The most wanted hot set that is out (HOT_SETS order): the one the region home page highlights. */
export function firstHotSet(now: Date = new Date()): PokemonSet | null {
  for (const code of HOT_SETS) {
    const s = SET_BY_CODE.get(code);
    if (s && isHotReleased(code, now)) return s;
  }
  return null;
}

/**
 * A hot product's button names the product (cut to about 40 characters): when its own listings are missing, the strip above shows its
 * TYPE's listings, and "Shop this" would point at those. It searches what the page's other eBay links search.
 */
export function hotProductHighlight(name: string, query: string): EbayHighlight {
  const n = name.trim();
  const short = n.length > 40 ? `${n.slice(0, 39).trimEnd()}…` : n; // the button wraps, so a full name of up to 40 characters fits at 320 px
  return { label: `Shop ${short} on eBay`, query };
}

/** The small "Ad" label. */
export function AdPill({ className = "" }: { className?: string }) {
  return <span className={`ad-pill ${className}`}>Ad</span>;
}

/**
 * Put on a page whose own units leave no room for the strip above the footer
 * (src/lib/ebay-ads.ts). globals.css hides [data-ebay-prefooter] when it is present.
 */
export function NoPreFooter() {
  return <span hidden data-ebay-no-prefooter="" />;
}

/** An eBay search link: the tagged URL, rel, retailer and placement in one place. */
export function EbaySearchLink({
  region,
  query,
  placement,
  className,
  children,
  title,
  "aria-label": ariaLabel,
}: {
  region: Region;
  /** A product, set or type name, or "" for Pokémon sealed in general. */
  query: string;
  placement: Placement;
  className?: string;
  children: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <OutboundLink
      href={ebaySearchUrl(query, region, placement)}
      rel={REL_SPONSORED}
      retailer={ebayRetailer(region)}
      placement={placement}
      className={className}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </OutboundLink>
  );
}

const Arrow = () => <span aria-hidden="true">↗</span>;

/**
 * The header's "eBay" item, with its "Ad" mark: desktop (xl and up) only. A phone's
 * sticky header would put it on screen with the page's own unit, and from lg to xl
 * the nav has no room for it (the region switcher would be pushed off the edge).
 */
export function EbayNavLink({ region }: { region: Region }) {
  return (
    <span data-ad="header" className="hidden shrink-0 xl:inline-flex">
      <EbaySearchLink
        region={region}
        query=""
        placement="header"
        title="Ad: affiliate link to Pokémon sealed searches on eBay. We may earn a commission, at no cost to you."
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:bg-raised hover:text-ink"
      >
        eBay <AdPill /> <Arrow />
      </EbaySearchLink>
    </span>
  );
}
