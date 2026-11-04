// Reading a store whose storefront has no public product feed, from the plain
// category pages a shopper browses — BigCommerce (Stencil themes) and Shopware 6.
// Network and parsing only; identify() (sealed-title.ts) still decides what a
// title means, and the importer applies the same currency, floor and staleness
// rules as to a Shopify or WooCommerce read.
//
// BigCommerce has no anonymous JSON catalogue (its storefront GraphQL needs a
// token not every theme exposes), so this reads /<category-path>/?limit=100&page=N
// (Stencil's own page-size option; a theme that ignores it serves its default 40):
// one `<article class="card …">` per product with its title, its price
// ("699.95$ AUD", "$24.99") and an "Add to Cart" or "Out of stock" button. A
// theme whose grid is drawn in the browser (Star City Games, ToyWiz, Game Nerdz)
// has no product in its HTML, and is not readable this way: the first page
// returns no cards, and the read fails rather than reporting an empty category.
// Ported from OP Compare's lib/bigcommerce.ts (2026-11-04).
//
// Shopware 6 (Miniature Market) renders `<div class="card product-box">` per
// product, paged with ?p=N; a box with a "btn-buy" button is in stock, one with
// a "stock-notify" form is not.
//
// Both honour robots.txt, read one page at a time with the usual delay, and
// never touch search, faceted (?_bc_fsnf=) or sort URLs, which these stores
// disallow.
import type { CollectionRead, FeedProduct } from "./feeds";
import { get, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape-http";
import { decodeEntities } from "./sealed-title";

export type HtmlPlatform = "bigcommerce" | "shopware";

const MAX_PAGES_DEFAULT = 8;

/** "3,096.00$ AUD" / "$24.99" / "£5.49" → cents; null when the text names another currency or no number. */
export function parseMoneyCents(text: string, currency: string): number | null {
  const t = decodeEntities(text).trim();
  const codes = t.match(/\b[A-Z]{3}\b/g) ?? [];
  if (codes.some((c) => c !== currency)) return null;
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(t);
  if (!m) return null;
  const cents = Math.round(Number(`${m[1].replace(/,/g, "")}.${m[2] ?? "0"}`) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/** The ISO code a page states for its prices (JSON-LD or a data attribute), if any. */
export function pageCurrency(html: string): string | null {
  return /"priceCurrency"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1] ?? /currency[_-]?code["']?\s*[:=]\s*["']([A-Z]{3})/i.exec(html)?.[1] ?? null;
}

function attr(chunk: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(chunk);
  return m ? decodeEntities(m[1]) : null;
}

/** The products on one BigCommerce (Stencil) category page; empty past the last page. */
export function parseBigCommercePage(html: string, currency: string): FeedProduct[] {
  const out: FeedProduct[] = [];
  const stated = pageCurrency(html);
  for (const chunk of html.split(/<article\b[^>]*\bclass="card\b/).slice(1)) {
    const a = /<h[2-5] class="card-title">\s*<a\b([^>]*)>([^<]+)<\/a>/.exec(chunk);
    if (!a) continue;
    const url = attr(a[1], "href");
    if (!url) continue;
    const priceText = /data-product-price-with(?:out)?-tax[^>]*>([^<]+)</.exec(chunk)?.[1] ?? "";
    const priceCents = parseMoneyCents(priceText, currency);
    if (priceCents == null) continue;
    const soldOut = /button--outstock|>\s*Out of stock\s*</i.test(chunk);
    const buyable = /Add to Cart|Pre-?Order/i.test(chunk);
    const code = priceText.match(/\b[A-Z]{3}\b/)?.[0] ?? stated;
    const img = /<img[^>]*\bsrc="([^"]+)"/.exec(chunk)?.[1] ?? null;
    out.push({
      id: url.replace(/^https?:\/\/[^/]+/, ""),
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      url,
      imageUrl: img && /^https?:/.test(img) ? img : null,
      variants: [{ priceCents, available: buyable && !soldOut }],
      currency: code,
    });
  }
  return out;
}

/** The products on one Shopware 6 listing page; empty past the last page. */
export function parseShopwarePage(html: string, currency: string): FeedProduct[] {
  const out: FeedProduct[] = [];
  const stated = pageCurrency(html);
  for (const chunk of html.split(/<div class="card product-box\b/).slice(1)) {
    const a = /<a\s+href="([^"]+)"\s+class="product-name[^"]*"\s+title="([^"]*)"/.exec(chunk);
    if (!a) continue;
    const priceText = /<span class="product-price">\s*([^<]+)</.exec(chunk)?.[1] ?? "";
    const priceCents = parseMoneyCents(priceText, currency);
    if (priceCents == null) continue;
    const available = /btn-buy/.test(chunk) && !/stock-notify/.test(chunk);
    const img = /<img[^>]*\bsrc="([^"]+)"/.exec(chunk)?.[1] ?? null;
    const url = decodeEntities(a[1]);
    out.push({
      id: url.replace(/^https?:\/\/[^/]+/, ""),
      title: decodeEntities(a[2]).replace(/\s+/g, " ").trim(),
      url,
      imageUrl: img && /^https?:/.test(img) ? img : null,
      variants: [{ priceCents, available }],
      currency: priceText.match(/\b[A-Z]{3}\b/)?.[0] ?? stated,
    });
  }
  return out;
}

function pageUrl(base: string, path: string, platform: HtmlPlatform, page: number): string {
  const sep = path.includes("?") ? "&" : "?";
  return platform === "shopware" ? `${base}${path}${sep}limit=100&p=${page}` : `${base}${path}${sep}limit=100&page=${page}`;
}

/**
 * Every product in one category page (a path such as
 * "/sealed-product/magic-the-gathering-sealed/"), page by page until a page
 * adds nothing new. A first page with no product grid is a failed read (the
 * theme draws it in the browser, or the path is gone), never an empty category.
 */
export async function readHtmlCategory(base: string, path: string, platform: HtmlPlatform, currency: string, maxPages = MAX_PAGES_DEFAULT): Promise<CollectionRead> {
  const allowed = await robotsAllows(base);
  if (!allowed(path)) return { handle: path, ok: false, products: [] };
  const products: FeedProduct[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    const html = (await get(pageUrl(base, path, platform, page), "text")) as string | null;
    if (!html) {
      if (page === 1) return { handle: path, ok: false, products: [] };
      return { handle: path, ok: true, products, truncatedAtPage: page };
    }
    const got = platform === "shopware" ? parseShopwarePage(html, currency) : parseBigCommercePage(html, currency);
    if (page === 1 && !got.length) return { handle: path, ok: false, products: [] };
    const fresh = got.filter((p) => !seen.has(p.id));
    for (const p of fresh) {
      seen.add(p.id);
      products.push(p);
    }
    if (!fresh.length || got.length < 20) break;
  }
  return { handle: path, ok: true, products };
}

/** Category paths a BigCommerce store lists in its categories sitemap (/xmlsitemap.php?type=categories). */
export async function bigCommerceCategories(base: string): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const xml = (await get(`${base}/xmlsitemap.php?type=categories&page=${page}`, "text")) as string | null;
    if (!xml) break;
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1].trim()));
    let n = 0;
    for (const loc of locs) {
      if (!loc.startsWith(base)) continue;
      out.push(loc.slice(base.length));
      n++;
    }
    if (!n) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return out;
}
