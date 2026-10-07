// WooCommerce stores, via the WordPress Store API — ported from RiftCompare's
// lib/woocommerce.ts (Specifxx/TCGEmpire), narrowed to One Piece. Network +
// parsing only; lib/match.ts decides what a title means.
//
// /wp-json/wc/store/v1/* is the unauthenticated read half of WooCommerce's
// headless surface, the direct equivalent of Shopify's products.json (not the
// keyed admin API at /wc/v3). Unlike products.json it states the currency on
// every product (prices.currency_code), so a product in another currency than
// its market's is dropped on the same call that reads its price.
//
// A `variable` product (one listing, conditions as options) returns only a
// price_range. As in RiftCompare, it records the range's MAXIMUM under a
// "Near Mint" variant: on these shops the options are the condition ladder and
// NM is its top rung, and quoting high is the safe direction (a played copy's
// price against a Near Mint headline is the bug conditionRank() exists to stop).
//
// A shop behind a bot challenge (SiteGround's sgcaptcha answers 202 with an
// HTML refresh) returns no JSON: that is a failed read, never "no stock".
import { currencyOf } from "./country";
import { decodeEntities, getWithRetry, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

export const WOO_STORE_API = "/wp-json/wc/store/v1";
const MAX_PAGES = 30;

export interface WooPrices {
  price: string; // MINOR units, as a string: "420" = 4.20 at minor_unit 2
  regular_price?: string;
  sale_price?: string;
  price_range: { min_amount: string; max_amount: string } | null;
  currency_code: string;
  currency_minor_unit: number;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  type?: string;
  is_in_stock: boolean;
  permalink: string;
  prices: WooPrices;
}

interface WooCategory {
  id: number;
  name: string;
  slug: string;
}

const major = (minor: string | number, unit: number): number => Number(minor) / Math.pow(10, unit);

/** The product as a listing, or null when it is priced in another currency than `currency`. */
export function wooListing(p: WooProduct, currency: string): StoreListing | null {
  if (!p.prices || p.prices.currency_code !== currency) return null;
  const unit = p.prices.currency_minor_unit ?? 2;
  const range = p.prices.price_range;
  const max = range ? major(range.max_amount, unit) : NaN;
  const variant = Number.isFinite(max)
    ? { title: "Near Mint", price: max.toFixed(unit), available: p.is_in_stock === true }
    : { title: "", price: (Number.isFinite(major(p.prices.price, unit)) ? major(p.prices.price, unit) : 0).toFixed(unit), available: p.is_in_stock === true };
  return { title: decodeEntities(p.name).replace(/\s+/g, " ").trim(), handle: String(p.id), url: p.permalink, variants: [variant] };
}

// Categories whose name or slug says sealed, an accessory, another language or
// a graded slab: the matcher would reject their products anyway.
const NON_SINGLE_CATEGORY =
  /sealed|scell|sellad|sigillat|versiegelt|booster|box|bundle|pre-?order|accessor|playmat|sleeve|merch|gift|case|tin|blister|display|deck|ticket|event|japan|japon|chinese|chinois|korean|graded|psa|bgs|cgc/i;

/** The store's One Piece singles category ids: configured slugs, plus any "one piece" category that isn't sealed/accessories. */
export function onePieceCategoryIds(cats: WooCategory[], configuredSlugs: string[] = []): number[] {
  const wanted = new Set(configuredSlugs.map((s) => s.toLowerCase()));
  const ids = new Set<number>();
  for (const c of cats) {
    const label = `${decodeEntities(c.name)} ${c.slug}`;
    if (wanted.has(c.slug.toLowerCase())) ids.add(c.id);
    else if (/one[\s-]?piece/i.test(label) && !NON_SINGLE_CATEGORY.test(label)) ids.add(c.id);
  }
  return [...ids];
}

async function getJson<T>(url: string): Promise<{ data: T | null; ok: boolean }> {
  const res = await getWithRetry(url, { headers: { Accept: "application/json" } });
  if (!res || res.status !== 200) return { data: null, ok: false };
  try {
    return { data: JSON.parse(res.text) as T, ok: true };
  } catch {
    return { data: null, ok: false };
  }
}

export async function fetchWooStore(store: StoreInfo): Promise<StoreRead> {
  const handles = store.collections;
  const allowed = await robotsAllows(store.base);
  if (!allowed(`${WOO_STORE_API}/products`)) return { products: [], failed: false, handles, note: "robots.txt disallows the Store API" };
  const cats: WooCategory[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, ok } = await getJson<WooCategory[]>(`${store.base}${WOO_STORE_API}/products/categories?per_page=100&page=${page}`);
    if (!ok) return { products: [], failed: true, handles, note: "categories could not be read" };
    if (!data?.length) break;
    cats.push(...data);
    if (data.length < 100) break;
  }
  const ids = onePieceCategoryIds(cats, store.collections);
  const cur = currencyOf(store.country);
  const products: StoreListing[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      await sleep(REQUEST_DELAY_MS);
      const { data, ok } = await getJson<WooProduct[]>(`${store.base}${WOO_STORE_API}/products?per_page=100&page=${page}&category=${id}`);
      if (!ok) return { products, failed: true, handles, note: `category ${id} could not be read` };
      for (const p of data ?? []) {
        const l = wooListing(p, cur);
        if (!l || seen.has(l.handle)) continue;
        seen.add(l.handle);
        products.push(l);
      }
      if (!data || data.length < 100) break;
    }
  }
  return { products, failed: false, handles };
}
