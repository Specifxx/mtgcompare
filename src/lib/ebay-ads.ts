// Where the eBay units go and how far apart they stay. Pure: no database, no React, so the browser (BrowseGrid, ProductGrid, the
// pre-footer strip) and the tests use it as it stands.
//
// THE RULES every paid unit follows. README.md ("eBay listing strips"), DEPLOY.md ("Click events", "eBay's rules, and how each is
// met") and the About page ("How DexCompare makes money") say the same; the growth release (2026-10, owner-approved) changed the
// rules marked CHANGED.
//   • A unit is a LISTING STRIP (components/EbayStrip.tsx: real listings imported once a day, image tiles with price, shipping and
//     their age), an IN-FEED TILE (one listing the size of a product card, inside a long product grid: the feed section below), a
//     labelled button box (the sold-out callout's eBay box, a search's query box), or, with nothing to list, ONE compact CTA row.
//     No text-only banner, chip row or "Still deciding?" row exists any more.
//   • Labelled, always: "Ad" (eBay) or "affiliate link" (TCGplayer) next to every unit and link, the affiliate note inside the unit,
//     rel="sponsored nofollow noopener noreferrer" on every paid link, one buy_click {retailer, placement} per click. Store links stay
//     plain (rel="nofollow noopener") and commissions never change the order of the stores.
//   • Density: at most ONE unit in a phone viewport (390x844) and TWO in a desktop one (the header's own "eBay" item, xl and up, is
//     always one of the two); units at least GAP (960 px) apart; where a page is too short for its own units and the pre-footer
//     strip, the pre-footer strip gives way (<NoPreFooter/>). CHANGED: ad height must also stay at or below 25% of the main content's
//     height on every page, at 390 and 1440 wide (a ceiling the viewport sweep checks, never a target).
//   • No pop-up, interstitial, auto-redirect or countdown, and no sticky or overlay unit, with ONE exception (CHANGED): the phone
//     product buy bar (components/StickyBuyBar.tsx, `product-sticky`, below lg only). At most 64 px plus the safe area, it slides in
//     with a transform (CLS 0) only once the best-price card or the sold-out box has scrolled away, hides while the price table, any
//     other unit or the footer is in view (so the one-unit-per-phone-viewport rule still holds literally), can be dismissed for the
//     session, keeps focused elements clear of it (scroll-padding) and only repeats the top of the page's own action, labelled.
//   • eBay data stays out of the server: never in server HTML, JSON-LD, meta, OG or the sitemap, and no statistic derived from it on
//     the server. It reaches the browser only through /api/ebay/<region> (CDN-cached for an hour: lib/ebay-route.ts), never older than
//     the 26-hour bound, with its age shown; eBay's affiliate URL exactly as returned; Buy It Now only, condition shown, eBay's own photo.
//   • A unit never enters a ranked table, a count, a median, JSON-LD, a meta tag or the sitemap, with these exceptions, the owner's
//     calls (eBay API License 8.1(b)(2)): the price table's ONE eBay row (2026-10-11, `listings-offer-row`: the product's cheapest own
//     listing ranked by price among the stores; components/OfferTable.tsx, lib/ebay-offer-row.ts) and, when that listing is new and
//     cheaper than every in-stock store, the best-price card (`listings-best-price`). CHANGED: the same listing, through the same
//     request (useEbayPick), may also price the sold-out callout's eBay box (`listings-soldout-best`) and the Marketplaces panel's eBay
//     row (`listings-marketplace`, only when the best-price card is not already showing eBay), and the buy bar repeats whichever the
//     top of the page shows. The density rule counts strips, tiles, boxes and CTAs; the table's own rows are the comparison, not units.
//   • CHANGED: eBay buttons are filled eBay blue (.btn-ad, #3665f3): the Marketplaces panel's eBay row on every product page, the
//     sold-out box, the table row and the highlight buttons. They never pass for the site's red actions, and every unit around one
//     carries its "Ad" label.
//   • CHANGED: the highlight button ("Shop <set> sealed on eBay", components/Ebay.tsx setSealedHighlight, `set-sealed`) sits in the top
//     line of the strip on every RELEASED set's page, not only the hot sets' (which keep "Shop <set> on eBay", `hot-set`); a set on
//     pre-order has none. It is part of an existing strip, never a unit of its own; the "Popular set" chip stays hot-only.
//   • CHANGED: the region home's sealed strip (with the hot button) comes right after the deals rail and the chase strip after the
//     booster-box rail: still two units, at least a viewport apart, and no pre-footer strip. Every new page (deals, cheapest per pack,
//     this week, each guide) carries exactly ONE strip, plus grid tiles where a grid is long enough, and a search result list carries
//     ONE query-matched box (`browse-search`) in the slot the unfiltered list's strip uses, so it never has more units than that list.
//   • No eBay unit on the About, Terms, Privacy or Contact pages.
// When adding a unit, run the viewport sweep (README.md, "eBay listing strips": [data-ad] units in view at 390x844 and 1440x900, ad
// density, and the layout-shift total).
import type { Placement } from "./affiliate";
import type { Region } from "./regions";

// ─── In-feed listing tiles (product grids) ─────────────────────────────────────
// CHANGED by the growth release (it was ONE tile, after the 12th product of /sealed only). A long product grid on the browse,
// set, type and deals pages carries real eBay listings as labelled tiles the size of a product card (components/EbayStrip.tsx
// EbayFeedTile, placed by components/ProductGrid.tsx `tiles`): one after every FEED_EVERY products, at most FEED_MAX per grid, and
// never within the last FEED_MIN_TAIL products (so a tile never ends a list or sits beside the pre-footer strip).
//   • Spacing: a grid's strip sits on its own row after product 4 (ProductGrid `stripAfter`), so the first tile lands 12 products
//     below it: six phone rows (~1,980 px) or three desktop rows (~1,340 px), over the 960 px GAP. The two tiles are 16 products
//     apart (eight phone rows, four desktop rows).
//   • Wider screens: from md up (three or four cards a row) a tile is a whole row tall beside only two or three products, so it
//     weighs more against the 25% ad-density ceiling. There a tile shows only where at least FEED_WIDE_MIN_TAIL (24) products follow
//     it (`wide`; otherwise it is md:hidden in the server HTML, so nothing shifts and a hidden tile fetches nothing): a 33-product set
//     page measured 25.9% at 1440 with one tile and 17% without, and a 48-product one would reach about 26% with two. So: 24-39
//     products, one tile on a phone and none wider; 40-55, one on a phone and wider (two on a phone from 40); 56 and more, two.
//   • Every tile is a DIFFERENT listing that no other unit on the page shows: the sealed feed's 7th and 8th (tileSource). Strips show
//     a feed's 1st-6th listings and the slim pre-footer strip its 1st-4th. MAX_FEED_ROWS (lib/ebay-context.ts) stays 8, so the
//     importer does not change and a grid never has more than two tiles; with fewer listings, a tile with none is removed while it is
//     out of view (below it), so nothing on screen moves.

/** A tile after every this many real products (16, 32). */
export const FEED_EVERY = 16;
/** At most this many tiles in one grid: the sealed feed's 7th and 8th listings (MAX_FEED_ROWS is 8). */
export const FEED_MAX = 2;
/** A tile needs this many real products after it, so it never ends a list or sits near the pre-footer strip. */
export const FEED_MIN_TAIL = 8;
/** From md up, a tile needs this many real products after it (six desktop rows), so a short grid page stays within the density ceiling. */
export const FEED_WIDE_MIN_TAIL = 24;
/** The 0-based index of the first tile's listing in its feed: strips show indexes 0-5, so the tiles take 6 and 7. */
export const FEED_FIRST_INDEX = 6;

/**
 * Where the in-feed tiles go in a grid of `total` real products: the 1-based count of real products BEFORE each tile (16, 32 …), at
 * most `max` of them, and only where at least `minTail` products follow. Pure and deterministic, so server and client render the same
 * markup.
 */
export function feedSlots(total: number, { every = FEED_EVERY, max = FEED_MAX, minTail = FEED_MIN_TAIL }: { every?: number; max?: number; minTail?: number } = {}): number[] {
  const out: number[] = [];
  if (!Number.isFinite(total) || !(every >= 1)) return out;
  for (let k = every; out.length < max && total - k >= minTail; k += every) out.push(k);
  return out;
}

/** The grids that may carry in-feed listing tiles (ProductGrid `tiles`): the browse page, a set page, a type page, the deals page. */
export type FeedSurface = "browse" | "set" | "type" | "deals";

/** Each surface's tiles report under their own placement (EPN customid on searches, Vercel buy_click on every click). */
export const FEED_PLACEMENTS: Record<FeedSurface, Placement> = {
  browse: "listings-browse-feed",
  set: "listings-set-feed",
  type: "listings-type-feed",
  deals: "listings-deals-feed",
};

/**
 * A grid cell: a real product (with its index in the list) or the `nth` in-feed tile (0-based: 0 after product 16, 1 after 32), which
 * also shows from md up only when `wide` (FEED_WIDE_MIN_TAIL products follow it).
 */
export type GridEntry<T> = { kind: "item"; item: T; index: number } | { kind: "feed"; nth: number; wide: boolean };

/** The grid's items with the in-feed tiles at the feedSlots positions; no tile without a `surface`. */
export function withFeed<T>(items: readonly T[], surface?: FeedSurface): GridEntry<T>[] {
  const slots = surface ? feedSlots(items.length) : [];
  const wide = surface ? feedSlots(items.length, { minTail: FEED_WIDE_MIN_TAIL }) : [];
  const out: GridEntry<T>[] = [];
  items.forEach((item, index) => {
    out.push({ kind: "item", item, index });
    const nth = slots.indexOf(index + 1);
    if (nth >= 0) out.push({ kind: "feed", nth, wide: wide.includes(index + 1) });
  });
  return out;
}

/**
 * Which listing the `nth` tile shows: the sealed feed's 7th (nth 0) and 8th (nth 1), on every surface. No page's strip shows those
 * (strips show the 1st-6th) and neither does the slim pre-footer strip (1st-4th), so a tile never repeats a listing on its page.
 */
export function tileSource(_surface: FeedSurface, nth: number): { context: "sealed"; index: number } {
  return { context: "sealed", index: FEED_FIRST_INDEX + nth };
}

// ─── The pre-footer strip ──────────────────────────────────────────────────────

/**
 * Which feed the slim strip above the footer shows: the one the page's own strip is NOT, so a page never shows the same
 * listings twice. A region's home page has none (null): it already carries two strips (chase cards under the stats, sealed after
 * the first rail), and a feed holds only 8 listings (the six of its strip and two to spare), too few for a third unit of four
 * different tiles; the home page renders <NoPreFooter/> so the layout's wrapper goes with it.
 */
export function preFooterPlan(pathname: string, region: Region): { context: "chase" | "sealed" } | null {
  const p = pathname.replace(/\/+$/, "");
  const base = `/${region}`;
  if (p === base) return null;
  const rest = p.startsWith(`${base}/`) ? p.slice(base.length + 1).split("/")[0] : "";
  // Pages whose own strip is the chase one (set pages cascade to it, stores and releases use it): the slim strip is sealed.
  if (rest === "sets" || rest === "stores" || rest === "releases") return { context: "sealed" };
  return { context: "chase" };
}

// ─── Page budgets ──────────────────────────────────────────────────────────────
// Where a page's own units leave too little room for the strip above the footer, the page asks for it to be
// dropped (components/Ebay.tsx NoPreFooter). Heights are phone-width estimates in px, checked by the screenshot sweep.

const PHONE_ROW = 330; // a product-card row on a phone: two cards and the gap
const DESK_ROW = 446; // …and on a desktop: four cards across
// Two units must be at least a viewport (844 phone, 900 desktop) apart, plus the
// slack that row heights vary by (a name that wraps, a per-pack line).
const GAP = 960;
/** A full strip's height on a phone and a desktop (px), measured: the product page's strip is a unit of this size. */
export const STRIP_PHONE = 470;
export const STRIP_DESK = 420;

// The product page, measured at 390 (phone) and 1280 (desktop) after the growth release's compact layout (scratch sweep, 2026-10-14,
// eight products: in stock, sold out, pre-order, no set, one store). Each figure is the SMALLEST measured, so a unit is only ever placed
// where it is at least GAP below the one above it. Distances run from one unit's bottom edge to the next one's top edge.
//   • The price table (components/OfferTable.tsx): a row is 89 px on a phone (88 and the rule between rows: the store and its stock pill,
//     the price, the host line, the button beside the last two) and 69 px on a desktop (one line); a collapsed group's summary is 53 px.
//     Only the first VISIBLE_ROWS (8) rows show, the eBay row among them.
export const ROW_PHONE = 89;
export const ROW_DESK = 69;
export const SUMMARY_H = 53;
const VISIBLE = 8; // lib/ebay-offer-row.ts VISIBLE_ROWS (this module stays import-free)
type Px = { phone: number; desk: number };
//   • In stock, from the Marketplaces panel to the table's first row (the section's margin and heading); sold out, from the callout's
//     eBay box (the rest of the callout, the "See all … stores" link, the heading). From the last visible row to the end of "How these
//     prices work" (its summaries apart).
const HEAD: Px = { phone: 109, desk: 109 };
const SOLD_HEAD: Px = { phone: 265, desk: 235 };
const FOOT: Px = { phone: 110, desk: 94 };
//   • The "Quick facts" card with its margin, at its shortest (no value check), and its other-region tiles (two across on a phone, six on a
//     desktop); "In stock instead" (ProductRail: one scrolling row on a phone, four across from sm); the strip's own top margin.
const FACTS: Px = { phone: 240, desk: 200 };
const tiles = (n: number): Px => ({ phone: n ? 16 + 52 * Math.ceil(n / 2) : 0, desk: n ? 16 + 52 * Math.ceil(n / 6) : 0 });
const RAIL: Px = { phone: 440, desk: 530 };
const STRIP_TOP = 56;

const add = (...xs: Px[]): Px => xs.reduce((a, x) => ({ phone: a.phone + x.phone, desk: a.desk + x.desk }), { phone: 0, desk: 0 });
const fits = (x: Px) => x.phone >= GAP && x.desk >= GAP;
const NONE: Px = { phone: 0, desk: 0 };

// Ad density (the sweep's guard: unit height ÷ <main> height ≤ 25%, at 390 and 1440). A shorter page (the collapsed table) holds fewer
// units: the plan drops the pre-footer strip, then the page's own strip, where they would take it over. Typical heights, measured: <main>
// from its top to the first-screen unit's bottom edge; the units (the panel or the callout's eBay box, and on a desktop the header's own
// eBay item); a full strip; the pre-footer strip and its margin; the page's bottom padding.
const DENSITY = 0.25;
const MAIN_HEAD: Px = { phone: 1000, desk: 740 };
const SOLD_MAIN_HEAD: Px = { phone: 700, desk: 540 };
const FIRST_UNIT: Px = { phone: 263, desk: 197 + 32 };
const SOLD_FIRST_UNIT: Px = { phone: 274, desk: 242 + 32 };
const STRIP_H: Px = { phone: 508, desk: 430 };
const PREFOOT_H: Px = { phone: 414, desk: 372 };
const PREFOOT_BOX: Px = { phone: 414 + 64, desk: 372 + 64 };
const PAGE_FOOT: Px = { phone: 32, desk: 32 };
const dense = (units: Px, main: Px) => units.phone / main.phone > DENSITY || units.desk / main.desk > DENSITY;

/** A plan's units and page: its strip (none, in the middle, or at the bottom in the pre-footer's place) and the pre-footer strip. */
function tooDense(o: { head: Px; first: Px; to: Px; after: Px; strip: "table" | "bottom" | null; preFooter: boolean }): boolean {
  const units = add(o.first, o.strip ? STRIP_H : NONE, o.preFooter ? PREFOOT_H : NONE);
  // `to` ends where the strip would start; `after` is what follows it (or follows the table's group when there is no strip there)
  const main = add(o.head, o.to, o.after, o.strip ? STRIP_H : NONE, o.preFooter ? PREFOOT_BOX : NONE, PAGE_FOOT);
  return dense(units, main);
}

/** The table: its visible rows and its group summaries, and what sits under them. */
function table(visibleRows: number, summaries: number): Px {
  return { phone: ROW_PHONE * visibleRows + SUMMARY_H * summaries + FOOT.phone, desk: ROW_DESK * visibleRows + SUMMARY_H * summaries + FOOT.desk };
}

/** Related products: the set's grid (two across on a phone, four on a desktop), or a rail (one row) for a product with no set. */
function related(n: number, rail = 0): Px {
  if (rail) return { phone: 80 + RAIL.phone, desk: 70 + RAIL.desk };
  return { phone: 80 + (n ? 150 + PHONE_ROW * Math.ceil(n / 2) : 0), desk: 70 + (n ? 160 + DESK_ROW * Math.ceil(n / 4) : 0) };
}

/**
 * Product page, in stock: which of the lower units fit. The marketplace panel (the first-screen unit) is always there; the product's
 * listing strip goes after the price table and the "Quick facts" card when they reach a screen below the panel (else at the bottom of the
 * page, in place of the pre-footer strip), and the pre-footer strip needs that much page (the related products) under the last unit above
 * it. The table counts its VISIBLE rows (the first eight, the eBay row among them: min(offerRows + 1, 8)) and its collapsed groups'
 * summaries (`summaries`, 0–2: lib/ebay-offer-row.ts tableShape), not every offer. `rail`: a product with no set shows "More <type>" as a
 * rail of that many cards instead of the set's grid. Both a phone and a desktop must fit: the sweep in README.md checks these numbers.
 */
export function productAdPlan(o: { offerRows: number; summaries?: number; elsewhere: number; related: number; rail?: number }): { tableGroup: boolean; preFooter: boolean } {
  const rows = o.offerRows > 0 ? Math.min(o.offerRows + 1, VISIBLE) : 0;
  // the panel → the strip after the table and the facts
  const to = add(HEAD, table(rows, o.summaries ?? 0), FACTS, tiles(o.elsewhere), { phone: STRIP_TOP, desk: STRIP_TOP });
  let tableGroup = fits(to);
  const after = related(o.related, o.rail);
  // Above the pre-footer strip: the strip after the facts when there is one, else the panel. (Without one in the middle, the strip goes
  // to the bottom in the pre-footer strip's place: the page renders it there when `preFooter`.)
  let preFooter = tableGroup ? fits(after) : fits(add(to, after));
  const page = { head: MAIN_HEAD, first: FIRST_UNIT, to, after };
  if (tableGroup && preFooter && tooDense({ ...page, strip: "table", preFooter: true })) preFooter = false;
  if (tableGroup && tooDense({ ...page, strip: "table", preFooter: false })) {
    tableGroup = false;
    preFooter = fits(add(to, after)) && !tooDense({ ...page, strip: "bottom", preFooter: false });
  }
  if (!tableGroup && preFooter && tooDense({ ...page, strip: "bottom", preFooter: false })) preFooter = false;
  return { tableGroup, preFooter };
}

/**
 * Product page, sold out: where the product's listing strip goes. The callout's eBay box is the first-screen unit, so the strip comes no
 * nearer than GAP (960 px, a viewport and slack) on a phone and a desktop: after the price table and the "In stock instead" rail ('table')
 * when they are that long; else at the bottom of the page in place of the pre-footer strip ('bottom') when the page (the facts with the
 * other regions, the related products) is; else none. `preFooter`: the layout's own strip above the footer keeps its place, GAP under the
 * strip.
 */
export function soldOutAdPlan(o: { visibleRows: number; summaries?: number; alternatives: number; elsewhere: number; related: number }): { strip: "table" | "bottom" | null; preFooter: boolean } {
  // the callout's eBay box → the strip after the table and "In stock instead"
  const to = add(SOLD_HEAD, table(o.visibleRows, o.summaries ?? 0), o.alternatives > 0 ? RAIL : { phone: 0, desk: 0 }, { phone: STRIP_TOP, desk: STRIP_TOP });
  // under it: the facts (with the other regions) and the related products
  const after = add(FACTS, tiles(o.elsewhere), related(o.related));
  const page = { head: SOLD_MAIN_HEAD, first: SOLD_FIRST_UNIT, to, after };
  if (fits(to)) {
    const preFooter = fits(after) && !tooDense({ ...page, strip: "table", preFooter: true });
    if (!tooDense({ ...page, strip: "table", preFooter })) return { strip: "table", preFooter };
  }
  if (fits(add(to, after)) && !tooDense({ ...page, strip: "bottom", preFooter: false })) return { strip: "bottom", preFooter: false };
  return { strip: null, preFooter: false };
}

/** Set / type page: the strip sits after the first row of products (ProductGrid `strip`), so the pre-footer strip needs a grid long enough between them. */
export function gridPageHasRoomForFooter(products: number): boolean {
  return products >= 8;
}

/** (Used by the store pages (StoreListing): a list under 14 rows carries no eBay unit, whose own strip is now at the bottom of the list and replaces the pre-footer one; kept with its tests.) Rows are ~76px on a phone. */
export function listHasRoomForFooter(rows: number): boolean {
  return rows >= 14;
}
