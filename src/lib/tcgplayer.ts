// TCGplayer: the US marketplace, read as one more US source beside the stores.
//
// Data comes from TCGplayer's public search API — the endpoint its own website
// searches with, no credentials (the same client Rift Compare runs, see
// src/lib/tcgplayer.ts there). One query returns the whole English Pokémon
// sealed catalogue, ~2,940 products, 50 per page (the API's maximum: 51 is a
// 400). Each product carries a preview of its cheapest listings, filtered at
// the source (searchBody) to live, standard, English, in-stock listings.
//
// What a TCGplayer offer is (the data contract with the UI, src/lib/stores.ts):
// an ordinary Offer row, store "tcgplayer", market US, url the canonical
// /product/<id>/<slug> page (never an affiliate link: links are tagged at
// render time), price the cheapest such listing's ITEM price in US cents,
// excluding shipping like every store price. A product with no such listing is
// not written at all: TCGplayer has no "sold out", only no sellers.
//
// Facts the code below relies on, checked against the live API on 2026-09-27:
//   - Pagination needs a unique sort. The default relevance order shifts
//     between requests: paging through it returned 2,694 distinct products of
//     2,936, the rest as repeats. Sorted by product id, every product once.
//   - The listing preview is at most THREE listings, ordered by price +
//     shipping; `listingSearch` accepts no size or sort. Asking for more means
//     one request per product (/v1/product/<id>/listings), ~2,300 more a run,
//     so the cheapest item price is taken from those three.
//   - `lowestPrice` is NOT filtered by listingSearch (it counts custom and
//     other-language listings: $1.00 for a Perfect Order ETB), and
//     `totalListings` can be stale (19 on a product whose listings endpoint
//     says 0). Neither is used. No preview listing = no seller.
//   - "custom" listings (a seller's own photos and description) include
//     partial items, like a $5.99 "coin & dice" listed under an ETB, so only
//     "standard" ones count.
//   - Some sellers load the price into shipping: a Chaos Rising ETB at $50.00
//     + $199.99 shipping, a UPC at $375.01 + $199.99 beside $575 + free
//     shipping. Such a listing's item price is not a price anyone pays, so it
//     is skipped (shippingLoaded).
//   - Some products' only sellers ask a placeholder: a Team Plasma Tin at
//     $19,999.99 against a $1,000 market price, Base Set 2 theme decks at
//     $1,000. A listing over three times TCGplayer's own market price for the
//     product is skipped (15 products of ~2,250 on the day). Most older
//     products have NO market price (11 of the 18 with listings on page 0),
//     so the importer also drops asks far above the stores' asks or the set's
//     single unit (dropPlaceholderAsks in importer.ts).
import type { FeedProduct } from "./feeds";
import { SCRAPE_HEADERS, sleep } from "./scrape-http";
import { detectSet, identify } from "./sealed-title";

const SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";
const PAGE_SIZE = 50;
const MAX_PAGES = 120; // 6,000 products: twice today's catalogue
// One host, read in one go. The API has no robots.txt; this is a second a
// page, three times the stores' per-store pause.
const PAGE_DELAY_MS = 1_000;
const TIMEOUT_MS = 25_000;
// A 429, a 5xx, a 403, a network error or a cut-off body is retried after these
// waits (a Retry-After header wins, capped at a minute), then the read gives up
// and yesterday's rows are kept. 403 and 502 are both seen now and then from
// GitHub's runners on this endpoint (Rift Compare's runs 33685886911 and
// 33636059799), and pass on retry.
const RETRY_WAITS_MS = [5_000, 15_000, 45_000];
// The whole read gives up after this long. runImport writes nothing until every
// source is back, so a TCGplayer that answers slowly but never fails (four 25 s
// timeouts a page) could otherwise hold every store's rows past the job's
// 90-minute limit. A healthy read takes ~1.5 minutes.
const READ_DEADLINE_MS = 15 * 60_000;

// A listing whose shipping is over US$10 AND over a fifth of its item price is
// priced in its shipping (see the header). Real shipping on sealed product is
// $0–$6 for most sellers and ~$10–$25 on a $300+ case, both under the bar.
const LOADED_SHIPPING_USD = 10;
const LOADED_SHIPPING_SHARE = 0.2;
// A listing over this multiple of the product's market price is a placeholder.
const MAX_MARKET_MULTIPLE = 3;

/** One listing in a product's search preview. Prices are US dollars. */
export interface TcgListing {
  price: number; // item price, excluding shipping
  shippingPrice?: number;
  quantity?: number;
  languageId?: number; // 1 = English
  language?: string;
  listingType?: string; // "standard" | "custom"
  condition?: string; // "Unopened" for sealed
}

/** One product from the search API (only the fields this module reads). */
export interface TcgProduct {
  productId: number;
  productName: string;
  productUrlName?: string;
  setName?: string;
  setUrlName?: string;
  productLineUrlName?: string;
  marketPrice?: number | null; // TCGplayer's recent-sales price; null when it has none
  listings?: TcgListing[];
}

export function searchBody(from: number) {
  return {
    algorithm: "sales_synonym_v2",
    from,
    size: PAGE_SIZE,
    filters: { term: { productLineName: ["pokemon"], productTypeName: ["Sealed Products"] }, range: {}, match: {} },
    listingSearch: {
      context: { cart: {} },
      // Filters the per-product listing preview, not the products: a product
      // with no matching listing still comes back, with `listings: []`.
      filters: {
        term: { sellerStatus: "Live", channelId: 0, language: ["English"], listingType: ["standard"] },
        range: { quantity: { gte: 1 } },
        exclude: { channelExclusion: 0 },
      },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
    settings: { useFuzzySearch: true, didYouMean: {} },
    // A unique key, so no product moves between pages mid-read (see the header).
    sort: { field: "product-id", order: "asc" },
  };
}

class TcgHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

/** Test seams; production uses the defaults. */
export interface CatalogueReadOptions {
  pageDelayMs?: number;
  retryWaitsMs?: number[];
  deadlineMs?: number;
}

async function fetchPage(from: number): Promise<{ items: TcgProduct[]; total: number }> {
  let res: Response;
  try {
    res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        ...SCRAPE_HEADERS,
        "Content-Type": "application/json",
        Origin: "https://www.tcgplayer.com",
        Referer: "https://www.tcgplayer.com/",
      },
      body: JSON.stringify(searchBody(from)),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new TcgHttpError(`network: ${(e as Error).message}`, true); // timeouts included
  }
  if (!res.ok) {
    const after = Number(res.headers.get("retry-after"));
    throw new TcgHttpError(
      `HTTP ${res.status}`,
      res.status === 429 || res.status === 403 || res.status >= 500,
      Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 60_000) : null,
    );
  }
  // Read the body separately from parsing it: a body cut off mid-transfer (the
  // timeout covers it) or a half-sent JSON is a transient failure, retried.
  let data: { results?: { results?: TcgProduct[]; totalResults?: number }[] } | null;
  try {
    data = JSON.parse(await res.text());
  } catch (e) {
    throw new TcgHttpError(`unreadable response body: ${(e as Error).message}`, true);
  }
  const r = data?.results?.[0];
  if (!r || !Array.isArray(r.results)) throw new TcgHttpError("unexpected response shape", false);
  // Every page must say how big the catalogue is: without it a short read
  // can't be told from a small catalogue (readTcgplayerCatalogue).
  const total = Number(r.totalResults);
  if (!(total > 0)) throw new TcgHttpError(`no totalResults (${JSON.stringify(r.totalResults ?? null)})`, true);
  return { items: r.results, total };
}

async function fetchPageRetrying(from: number, waits: number[], deadline: number): Promise<{ items: TcgProduct[]; total: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(from);
    } catch (e) {
      const err = e as TcgHttpError;
      if (!err.retryable || attempt >= waits.length) throw new Error(`TCGplayer page from=${from}: ${err.message}`);
      const wait = err.retryAfterMs ?? waits[attempt];
      if (Date.now() + wait > deadline) throw new Error(`TCGplayer page from=${from}: ${err.message}; ${overDeadline(deadline)}`);
      console.warn(`  tcgplayer: page from=${from} ${err.message}, retrying`);
      await sleep(wait);
    }
  }
}

function overDeadline(deadline: number): string {
  return `gave up: the read would run past its time limit (${new Date(deadline).toISOString()})`;
}

/**
 * The whole English Pokémon sealed catalogue, one page at a time. All or
 * nothing: a page that still fails after its retries throws, because a
 * catalogue missing its last pages would delete those products' offers.
 *
 * The catalogue's size is the LARGEST totalResults any page reported, never
 * the last one: a page that comes back empty, short or with a smaller total
 * mid-read is a broken read, and trusting its total would pass it as complete
 * (then replace ~1,600 offers with a few dozen).
 */
export async function readTcgplayerCatalogue(opts: CatalogueReadOptions = {}): Promise<TcgProduct[]> {
  const pageDelay = opts.pageDelayMs ?? PAGE_DELAY_MS;
  const waits = opts.retryWaitsMs ?? RETRY_WAITS_MS;
  const deadline = Date.now() + (opts.deadlineMs ?? READ_DEADLINE_MS);
  const byId = new Map<number, TcgProduct>();
  let expected = 0;
  for (let page = 0; page < MAX_PAGES && (page === 0 || page * PAGE_SIZE < expected); page++) {
    if (page > 0) await sleep(pageDelay);
    if (Date.now() > deadline) throw new Error(`TCGplayer read stopped at page from=${page * PAGE_SIZE}: ${overDeadline(deadline)}`);
    const pg = await fetchPageRetrying(page * PAGE_SIZE, waits, deadline);
    expected = Math.max(expected, pg.total);
    for (const p of pg.items) if (p?.productId) byId.set(Number(p.productId), p);
    if (pg.items.length < PAGE_SIZE) break;
  }
  // A product added mid-read can push one other across a page boundary; more
  // missing than that is a broken read, not a smaller catalogue.
  if (!byId.size || byId.size < expected * 0.98) throw new Error(`TCGplayer returned ${byId.size} of ${expected} products`);
  return [...byId.values()];
}

export function tcgProductUrl(p: Pick<TcgProduct, "productId" | "productLineUrlName" | "setUrlName" | "productUrlName">): string {
  const slug = [p.productLineUrlName ?? "pokemon", p.setUrlName, p.productUrlName]
    .filter(Boolean)
    .join("-")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.tcgplayer.com/product/${Number(p.productId)}/${slug}`;
}

/**
 * TCGplayer's product photo, addressed by product id. The CDN answers 403 for
 * a product it has no photo of (mostly cases of collections, which identify()
 * refuses anyway); the importer checks before making one a product's image
 * (tcgImageExists).
 */
export function tcgImageUrl(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${Number(productId)}_in_1000x1000.jpg`;
}

export function isTcgImage(url: string | null | undefined): boolean {
  return !!url && url.startsWith("https://tcgplayer-cdn.tcgplayer.com/");
}

/** Does TCGplayer's CDN have this photo? A HEAD costs no bandwidth; any failure counts as no. */
export async function tcgImageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: SCRAPE_HEADERS, signal: AbortSignal.timeout(10_000) });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * The title identify() reads for a TCGplayer product: its name, prefixed with
 * its set only when identify() finds the name a set product with no set in it
 * ("Elite Trainer Box [Mewtwo X]" in "XY - BREAKthrough"). Measured over the
 * live catalogue on 2026-09-27 (2,219 products with a buyable listing):
 * this identifies 1,605, 1,566 of them onto a product the stores' titles also
 * identify to. Prefixing every name with its set identified 3 more but put 529
 * fewer on the stores' products: TCGplayer files collections and tins under a
 * set that the stores' titles (and so their groupKeys) don't carry.
 */
export function tcgTitle(p: Pick<TcgProduct, "productName" | "setName">): string {
  const name = (p.productName ?? "").trim();
  if (identify(name) !== "no-set") return name;
  // "SWSH07: Evolving Skies", "XY - BREAKthrough", "ME: Ascended Heroes".
  const set = (p.setName ?? "").replace(/^(?:SV|SWSH|SM|XY|ME|BW)\d{0,2}(?:\.\d)?\s*[:\-–]\s*/i, "").trim();
  return set && detectSet(set) ? `${set} ${name}` : name;
}

/** Is this listing's price partly in its shipping? */
export function shippingLoaded(l: Pick<TcgListing, "price" | "shippingPrice">): boolean {
  const ship = l.shippingPrice ?? 0;
  return ship > LOADED_SHIPPING_USD && ship > l.price * LOADED_SHIPPING_SHARE;
}

/** A live, standard, English, in-stock listing whose item price is a real price. */
function buyable(l: TcgListing): boolean {
  const english = l.languageId === 1 || l.language === "English";
  return english && l.listingType === "standard" && (l.quantity ?? 0) >= 1 && l.price > 0 && !shippingLoaded(l);
}

/**
 * Search results → the importer's FeedProduct shape. Pure, so it is tested
 * with a fixture (tests/tcgplayer.test.ts). Each buyable preview listing is a
 * variant at its item price; rowsFromReads() then identifies the title, takes
 * the cheapest variant at or above the type's US floor and keeps one row per
 * product identity, exactly as for a store. Products with no buyable listing
 * (or only placeholder asks) are left out.
 */
export function tcgFeedProducts(products: TcgProduct[]): FeedProduct[] {
  const out: FeedProduct[] = [];
  const seen = new Set<number>();
  for (const p of products) {
    const id = Number(p?.productId);
    if (!id || seen.has(id) || !p.productName) continue;
    seen.add(id);
    const market = p.marketPrice && p.marketPrice > 0 ? p.marketPrice : null;
    const listings = (p.listings ?? []).filter((l) => buyable(l) && (market == null || l.price <= market * MAX_MARKET_MULTIPLE));
    if (!listings.length) continue;
    out.push({
      id: String(id),
      title: tcgTitle(p),
      url: tcgProductUrl(p),
      imageUrl: tcgImageUrl(id),
      variants: listings.map((l) => ({ priceCents: Math.round(l.price * 100), available: true })),
      currency: "USD",
    });
  }
  return out;
}
