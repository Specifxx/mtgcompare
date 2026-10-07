// Reading One Piece listings from the stores in lib/stores.ts. Network only:
// what a title MEANS is decided in lib/match.ts. The Shopify reader is ported
// from RiftCompare's price-import.ts (collection discovery, ?country= pricing,
// the retry and "a failed collection keeps yesterday's rows" rules), narrowed to
// One Piece; the other platforms' readers live beside it (lib/shadowpos.ts,
// ecwid.ts, bigcommerce.ts, nopcommerce.ts, woocommerce.ts) and
// fetchStoreListings() picks one per store. Every reader returns the Shopify
// product shape plus the listing's own URL, so lib/import.ts runs one path —
// matcher, best in-stock variant, currency, plausibility, staleness — for all.
import { fetchBigCommerceStore } from "./bigcommerce";
import { isoCountry } from "./country";
import { fetchEcwidStore } from "./ecwid";
import { fetchNopStore } from "./nopcommerce";
import { fetchText, fetchWithTimeout, isRateLimited, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import { fetchShadowposStore } from "./shadowpos";
import { platformOf, type StoreInfo } from "./stores";
import { fetchWooStore } from "./woocommerce";

export interface ShopifyVariant {
  title: string;
  price: string;
  available: boolean;
  // The store's own SKU ("OP12-007-EN-NF-1"): a number for titles without one
  // (lib/match.ts matchCardBySku). products.json carries it; nothing strips it.
  sku?: string | null;
}
export interface ShopifyProduct {
  title: string;
  handle: string;
  variants: ShopifyVariant[];
  product_type?: string;
  tags?: string[] | string;
}

/** A listing from any platform: the Shopify shape, plus its page when that isn't /products/<handle>. */
export interface StoreListing extends ShopifyProduct {
  url?: string;
}

/**
 * One store's read. `failed` = something we KNOW holds its stock could not be
 * read; the importer then keeps the store's existing rows rather than
 * publishing a store with most of its stock missing. `note` says why.
 */
export interface StoreRead {
  products: StoreListing[];
  failed: boolean;
  handles: string[];
  note?: string;
}

// A One Piece collection handle we should NOT read: other languages, graded
// slabs, accessories and merchandise. Matching would reject most of what is in
// them anyway; skipping them saves the requests and the risk.
export const SKIP_HANDLE =
  /japan|(?:^|-)jp(?:-|$)|japanese|chinese|korean|graded|grade|slab|psa|proxies|proxy|figure|funko|manga-?books|books|toy|model-kit|statue|sleeve|accessor|playmat|binder|plush|live-break|digital|zubehor|accesorios|tickets|(?:^|-)events?$|tournois|banpresto|(?:^|-)pop(?:-|$)|figuarts|lots|merch|apparel|storage/i;

const MAX_HANDLES = 24;
// 40 × 250: the biggest One Piece singles collections (Card Brawlers 7,355,
// 401 Games, GameZilla, Collect-Edition 5,000–5,500) are past the old 30-page cap.
const MAX_PAGES = 40;

/** One Piece collection handles from a store's Shopify sitemap. */
export async function discoverOnePieceCollections(base: string): Promise<string[]> {
  const allowed = await robotsAllows(base);
  if (!allowed("/sitemap.xml")) return [];
  const index = await fetchText(`${base}/sitemap.xml`);
  let maps = index ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_collections/i.test(u)) : [];
  if (!maps.length) maps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  for (const [i, sm] of maps.slice(0, 6).entries()) {
    if (i) await sleep(REQUEST_DELAY_MS);
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (/one-?piece/i.test(h) && !SKIP_HANDLE.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) handles.add(h);
    }
  }
  return [...handles];
}

async function fetchCollection(store: StoreInfo, handle: string): Promise<{ products: ShopifyProduct[]; failed: boolean }> {
  const allowed = await robotsAllows(store.base);
  if (!allowed(`/collections/${handle}/products.json`)) return { products: [], failed: false };
  const out: ShopifyProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    // ?country= is critical: Shopify Markets prices per visitor country, and the
    // runner is in the US. Forcing the store's market gets its local price.
    const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}&country=${isoCountry(store.country)}`;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(REQUEST_DELAY_MS * 4);
      try {
        res = await fetchWithTimeout(url, 25000, { headers: { "Cache-Control": "no-cache" }, cache: "no-store" });
      } catch {
        res = null;
        continue;
      }
      if (res.ok || res.status === 404 || isRateLimited(res)) break;
    }
    if (!res) return { products: out, failed: true };
    if (isRateLimited(res)) return { products: out, failed: true };
    if (!res.ok) return { products: out, failed: res.status !== 404 };
    let data: { products?: ShopifyProduct[] };
    try {
      data = (await res.json()) as { products?: ShopifyProduct[] };
    } catch {
      return { products: out, failed: true }; // an HTML challenge / error page
    }
    if (!data.products?.length) break;
    out.push(...data.products);
    if (data.products.length < 250) break;
  }
  return { products: out, failed: false };
}

/**
 * Every One Piece product a store lists, de-duplicated across overlapping
 * collections. `failed` = a collection we KNOW holds its stock could not be
 * read; the importer then keeps the store's existing rows rather than
 * publishing a store with most of its stock missing.
 */
export async function fetchStoreProducts(store: StoreInfo): Promise<StoreRead> {
  const discovered = await discoverOnePieceCollections(store.base);
  const configured = new Set(store.collections);
  // Configured handles first (proven), then singles-looking ones, then the rest.
  const handles = [...new Set([...store.collections, ...discovered])]
    .filter((h) => !SKIP_HANDLE.test(h))
    .sort((a, b) => Number(configured.has(b)) - Number(configured.has(a)) || Number(/single/.test(b)) - Number(/single/.test(a)))
    .slice(0, MAX_HANDLES);
  const seen = new Set<string>();
  const products: ShopifyProduct[] = [];
  for (const [i, h] of handles.entries()) {
    if (i) await sleep(REQUEST_DELAY_MS);
    const { products: got, failed } = await fetchCollection(store, h);
    if (failed && configured.has(h)) return { products: [], failed: true, handles, note: `/collections/${h} could not be read` };
    for (const p of got) {
      if (seen.has(p.handle)) continue;
      seen.add(p.handle);
      products.push(p);
    }
  }
  return { products, failed: false, handles };
}

/** Every One Piece listing a store has, read by its platform's reader. */
export function fetchStoreListings(store: StoreInfo): Promise<StoreRead> {
  switch (platformOf(store)) {
    case "shadowpos":
      return fetchShadowposStore(store);
    case "ecwid":
      return fetchEcwidStore(store);
    case "bigcommerce":
      return fetchBigCommerceStore(store);
    case "nopcommerce":
      return fetchNopStore(store);
    case "woocommerce":
      return fetchWooStore(store);
    default:
      return fetchStoreProducts(store);
  }
}

/** A listing's page: its own URL when the platform gives one, else Shopify's /products/<handle>. */
export function productUrl(store: StoreInfo, p: StoreListing): string {
  return p.url ?? `${store.base}/products/${p.handle}`;
}
