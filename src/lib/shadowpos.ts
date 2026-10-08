// ShadowPOS stores (the TCGLocal storefront): the second platform after Shopify. Network + parsing only; what a title MEANS is decided in lib/match.ts, exactly as for a Shopify listing.
//
// ── THE FEED ─────────────────────────────────────────────────────────────────
// Every ShadowPOS storefront serves its own catalogue search at
//   /api/advanced-search?game=mtg&limit=50&offset=N&orderBy=price-desc&inStockOnly=true
// which returns the HTML fragment the storefront's search page renders: one `div.product-item` per product, holding
//   - h2.productTitle     "The One Ring (0246)" / "Mana Vault (308/331)" / "Scalding Tarn" (TCGplayer's own catalogue name; the collector number is in the title when the store prints one),
//   - h3.productSubtitle  the SET NAME ("The Lord of the Rings: Tales of Middle-earth"),
//   - data-variants='[…]' HTML-escaped JSON, one entry per finish and condition:
//     { title: "Foil / Near Mint", price: 119, available, inventory_quantity }   (`price` is DOLLARS, not cents),
//   - a link to /products/<product id>.
// It is the public read the storefront itself makes, it is the whole IN-STOCK catalogue, and `orderBy=price-desc` returns the dearest first, so a crawl stops at the track floor instead of reading the
// long tail of one-dollar cards (13 of 13 stores serve game=mtg; probed 2026-10-07). Serialized cards print "(0338 — Serialized)".
//
// ── CURRENCY ─────────────────────────────────────────────────────────────────
// price_money.currency is null. Every ShadowPOS store found is a US shop with a US street address pricing in dollars, so the reader refuses any store whose market is not US
// (tests/stores.test.ts pins that the registry has none).
//
// ── POLITENESS ───────────────────────────────────────────────────────────────
// A listing is ~33 KB of HTML (a 50-listing page is ~1.6 MB before gzip) and all of these storefronts are served by the same platform, so at most two ShadowPOS stores are read at once and pages
// are a second apart.
import { decodeEntities, getWithRetry, limiter, robotsAllows, sleep } from "./scrape";
import type { StoreListing, StoreRead } from "./store-import";
import type { StoreInfo } from "./stores";

export const SHADOWPOS_PAGE = 50;
/** 120 x 50: the deepest in-stock Magic catalogue found holds a few thousand listings above the track floor. */
const MAX_PAGES = 120;
const PAGE_DELAY_MS = 1000;
const gate = limiter(2);

export const shadowposSearchPath = (offset: number) =>
  `/api/advanced-search?game=mtg&limit=${SHADOWPOS_PAGE}&offset=${offset}&orderBy=price-desc&inStockOnly=true`;

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
      // "The One Ring (0246) [The Lord of the Rings: Tales of Middle-earth]": the set in
      // trailing brackets, the number + set name shape lib/match.ts reads.
      title: setName ? `${name} [${setName}]` : name,
      handle: href[1].slice("/products/".length),
      url: `${base}${href[1]}`,
      variants: variants.map((v) => {
        const price = typeof v.price === "number" ? v.price : parseFloat(String(v.price ?? ""));
        return {
          title: String(v.title ?? ""),
          price: Number.isFinite(price) ? price.toFixed(2) : "0",
          available: v.available === true && (v.inventory_quantity == null || v.inventory_quantity > 0),
          options: String(v.title ?? "").split("/").map((o) => o.trim()).filter(Boolean),
        };
      }),
    });
  }
  return out;
}

/** The dearest price on a parsed page, in cents: what a price-sorted crawl compares with the floor. */
export const pageMaxCents = (page: readonly StoreListing[]): number => Math.round(Math.max(0, ...page.flatMap((p) => p.variants.map((v) => parseFloat(v.price) || 0))) * 100);

/**
 * Every in-stock Magic listing a ShadowPOS store has above `stopBelowCents`. The search is sorted dearest first: the read ends after the first page whose dearest listing is under the stop price
 * (everything after it is cheaper), after a short page, or at MAX_PAGES. `deadline` (epoch ms) ends a read that runs out of the stage's time as a FAILED one.
 */
export function fetchShadowposStore(store: StoreInfo, o: { stopBelowCents?: number; deadline?: number } = {}): Promise<StoreRead> {
  return gate(async () => {
    const handles = ["advanced-search?game=mtg"];
    if (store.country !== "US") return { products: [], failed: true, handles, note: "ShadowPOS states no currency; only US stores are read" };
    const allowed = await robotsAllows(store.base);
    if (!allowed(shadowposSearchPath(0))) return { products: [], failed: false, handles, note: "robots.txt disallows the search" };
    const products: StoreListing[] = [];
    const seen = new Set<string>();
    const maxPages = store.maxPages ?? MAX_PAGES;
    for (let page = 0; page < maxPages; page++) {
      if (o.deadline && Date.now() > o.deadline) return { products, failed: true, handles, note: "the stage's time budget ran out" };
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
      if (o.stopBelowCents && pageMaxCents(got) < o.stopBelowCents) break;
    }
    return { products, failed: false, handles };
  });
}
