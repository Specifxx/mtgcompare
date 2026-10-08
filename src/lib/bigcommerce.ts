// BigCommerce stores whose category pages are rendered on the server (Stencil's
// default `card` template). Network + parsing only; lib/match.ts decides what a
// title means.
//
// BigCommerce has no anonymous JSON catalogue (its storefront GraphQL needs a
// token not every theme exposes), so this reads the plain category page,
// ?limit=100&page=N (Stencil's own page-size option; a theme that ignores it
// serves its default 40), the way a shopper browses it: one
// `<article class="card">` per product with its title, its price ("22.00$ AUD")
// and either an "Add to Cart" or an "Out of stock" button. A store's ~5,000
// singles are ~50 requests.
//
// robots.txt on these stores disallows the faceted URLs (?_bc_fsnf=1), sort
// parameters and search.php — none of which this reads. A store whose category
// list is rendered by client-side JavaScript (GameNerdz's StorePass grid) has
// no products in that HTML at all, and is not readable this way.
import { currencyOf } from "./country";
import { decodeEntities, getWithRetry, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

const MAX_PAGES = 120;

/** "3,096.00$ AUD" → 3096; null when the text names another currency or no number. */
export function parseMoney(text: string, currency: string): number | null {
  const t = decodeEntities(text).trim();
  const codes = t.match(/\b[A-Z]{3}\b/g) ?? [];
  if (codes.some((c) => c !== currency)) return null;
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(t);
  if (!m) return null;
  return Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "0"}`);
}

/** The products on one category page (an empty list past the last page). */
export function parseBigCommercePage(html: string, currency: string): StoreListing[] {
  const out: StoreListing[] = [];
  for (const chunk of html.split(/<article class="card\b/).slice(1)) {
    const a = /<h3 class="card-title">\s*<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/.exec(chunk);
    if (!a) continue;
    const priceText = /data-product-price-with(?:out)?-tax[^>]*>([^<]+)</.exec(chunk)?.[1] ?? "";
    const price = parseMoney(priceText, currency);
    if (price == null) continue;
    const soldOut = /button--outstock|>\s*Out of stock\s*</i.test(chunk);
    const buyable = /Add to Cart/i.test(chunk);
    const url = decodeEntities(a[1]);
    out.push({
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      handle: url,
      url,
      variants: [{ title: "", price: price.toFixed(2), available: buyable && !soldOut }],
    });
  }
  return out;
}

export async function fetchBigCommerceStore(store: StoreInfo): Promise<StoreRead> {
  const handles = store.collections;
  if (!handles.length) return { products: [], failed: true, handles, note: "no category configured" };
  const allowed = await robotsAllows(store.base);
  const cur = currencyOf(store.country);
  const products: StoreListing[] = [];
  const seen = new Set<string>();
  for (const path of handles) {
    if (!allowed(path)) continue;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (products.length || page > 1) await sleep(REQUEST_DELAY_MS);
      const res = await getWithRetry(`${store.base}${path}?limit=100&page=${page}`, { headers: { Accept: "text/html" }, timeoutMs: 45000 });
      if (!res || res.status !== 200) return { products, failed: true, handles, note: res ? `HTTP ${res.status} on ${path}` : "no response" };
      const got = parseBigCommercePage(res.text, cur);
      if (page === 1 && !got.length) {
        // A first page with product cards but no price in the market's currency is
        // a currency problem, not an empty category; with no cards at all, the grid
        // is rendered client-side. Either way, nothing here can be trusted.
        const cards = (res.text.match(/<article class="card\b/g) ?? []).length;
        return { products, failed: true, handles, note: cards ? `no price in ${cur} on ${path}` : `no server-rendered product grid on ${path}` };
      }
      // Past the last page BigCommerce serves an empty grid (or nothing new).
      const fresh = got.filter((p) => !seen.has(p.handle));
      for (const p of fresh) {
        seen.add(p.handle);
        products.push(p);
      }
      if (!fresh.length) break;
    }
  }
  return { products, failed: false, handles };
}
