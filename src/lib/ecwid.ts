// Ecwid stores: the public storefront REST API. Network + parsing only; the
// matcher decides what a title means (lib/match.ts).
//
// An Ecwid storefront embeds a PUBLIC token (public_…) in its HTML, issued for
// exactly this: anonymous, read-only catalogue reads from app.ecwid.com/api/v3.
// The token is re-read from the storefront on every run (merchants can rotate
// it), and /profile is asked for the store's currency before any price is read:
// a store whose currency is not its market's is refused, never converted.
//
// Products come per category, 100 a page: { name, price (major units),
// inStock, url, enabled }. A store's One Piece singles category id lives in
// lib/stores.ts `collections`, its store id in `ecwidStoreId`.
import { currencyOf } from "./country";
import { fetchText, getWithRetry, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

export const ECWID_API = "https://app.ecwid.com";
const PAGE = 100;
const MAX_PAGES = 40;

export interface EcwidProduct {
  id: number;
  name: string;
  price?: number;
  inStock?: boolean;
  enabled?: boolean;
  url?: string;
  sku?: string;
}

/** Every public token the storefront's HTML carries, in order. */
export function ecwidTokens(html: string): string[] {
  return [...new Set(html.match(/public_[A-Za-z0-9]{20,}/g) ?? [])];
}

export function ecwidListing(p: EcwidProduct): StoreListing | null {
  if (p.enabled === false || !p.name) return null;
  const price = typeof p.price === "number" && Number.isFinite(p.price) ? p.price : 0;
  return {
    title: p.name.replace(/\s+/g, " ").trim(),
    handle: String(p.id),
    url: p.url,
    variants: [{ title: "", price: price.toFixed(2), available: p.inStock === true }],
  };
}

async function api<T>(path: string, token: string): Promise<T | null> {
  const res = await getWithRetry(`${ECWID_API}${path}`, { timeoutMs: 30000, headers: { Authorization: `Bearer ${token}` } });
  if (!res || res.status !== 200) return null;
  try {
    return JSON.parse(res.text) as T;
  } catch {
    return null;
  }
}

export async function fetchEcwidStore(store: StoreInfo): Promise<StoreRead> {
  const handles = store.collections;
  const id = store.ecwidStoreId;
  if (!id || !store.collections.length) return { products: [], failed: true, handles, note: "no ecwidStoreId / category configured" };
  const apiAllowed = await robotsAllows(ECWID_API);
  if (!apiAllowed(`/api/v3/${id}/products`)) return { products: [], failed: false, handles, note: "robots.txt disallows the API" };
  const html = await fetchText(store.base + "/");
  if (!html) return { products: [], failed: true, handles, note: "storefront unreachable" };
  // The first token /profile accepts, and the store's currency from it.
  let token: string | null = null;
  for (const t of ecwidTokens(html)) {
    const profile = await api<{ formatsAndUnits?: { currency?: string } }>(`/api/v3/${id}/profile`, t);
    if (!profile) continue;
    const cur = profile.formatsAndUnits?.currency;
    if (cur !== currencyOf(store.country)) return { products: [], failed: true, handles, note: `charges ${cur ?? "an unknown currency"}, market is ${currencyOf(store.country)}` };
    token = t;
    break;
  }
  if (!token) return { products: [], failed: true, handles, note: "no public token accepted" };
  const products: StoreListing[] = [];
  const seen = new Set<string>();
  for (const category of store.collections) {
    for (let page = 0; page < MAX_PAGES; page++) {
      await sleep(REQUEST_DELAY_MS);
      const d = await api<{ total: number; count: number; items: EcwidProduct[] }>(
        `/api/v3/${id}/products?category=${encodeURIComponent(category)}&enabled=true&limit=${PAGE}&offset=${page * PAGE}`,
        token,
      );
      if (!d) return { products, failed: true, handles, note: `category ${category} could not be read` };
      for (const p of d.items ?? []) {
        const l = ecwidListing(p);
        if (!l || seen.has(l.handle)) continue;
        seen.add(l.handle);
        products.push(l);
      }
      if ((page + 1) * PAGE >= d.total || !d.items?.length) break;
    }
  }
  return { products, failed: false, handles };
}
