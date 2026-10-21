// The browser-safe half of the eBay listings: feed keys, marketplaces, what a strip may ask the
// API route for, what comes back, and how the browser RE-VALIDATES it. Pure: no secrets, no fetch,
// no database, no Node APIs, and no big tables (the sets table and the classifier stay on the
// server: ebay-context-parse.ts).
//
// Where the data comes from: scripts/ebay-import.ts, a GitHub Actions job that runs once a day
// with DexCompare's own keys, searches eBay's Browse API and REPLACES each feed's rows in the
// EbayListing table. The web route (src/app/api/ebay/[region]/route.ts) only READS that table:
// no eBay call, no token, no secret exists in the web runtime.
//
// A FEED is one stored list of up to 8 listings, keyed "<marketplace>|<kind>[:<arg>]":
//   EBAY_US|chase           generic chase cards            EBAY_AU|sealed         generic sealed Pokémon
//   EBAY_GB|set:<slug>      a recent set's chase cards     EBAY_US|type:<slug>    a high-value product type
//   EBAY_US|item:<id>       one product (by Product.id)
// A CONTEXT is what a strip asks for ("set:surging-sparks"); the server turns it into a
// cascade of feeds and answers with the first one that has rows (ebay-context-parse.ts).
import { affiliateSubId, listingHref } from "./affiliate";
import { isRegion, type Region } from "./regions";

// ─── Marketplaces ──────────────────────────────────────────────────────────────

export type MarketplaceId = "EBAY_US" | "EBAY_AU" | "EBAY_GB" | "EBAY_CA" | "EBAY_DE";

export interface Marketplace {
  id: MarketplaceId;
  currency: string;
  /** ISO country the search delivers to (the Browse API's deliveryCountry filter). */
  country: string;
  lang: string;
}

export const MARKETPLACES: Record<MarketplaceId, Marketplace> = {
  EBAY_US: { id: "EBAY_US", currency: "USD", country: "US", lang: "en-US" },
  EBAY_AU: { id: "EBAY_AU", currency: "AUD", country: "AU", lang: "en-AU" },
  EBAY_GB: { id: "EBAY_GB", currency: "GBP", country: "GB", lang: "en-GB" },
  EBAY_CA: { id: "EBAY_CA", currency: "CAD", country: "CA", lang: "en-CA" }, // EBAY_CA also serves French: ask for English
  EBAY_DE: { id: "EBAY_DE", currency: "EUR", country: "DE", lang: "de-DE" },
};
export const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as MarketplaceId[];

/** NZ buyers use eBay Australia and SG buyers eBay US (neither has an EPN programme of its own; EBAY_SG has no affiliate URLs). */
export const MARKETPLACE_OF_REGION: Record<Region, MarketplaceId> = {
  au: "EBAY_AU",
  nz: "EBAY_AU",
  us: "EBAY_US",
  sg: "EBAY_US",
  uk: "EBAY_GB",
  ca: "EBAY_CA",
  eu: "EBAY_DE",
};

export function marketplaceOf(region: Region): Marketplace {
  return MARKETPLACES[MARKETPLACE_OF_REGION[region]];
}

/** Regions whose ProductStat rows decide a marketplace's item feeds ("EBAY_AU" → au, nz). */
export function regionsOfMarketplace(id: MarketplaceId): Region[] {
  return (Object.keys(MARKETPLACE_OF_REGION) as Region[]).filter((r) => MARKETPLACE_OF_REGION[r] === id);
}

/**
 * How much a marketplace's visitors matter, for ranking which item feeds the daily call budget buys first and how the catalogue sweep's
 * calls are shared. The owner's priority (src/lib/popular.ts PRIORITY_MARKETPLACES): the US above all, then the UK and the EU (eBay.de);
 * Australia/NZ and Canada get what is left.
 */
export const MARKET_WEIGHT: Record<MarketplaceId, number> = { EBAY_US: 1, EBAY_GB: 0.7, EBAY_DE: 0.7, EBAY_AU: 0.35, EBAY_CA: 0.25 };

// ─── Feed keys ─────────────────────────────────────────────────────────────────

export type FeedKind = "item" | "type" | "set" | "chase" | "sealed";

export function feedKey(marketplace: MarketplaceId, kind: FeedKind, arg?: string): string {
  return arg ? `${marketplace}|${kind}:${arg}` : `${marketplace}|${kind}`;
}

export function parseFeedKey(key: string): { marketplace: MarketplaceId; kind: FeedKind; arg: string | null } | null {
  const m = /^(EBAY_[A-Z]{2})\|(item|type|set|chase|sealed)(?::(.+))?$/.exec(key);
  if (!m || !(m[1] in MARKETPLACES)) return null;
  return { marketplace: m[1] as MarketplaceId, kind: m[2] as FeedKind, arg: m[3] ?? null };
}

/** The marketplace's short code in an EPN sub-id: dex-us-chase, dex-au-item. */
const MARKET_CODE: Record<MarketplaceId, string> = { EBAY_US: "us", EBAY_AU: "au", EBAY_GB: "uk", EBAY_CA: "ca", EBAY_DE: "eu" };

/**
 * The affiliateReferenceId the importer asks eBay to put in a feed's affiliate URLs (it becomes the URL's `customid`, which EPN
 * reports by): `dex-<market>-<feed kind>`, e.g. dex-us-chase, dex-au-item, dex-uk-set. Lower case a-z0-9 and "-" only, at most 60
 * characters. The surface (home, set page, footer...) is NOT in it: one stored URL serves every surface, and eBay's spec says to use
 * the URL as returned, so the browser cannot edit it. The surface is in Vercel's buy_click event ({retailer, placement}).
 */
export function feedReference(marketplace: MarketplaceId, kind: FeedKind): string {
  return affiliateSubId("dex", MARKET_CODE[marketplace], kind);
}

/**
 * The most listings a feed stores, and the most any response carries: a strip shows six (the slim one four, the browse page's
 * in-feed card the seventh), so a stored or returned row beyond the eighth is database egress for nothing.
 */
export const MAX_FEED_ROWS = 8;
/** A feed with fewer live rows than this is not shown: the cascade moves on to the next feed. */
export const MIN_FEED_ROWS = 2;
/**
 * The fewest rows a feed of this kind needs to answer: a product's OWN listings answer from one (one listing is still that product's
 * eBay price; the catalogue sweep finds many products listed once), any other feed from MIN_FEED_ROWS.
 */
export const minRowsFor = (kind: FeedKind): number => (kind === "item" ? 1 : MIN_FEED_ROWS);

// ─── Contexts ──────────────────────────────────────────────────────────────────

/** The shape of a context string ("chase", "set:<slug>"…). Shape only: the server decides what is in the whitelist. */
export function isContextString(c: unknown): c is string {
  return typeof c === "string" && /^(?:chase|sealed|(?:set|type|item):[a-z0-9][a-z0-9-]{0,99})$/.test(c);
}

// ─── Freshness ─────────────────────────────────────────────────────────────────
// eBay's API License Agreement 8.1(c): "Displayed item listing information may not be more than six
// (6) hours older than information displayed on the eBay Site" and "you will disclose in your
// Application how much older your displayed item listing is". The owner chose a once-a-day import
// knowingly (DEPLOY.md, "Why daily"): the bound is configurable, and every strip shows its age.
// Compliant mode is a cron every 4 h plus EBAY_LISTING_MAX_AGE_HOURS=5.5.

export const DEFAULT_MAX_AGE_HOURS = 26;
export const MIN_MAX_AGE_HOURS = 1;
export const HARD_MAX_AGE_HOURS = 72;
/** Rows are deleted this long after they stop being shown (the import's purge). */
export const PURGE_GRACE_HOURS = 4;

/** EBAY_LISTING_MAX_AGE_HOURS → hours: the default for anything missing, not a number or non-positive, clamped to 1..72. */
export function parseMaxAgeHours(raw: string | undefined | null): number {
  const s = (raw ?? "").trim();
  if (!s) return DEFAULT_MAX_AGE_HOURS;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_AGE_HOURS;
  return Math.min(Math.max(n, MIN_MAX_AGE_HOURS), HARD_MAX_AGE_HOURS);
}

export const hoursToMs = (h: number) => Math.round(h * 3600_000);

/**
 * When stored listings are deleted: the age bound plus PURGE_GRACE_HOURS. ONE helper for every job that purges (the eBay import and the
 * store import both call it with EBAY_LISTING_MAX_AGE_HOURS), so the two can never disagree about how long a row may live.
 */
export function purgeCutoff(nowMs: number, rawMaxAgeHours: string | undefined | null): Date {
  return new Date(nowMs - hoursToMs(parseMaxAgeHours(rawMaxAgeHours) + PURGE_GRACE_HOURS));
}

/** How often the listings are imported, in words, read from the age bound the route reports (the cron and the bound are switched together: DEPLOY.md). */
export function importCadence(maxAgeMs: number): string {
  return maxAgeMs <= hoursToMs(12) ? "several times a day" : "about once a day";
}

/** The bound the browser enforces. It re-checks what the route said, and never believes more than the hard maximum. */
export function clampMaxAgeMs(ms: unknown): number {
  const n = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : hoursToMs(DEFAULT_MAX_AGE_HOURS);
  return Math.min(Math.max(n, hoursToMs(MIN_MAX_AGE_HOURS)), hoursToMs(HARD_MAX_AGE_HOURS));
}

/** "just now", "12 min ago", "9 h ago", "2 d ago": rounded UP, so a strip never looks fresher than it is. */
export function formatAge(ms: number): string {
  const min = Math.max(0, ms) / 60_000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.ceil(min)} min ago`;
  const h = min / 60;
  if (h < 48) return `${Math.ceil(h)} h ago`;
  return `${Math.ceil(h / 24)} d ago`;
}

// ─── Items ─────────────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  /** eBay's title, as returned (control characters stripped, at most 80 characters: eBay's own limit). */
  title: string;
  /** https, on *.ebayimg.com */
  imageUrl: string;
  /** Exactly as eBay returned it: never converted. */
  price: { value: string; currency: string };
  /** The first shipping option: free, or a cost. Absent when eBay gave none. */
  ship?: { free?: boolean; value?: string; currency?: string };
  /** eBay's condition text ("Brand New", "Used"…), short. */
  condition?: string;
  /** eBay's affiliate URL for the item page, exactly as eBay returned it (https, an eBay host, a campaign id in it). */
  url: string;
}

export interface ListingsResponse {
  /** Which feed of the cascade answered; null when none did. */
  feed: FeedKind | null;
  items: FeedItem[];
  /** ISO time of the OLDEST row used (null with no rows). */
  fetchedAt: string | null;
  /** The age bound the server applied, ms. The browser re-checks it. */
  maxAgeMs: number;
  /** Why `items` is empty, if it is: a short code, never an error message. */
  reason?: string;
}

const ONE_SPACE = /\s+/g;
/** The first `max` UTF-16 units, never ending in half of a surrogate pair (an emoji cut in two is not valid text, and Postgres refuses it). */
const wellFormedCut = (v: string, max: number) => v.slice(0, max).replace(/[\uD800-\uDBFF]$/, "");
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Control characters, zero-width and bidi-override/isolate characters (seller-controlled text must not reorder what is around it).
  // eslint-disable-next-line no-control-regex
  return wellFormedCut(v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, " ").replace(ONE_SPACE, " ").trim(), max);
}

/**
 * A listing title as the strip prints it: sellers' emoji and decoration (🔥 ✅ ★ ***) removed, "Pokemon Pokemon" said once, at most
 * 80 characters. Nothing else is rewritten: the words are the seller's. Applied when the importer stores a title and again when the
 * browser accepts one, so rows stored before this existed read the same.
 */
export function cleanTitle(v: unknown, max = 80): string {
  const s = cleanText(v, 400)
    .replace(/[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u2605\u2606\u25CF\u25B6\u2192]/gu, " ")
    .replace(/\b(pok[eé]mon)(?:\s+\1\b)+/gi, "$1")
    .replace(ONE_SPACE, " ")
    .replace(/^[\s*~=|•·!_-]+|[\s*~=|•·_-]+$/g, "");
  return wellFormedCut(s, max).trim();
}

/** The price as eBay returned it, or null if it is not a plain positive decimal. */
export function cleanPrice(p: unknown): { value: string; currency: string } | null {
  if (!p || typeof p !== "object") return null;
  const { value, currency } = p as { value?: unknown; currency?: unknown };
  if (typeof value !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(value) || !(Number(value) > 0)) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  return { value, currency };
}

/** A shipping cost: zero is "free", otherwise a plain non-negative decimal. */
export function cleanShip(s: unknown): FeedItem["ship"] | undefined {
  if (!s || typeof s !== "object") return undefined;
  const { free, value, currency } = s as { free?: unknown; value?: unknown; currency?: unknown };
  if (free === true) return { free: true };
  if (typeof value !== "string" || !/^\d{1,5}(\.\d{1,2})?$/.test(value) || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return undefined;
  return Number(value) === 0 ? { free: true } : { value, currency };
}

/** Image URL accepted only on eBay's image hosts (*.ebayimg.com), https, no credentials. */
export function cleanImageUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 512) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !/\.ebayimg\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Money, as returned ────────────────────────────────────────────────────────
// eBay's amount and currency, spelled for the reader ("A$717.90", "US$24.99", "£18.50"): the symbol
// only spells the currency eBay returned. Nothing is converted, ever.

const SYMBOL: Record<string, string> = { USD: "US$", AUD: "A$", NZD: "NZ$", CAD: "C$", GBP: "£", EUR: "€", SGD: "S$" };

export function formatMoney(value: string, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  const sym = SYMBOL[currency];
  const digits = n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${digits}` : `${currency} ${digits}`;
}

export const formatPrice = (p: { value: string; currency: string }) => formatMoney(p.value, p.currency);

/** The shipping line of a tile: "Free shipping", "+ A$12.00 shipping", or (eBay gave none) "Shipping on eBay". */
export function shipLabel(ship: FeedItem["ship"]): { text: string; free: boolean } {
  if (ship?.free) return { text: "Free shipping", free: true };
  if (ship?.value && ship.currency) return { text: `+ ${formatMoney(ship.value, ship.currency)} shipping`, free: false };
  return { text: "Shipping on eBay", free: false };
}

// eBay writes a card's condition in the marketplace's language ("Bewertet", "Gradée", "Valutata"): the strip says Graded or Ungraded
// in one language, as the US and AU sites do.
const UNGRADED = /^(?:ungraded|nicht\s+(?:bewertet|gegradet|klassifiziert)|non\s+(?:gradée?|valutata|classée?|classificata)|sin\s+(?:clasificar|graduar|gradear)|no\s+(?:calificad[ao]|graduad[ao])|niet\s+(?:gecategoriseerd|gegradeerd|beoordeeld)|sem\s+classifica)/i;
const GRADED = /^(?:graded|bewertet|gradée?|valutat[ao]|calificad[ao]|graduad[ao]|gegradeerd|beoordeeld|classificad[ao])(?=\s|$|[,;(/-])/i;

/** A condition worth printing: anything but "New" ("Brand New", "New with tags", "Neu"…); a card's grading in plain English. */
export function conditionLabel(c: string | undefined): string {
  const s = (c ?? "").trim();
  if (!s || /^(?:brand\s*)?new\b|^neu\b|^neuf\b|^nuovo\b|^nuevo\b|^nieuw\b/i.test(s)) return "";
  if (UNGRADED.test(s)) return "Ungraded";
  if (GRADED.test(s)) return "Graded";
  return s;
}

// ─── The response, checked by the browser ──────────────────────────────────────

export type AcceptedItem = FeedItem & { href: string };
export interface Accepted {
  feed: FeedKind;
  items: AcceptedItem[];
  /** ms since epoch of the oldest row. */
  fetchedAtMs: number;
  maxAgeMs: number;
}

/**
 * Check an item out of the (JSON) response before rendering it: the browser does not trust the
 * route any more than the route trusts what it stored. Whitelisted fields only, or null. The link is
 * eBay's affiliate URL exactly as stored (affiliate.ts listingHref only validates it).
 */
export function acceptItem(raw: unknown): AcceptedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 ? r.id : "";
  const title = cleanTitle(r.title);
  const imageUrl = cleanImageUrl(r.imageUrl);
  const price = cleanPrice(r.price);
  const href = typeof r.url === "string" ? listingHref(r.url) : null;
  if (!id || !title || !imageUrl || !price || !href) return null;
  const condition = cleanText(r.condition, 24);
  const ship = cleanShip(r.ship);
  return { id, title, imageUrl, price, url: href, href, ...(ship ? { ship } : {}), ...(condition ? { condition } : {}) };
}

const FEED_KINDS = new Set<string>(["item", "type", "set", "chase", "sealed"]);

/**
 * The route's response, checked: a bad envelope, a feed kind we do not know, or rows older than the
 * bound (the route's own `maxAgeMs`, clamped) are "no listings" (null). Items that fail validation
 * are dropped; fewer than `min` left is also null. `now` is injectable for tests.
 */
export function acceptResponse(raw: unknown, now = Date.now(), min = 1): Accepted | null {
  if (!raw || typeof raw !== "object") return null;
  const { feed, items, fetchedAt, maxAgeMs } = raw as { feed?: unknown; items?: unknown; fetchedAt?: unknown; maxAgeMs?: unknown };
  if (typeof feed !== "string" || !FEED_KINDS.has(feed) || !Array.isArray(items)) return null;
  const t = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(t)) return null;
  const bound = clampMaxAgeMs(maxAgeMs);
  const age = now - t;
  if (age > bound || age < -3600_000) return null; // too old to show, or a clock that cannot be right
  const seen = new Set<string>();
  const out: AcceptedItem[] = [];
  for (const it of items.slice(0, 24)) {
    const ok = acceptItem(it);
    if (ok && !seen.has(ok.id)) {
      seen.add(ok.id);
      out.push(ok);
    }
  }
  return out.length >= min ? { feed: feed as FeedKind, items: out, fetchedAtMs: t, maxAgeMs: bound } : null;
}

/** Is an accepted response still inside its bound at `now`? (The browser re-checks on a timer.) */
export function isFresh(a: Pick<Accepted, "fetchedAtMs" | "maxAgeMs">, now = Date.now()): boolean {
  return now - a.fetchedAtMs <= a.maxAgeMs;
}

/** The request URL for a region and context. */
export function listingsUrl(region: Region, context: string): string {
  return `/api/ebay/${region}?c=${encodeURIComponent(context)}`;
}

/** Region from the route's path segment, or null. */
export function parseRegion(raw: unknown): Region | null {
  return typeof raw === "string" && isRegion(raw) ? raw : null;
}
