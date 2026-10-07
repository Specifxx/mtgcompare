// ShadowPOS stores (the TCGLocal storefront): the second platform after
// Shopify. Network + parsing only; what a title MEANS is decided in
// lib/match.ts, exactly as for a Shopify listing.
//
// ── THE FEED ─────────────────────────────────────────────────────────────────
// Every ShadowPOS storefront serves its own catalogue search at
//   /api/advanced-search?game=onepiece&limit=100&offset=N&orderBy=title&inStockOnly=true
// which returns the HTML fragment the storefront's search page renders: one
// `div.product-item` per product, holding
//   - h2.productTitle  "Absalom (OP06-081 — Alternate Art)"  (TCGplayer's own
//     catalogue name, card number included),
//   - h3.productSubtitle  the set ("Wings of the Captain"),
//   - data-variants='[…]'  HTML-escaped JSON, one entry per printing/condition:
//     { title: "Normal / Near Mint", price: 0.25, available, inventory_quantity },
//   - a link to /products/<product id>.
// It is the public read the storefront itself makes, robots.txt allows it
// ("User-agent: *  Allow: /", only AI crawlers are refused), and it is the
// whole in-stock catalogue: about one request per 100 listings.
//
// ── CURRENCY ─────────────────────────────────────────────────────────────────
// price_money.currency is null. Every ShadowPOS store found is a US shop with a
// US street address pricing in dollars, so the reader refuses any store whose
// market is not US (tests/stores.test.ts pins that the registry has none).
//
// ── POLITENESS ───────────────────────────────────────────────────────────────
// A page is ~3 MB of HTML before gzip, and all of these storefronts are served
// by the same platform, so at most two ShadowPOS stores are read at once and
// pages are a second apart.
import { decodeEntities, getWithRetry, limiter, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

export const SHADOWPOS_PAGE = 100;
/** 60 × 100: the deepest store found holds ~2,150 in-stock One Piece listings. */
const MAX_PAGES = 60;
const PAGE_DELAY_MS = 1000;
const gate = limiter(2);

export const shadowposSearchPath = (offset: number) =>
  `/api/advanced-search?game=onepiece&limit=${SHADOWPOS_PAGE}&offset=${offset}&orderBy=title&inStockOnly=true`;

interface ShadowVariant {
  title?: string;
  price?: number | string | null;
  available?: boolean;
  inventory_quantity?: number | null;
}

/** The fragment's products, as listings. Null = not a search-results fragment. */
export function parseShadowposPage(html: string, base: string): StoreListing[] | null {
  if (!/data-advanced-search-results/.test(html)) return null;
  const out: StoreListing[] = [];
  for (const chunk of html.split(/<div class="product-item">/).slice(1)) {
    const vs = /data-variants='([^']*)'/.exec(chunk);
    const href = /href="(\/products\/[^"?#]+)"/.exec(chunk);
    const title = /productTitle"[^>]*>\s*([^<]+?)\s*<\/h2>/.exec(chunk);
    const set = /productSubtitle"[^>]*>\s*([^<]*?)\s*<\/h3>/.exec(chunk);
    if (!vs || !href || !title) continue;
    let variants: ShadowVariant[];
    try {
      variants = JSON.parse(decodeEntities(vs[1])) as ShadowVariant[];
    } catch {
      continue;
    }
    const name = decodeEntities(title[1]).replace(/\s+/g, " ").trim();
    const setName = set ? decodeEntities(set[1]).replace(/\s+/g, " ").trim() : "";
    out.push({
      // "Absalom (OP06-081 — Alternate Art) [Wings of the Captain]": the set in
      // trailing brackets, the BinderPOS shape lib/match.ts already reads.
      title: setName ? `${name} [${setName}]` : name,
      handle: href[1].slice("/products/".length),
      url: `${base}${href[1]}`,
      variants: variants.map((v) => {
        const price = typeof v.price === "number" ? v.price : parseFloat(String(v.price ?? ""));
        return {
          title: String(v.title ?? ""),
          price: Number.isFinite(price) ? price.toFixed(2) : "0",
          available: v.available === true && (v.inventory_quantity == null || v.inventory_quantity > 0),
        };
      }),
    });
  }
  return out;
}

/** Every in-stock One Piece listing a ShadowPOS store has. */
export function fetchShadowposStore(store: StoreInfo): Promise<StoreRead> {
  return gate(async () => {
    const handles = ["advanced-search?game=onepiece"];
    if (store.country !== "US") return { products: [], failed: true, handles, note: "ShadowPOS states no currency; only US stores are read" };
    const allowed = await robotsAllows(store.base);
    if (!allowed(shadowposSearchPath(0))) return { products: [], failed: false, handles, note: "robots.txt disallows the search" };
    const products: StoreListing[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      if (page) await sleep(PAGE_DELAY_MS);
      const res = await getWithRetry(`${store.base}${shadowposSearchPath(page * SHADOWPOS_PAGE)}`, { timeoutMs: 60000, headers: { Accept: "text/html, */*" }, retryDelayMs: 5000 });
      if (!res || res.status !== 200) {
        return { products, failed: true, handles, note: res ? (res.status === 429 ? "rate limited" : `HTTP ${res.status}`) : "no response" };
      }
      const got = parseShadowposPage(res.text, store.base);
      if (!got) return { products, failed: true, handles, note: "not a search-results page" };
      for (const p of got) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        products.push(p);
      }
      if (got.length < SHADOWPOS_PAGE) break;
    }
    return { products, failed: false, handles };
  });
}
