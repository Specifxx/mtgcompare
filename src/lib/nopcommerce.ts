// nopCommerce stores: the plain category pages, filtered to in-stock products.
// Network + parsing only; lib/match.ts decides what a title means.
//
// nopCommerce has no public JSON catalogue, and its AJAX product endpoint
// (/category/products/) is disallowed by these stores' robots.txt, so this
// reads the server-rendered category page a shopper sees, ?pagenumber=N, 48
// products a page. Stock is not on a category card — every card has an "Add to
// cart" button — but the store's own "Stock Status" specification filter is:
// the page's filter block names the option ("In Stock", data-option-id="1"),
// and ?specs=<that id> serves only in-stock products, server-side. The option
// id is re-read from the first page on every run; a page without it fails the
// store rather than guessing.
//
// CURRENCY. nopCommerce prices in the visitor's working currency. The switch
// (/changecurrency/<id>) is disallowed by robots.txt, so it is never called:
// the reader asks for the market's language (en-GB), and every price must
// carry the market's symbol ("£0.75") or the listing is dropped; a first page
// with no price in it fails the store.
import { currencyOf } from "./country";
import { decodeEntities, getWithRetry, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

const MAX_PAGES = 120;
const SYMBOL: Record<string, RegExp> = { GBP: /^£/, EUR: /^€|€$/, USD: /^\$|^US\$/, AUD: /^A?\$|^AU\$/, CAD: /^C?\$|^CA\$/, SGD: /^S?\$/ };
const LANGUAGE: Record<string, string> = { GBP: "en-GB,en;q=0.8", EUR: "en-IE,en;q=0.8", AUD: "en-AU,en;q=0.8", CAD: "en-CA,en;q=0.8", SGD: "en-SG,en;q=0.8" };

/** The option id of the "In Stock" value of the page's "Stock Status" filter. */
export function inStockSpecId(html: string): string | null {
  const group = /<strong>\s*Stock Status\s*<\/strong>([\s\S]*?)<\/ul>/i.exec(html);
  if (!group) return null;
  for (const m of group[1].matchAll(/data-option-id="(\d+)"[^>]*>\s*<label[^>]*>\s*([^<]+?)\s*<\/label>/g)) {
    if (/^in stock$/i.test(m[2].trim())) return m[1];
  }
  return null;
}

/** "&#xA3;1,234.50" in GBP → 1234.5; null if it is not in that currency. */
export function nopPrice(text: string, currency: string): number | null {
  const t = decodeEntities(text).replace(/\s+/g, "").trim();
  if (!(SYMBOL[currency] ?? /$^/).test(t)) return null;
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(t);
  return m ? Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "0"}`) : null;
}

/** The products on one (in-stock filtered) category page. */
export function parseNopPage(html: string, base: string, currency: string): { listings: StoreListing[]; cards: number; lastPage: number } {
  const listings: StoreListing[] = [];
  const chunks = html.split(/<div class="product-item"/).slice(1);
  for (const chunk of chunks) {
    const a = /class="product-title"><a href="([^"]+)" class="product-title__link">([^<]+)<\/a>/.exec(chunk);
    const p = /class="price actual-price">([^<]+)</.exec(chunk);
    if (!a || !p) continue;
    const price = nopPrice(p[1], currency);
    if (price == null) continue;
    const href = decodeEntities(a[1]);
    listings.push({
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      handle: href,
      url: href.startsWith("http") ? href : `${base}${href}`,
      variants: [{ title: "", price: price.toFixed(2), available: true }],
    });
  }
  const pages = [...html.matchAll(/[?&](?:amp;)?pagenumber=(\d+)/g)].map((m) => Number(m[1]));
  return { listings, cards: chunks.length, lastPage: Math.max(1, ...pages) };
}

export async function fetchNopStore(store: StoreInfo): Promise<StoreRead> {
  const handles = store.collections;
  if (!handles.length) return { products: [], failed: true, handles, note: "no category configured" };
  const allowed = await robotsAllows(store.base);
  const cur = currencyOf(store.country);
  const headers = { Accept: "text/html", "Accept-Language": LANGUAGE[cur] ?? "en;q=0.8" };
  const products: StoreListing[] = [];
  const seen = new Set<string>();
  for (const path of handles) {
    if (!allowed(path)) continue;
    const first = await getWithRetry(`${store.base}${path}`, { headers });
    if (!first || first.status !== 200) return { products, failed: true, handles, note: first ? `HTTP ${first.status} on ${path}` : "no response" };
    const spec = inStockSpecId(first.text);
    if (!spec) return { products, failed: true, handles, note: `no "In Stock" filter on ${path}` };
    let last = 1;
    for (let page = 1; page <= Math.min(last, MAX_PAGES); page++) {
      await sleep(REQUEST_DELAY_MS);
      const res = await getWithRetry(`${store.base}${path}?specs=${spec}&pagenumber=${page}`, { headers });
      if (!res || res.status !== 200) return { products, failed: true, handles, note: res ? `HTTP ${res.status} on ${path} page ${page}` : "no response" };
      const { listings, cards, lastPage } = parseNopPage(res.text, store.base, cur);
      if (page === 1 && cards && !listings.length) return { products, failed: true, handles, note: `no price in ${cur} on ${path}` };
      last = Math.max(last, lastPage);
      for (const l of listings) {
        if (seen.has(l.handle)) continue;
        seen.add(l.handle);
        products.push(l);
      }
      if (!cards) break;
    }
  }
  return { products, failed: false, handles };
}
