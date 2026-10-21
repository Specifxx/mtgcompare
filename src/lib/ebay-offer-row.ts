// The eBay row of a product's price table (components/OfferTable.tsx, EbayStrip.tsx OfferRowsWithEbay): which listing it shows, where it
// sits among the store rows, and the note under the table. Pure, shared by the server table and the browser.
//
// The owner's calls (2026-10-11): DexCompare compares WEBSITES, and eBay is one of them, so the product's cheapest eBay listing is a row of
// the store table, ranked by its price among the stores you can buy from now, tinted and with eBay's blue button, labelled "Ad"; and when
// it is a new listing cheaper than every one of those stores (and the product is not a pre-order) it COUNTS AS THE CHEAPEST PRICE: the "Best price" badge in the table, and the product
// page's best-price card (components/BestPriceCard.tsx). It is never counted in "Prices at N stores" or the median, and never in JSON-LD,
// meta, OG, the sitemap or the "from" prices elsewhere (server-rendered and cached for a day: an eBay price there would outlive its age
// bound). eBay's API License Agreement asks that eBay content not be "co-mingled or combined with non-eBay Content" (8.1(b)(2)) and that
// nothing be derived from it (8.1(d)): the owner chose this knowing that (DEPLOY.md, "eBay's rules, and how each is met").

import { TCGPLAYER_KEY } from "./affiliate";
import type { TypeKey } from "./sealed-title";

export interface PriceFloor {
  /** In major units ("12.40"), the eBay listing's own currency. */
  value: number;
  currency: string;
}

/** A listing's price in cents, or null when it is not a positive number. */
export function listingCents(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

// "36 Packs", "18-Pack", "9 Booster Packs", "2 x Booster Packs", "36pk", "6 Boosters", "18er Display", "pack of 18": a pack count the title
// states. Not a bare "N Booster" ("151 Booster Bundle" names the set 151), and never 151 itself ("Pokemon 151 Booster Packs" is that set's).
const STATED_PACKS = /\b(\d{1,3})\s*(?:-\s*)?(?:x\s*)?(?:booster\s*)?(?:packs?|pk|packungen|boosters)\b|\b(\d{1,3})er\b|\bpack\s+of\s+(\d{1,3})\b/gi;
// A display's card count, at ten cards a pack: "Booster Box 180 Cards" is an 18-pack display, "360 Cards" a 36-pack box. Read only for a
// box-sized product (18 packs or more) and only at a display's size (18, 24 or 36 packs): an ETB's "180 Cards" or a seller's "200 Cards"
// says nothing reliable.
const STATED_CARDS = /\b(\d{3})\s*(?:-\s*)?cards?\b/gi;
const DISPLAY_SIZES = new Set([18, 24, 36]);

/** The pack counts a listing's title states outright ("Booster Box 18 Packs" → [18]); empty when it states none. */
export function statedPacks(title: string): number[] {
  return [...title.matchAll(STATED_PACKS)].map((m) => Number(m[1] ?? m[2] ?? m[3])).filter((n) => n > 0 && n !== 151);
}

/** A display size a box's card count gives ("180 Cards" → [18]). */
export function displayPacksFromCards(title: string): number[] {
  return [...title.matchAll(STATED_CARDS)].map((m) => Number(m[1]) / 10).filter((n) => DISPLAY_SIZES.has(n));
}

/**
 * A listing that states a pack count, none of them the product's (lib/packs.ts): another product. "Surging Sparks Booster Box 18 Packs"
 * is an 18-pack display, not the 36-pack box, and lowest price first would rank it above every store. No pack count known, or none
 * stated: no opinion.
 */
export function wrongPackCount(title: string, packs: number | null | undefined): boolean {
  if (!packs) return false;
  const stated = [...statedPacks(title), ...(packs >= 18 ? displayPacksFromCards(title) : [])];
  return stated.length > 0 && !stated.includes(packs);
}

// Products of several units: their listings state ONE unit's packs ("Booster Box Case 6 Boxes 36 Packs Each", "Stadium: 2 Build & Battle
// Boxes + 3 Booster Packs"), which is no reason to doubt them.
const SEVERAL_UNITS: ReadonlySet<TypeKey> = new Set(["booster-box-case", "etb-case", "booster-bundle-case", "build-battle-stadium"]);

/** The pack count the eBay row checks listings against: the product's (lib/packs.ts), or null for a product of several units. */
export function rowPacks(type: TypeKey | null | undefined, packs: number | null): number | null {
  return type && !SEVERAL_UNITS.has(type) ? packs : null;
}

/**
 * The listing the table shows for eBay: the lowest-priced of the product's OWN feed (never its type's or generic listings), skipping one
 * under `floor` (40% of the cheapest store price, when the stores price in the eBay site's currency: that cheap, it is a part of the
 * product or a single card, not the product) and one whose title states another pack count than the product's `packs`. Ties keep the
 * feed's order (lowest price first, as stored).
 */
export function pickListing<T extends { title?: string; price: { value: string; currency: string } }>(items: readonly T[], floor: PriceFloor | null, packs: number | null = null): T | null {
  let pick: T | null = null;
  let low = Infinity;
  for (const it of items) {
    const n = Number(it.price.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (floor && it.price.currency === floor.currency && n < floor.value) continue;
    if (wrongPackCount(it.title ?? "", packs)) continue;
    if (n < low) {
      pick = it;
      low = n;
    }
  }
  return pick;
}

/**
 * Where the eBay row goes among the store rows, which come ranked (rankOffers: open first, cheapest first; then not checked recently,
 * then sold out): before the first open row dearer than the listing (a tie stays with the store), else straight after the last open row
 * (the top, when none is open: an eBay listing is one you can buy). `cents` null (no listing yet, or one in another currency than the
 * stores': NZ and SG are served the AU and US sites) is never compared: the row goes after the open rows.
 */
export function ebayRowIndex(rows: readonly { open: boolean; cents: number }[], cents: number | null): number {
  let lastOpen = -1;
  rows.forEach((r, i) => {
    if (r.open) lastOpen = i;
  });
  if (cents != null) {
    const i = rows.findIndex((r, j) => j <= lastOpen && r.open && r.cents > cents);
    if (i >= 0) return i;
  }
  return lastOpen + 1;
}

/** NZ and SG are served the AU and US sites' listings: whose they are, and that delivery is not shown. True of a listing and a search alike. */
export const SHARED_SITE_NOTE: Readonly<Record<string, string>> = {
  nz: " The eBay row uses eBay Australia (the eBay New Zealand buyers use): its prices are in A$, so never compared with the stores', and a listing's delivery to New Zealand is not shown, so check it on eBay.",
  sg: " The eBay row uses eBay US (the eBay Singapore buyers use): its prices are in US$, so never compared with the stores', and a listing's delivery to Singapore is not shown, so check it on eBay.",
};

/** The sentence under the table about its eBay row: static (server-rendered), so it reads the same whichever state the row is in. */
export function ebayRowNote(region: string): string {
  return (
    " The tinted eBay row is an ad: the lowest-priced eBay listing we have for this product, or an eBay search when there is none" +
    // NZ and SG: A$/US$ listings, never compared, never the best price
    (SHARED_SITE_NOTE[region] ? "." : "; when it is a new listing cheaper than every store, it is the best price.") +
    " Listings are imported from eBay on a schedule (how long ago is on the row) and priced before shipping, so a price or its availability may have changed: eBay's page is final." +
    " Its link is an eBay Partner Network affiliate link: we may earn a commission, at no extra cost to you." +
    (SHARED_SITE_NOTE[region] ?? "")
  );
}

// ─── The table's visible rows and its two collapsed groups ─────────────────────
// A product with 30 offers was a 30-row table (4,700 px on a phone) that buried everything under it. The table now shows the first
// VISIBLE_ROWS rows of the ranked list (the eBay row included, at its rank) and collapses the rest into two server-rendered <details>:
// the other open rows ("Show 12 more in-stock stores"), then the sold-out and not-checked ones. Every store link stays in the HTML.
//
// The split happens AFTER ranking, so the eBay listing keeps its honest place: when it arrives in the browser and ranks into the first
// eight, the eighth store row moves into the first group, and the visible part keeps its height (every row is the same height).

/** Rows shown before the collapsed groups. */
export const VISIBLE_ROWS = 8;
/** The eBay row's key among the store rows (OfferRowsWithEbay). */
export const EBAY_ROW_KEY = "ebay";

/** The ranked rows split into the visible ones, the hidden open ones and the hidden sold-out / not-checked ones (order kept). */
export function splitRows<T extends { open: boolean }>(rows: readonly T[], visible = VISIBLE_ROWS): { shown: T[]; moreOpen: T[]; moreClosed: T[] } {
  const rest = rows.slice(visible);
  return { shown: rows.slice(0, visible), moreOpen: rest.filter((r) => r.open), moreClosed: rest.filter((r) => !r.open) };
}

/**
 * The table's shape from counts alone (the page's ad plan): `rows` store rows (TCGplayer included), `openRows` of them open, plus the eBay
 * row (open: it sits among, or straight after, the open rows). The same whichever place the eBay row takes, so it holds in the server HTML
 * and after the listing arrives.
 */
export function tableShape(rows: number, openRows: number, ebay = true): { visible: number; moreOpen: number; moreClosed: number; summaries: number } {
  const total = rows + (ebay ? 1 : 0);
  const open = Math.min(rows, openRows) + (ebay ? 1 : 0);
  const visible = Math.min(total, VISIBLE_ROWS);
  const moreOpen = Math.max(0, open - VISIBLE_ROWS);
  const moreClosed = total - visible - moreOpen;
  return { visible, moreOpen, moreClosed, summaries: (moreOpen > 0 ? 1 : 0) + (moreClosed > 0 ? 1 : 0) };
}

/**
 * The first group's summary: "Show 12 more in-stock stores" (TCGplayer among them: "offers", a marketplace is not a store); the eBay row,
 * when it is in the group, is not counted (it is not a store either). Only the eBay row: "Show eBay too".
 */
export function moreOpenLabel(rows: readonly { key: string }[], preorder = false): string {
  const offers = rows.filter((r) => r.key !== EBAY_ROW_KEY);
  if (!offers.length) return "Show eBay too";
  const noun = offers.some((r) => r.key === TCGPLAYER_KEY) ? "offer" : "store";
  return `Show ${offers.length} more ${preorder ? "pre-order" : "in-stock"} ${noun}${offers.length === 1 ? "" : "s"}`;
}

/** The second group's summary: "9 stores sold out or not checked" ("9 more …" when some are already among the visible rows). */
export function moreClosedLabel(count: number, more: boolean): string {
  return `${count} ${more ? "more " : ""}${count === 1 ? "store" : "stores"} sold out or not checked`;
}

/** The table's one-line footer, under the rows: how it is ranked, and that the tinted row is an ad. The long version is ebayRowNote. */
export function tableFooter(ebay: boolean): { ranked: string; noPay: string; ad: string } {
  return { ranked: "In stock first, then cheapest.", noPay: "No store pays to rank.", ad: ebay ? "Tinted eBay row = Ad." : "" };
}
