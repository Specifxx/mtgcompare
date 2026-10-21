// Reading a store's catalogue: Shopify's public /collections/<handle>/products.json
// and WooCommerce's public Store API (/wp-json/wc/store/v1). Both are the
// storefronts' own unauthenticated read endpoints — the same ones Rift Compare
// reads — and both are checked against the store's robots.txt first.
//
// Everything is normalised to FeedProduct so the importer has one code path.
import { REQUEST_DELAY_MS, get, robotsAllows, sleep } from "./scrape-http";
import { decodeEntities } from "./sealed-title";

export interface FeedVariant {
  priceCents: number;
  available: boolean;
  title?: string; // Shopify variant title: "Default Title", "Single Tin", "Display (10)", …
}

export interface FeedProduct {
  id: string; // handle (Shopify) or product id (Woo) — dedupes a product seen in two collections
  title: string;
  url: string;
  imageUrl: string | null;
  // Pixel size of imageUrl when the feed says (Shopify's images[] carries
  // width/height): the importer prefers a big photo over a thumbnail.
  imageWidth?: number;
  imageHeight?: number;
  variants: FeedVariant[];
  currency: string | null; // stated by the feed (Woo); Shopify's feed doesn't say
}

export interface CollectionRead {
  handle: string;
  ok: boolean; // false = 404 / blocked / unreadable (not "empty")
  products: FeedProduct[];
  // A page after the first failed: `products` is only the start of the
  // collection. The importer refuses the whole store read rather than replace
  // its rows with a fraction of its catalogue.
  truncatedAtPage?: number;
}

// ── Shopify ─────────────────────────────────────────────────────────────────

interface ShopifyVariantRaw {
  price?: string;
  available?: boolean;
  title?: string;
}
interface ShopifyProductRaw {
  handle: string;
  title: string;
  variants?: ShopifyVariantRaw[];
  images?: { src?: string; width?: number; height?: number }[];
}

const SHOPIFY_PAGE = 250;

export async function readShopifyCollection(
  base: string,
  handle: string,
  opts: { country?: string | null; maxPages?: number } = {},
): Promise<CollectionRead> {
  const path = `/collections/${handle}/products.json`;
  const allowed = await robotsAllows(base);
  if (!allowed(path)) return { handle, ok: false, products: [] };
  const products: FeedProduct[] = [];
  const maxPages = opts.maxPages ?? 8;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    const qs = new URLSearchParams({ limit: String(SHOPIFY_PAGE), page: String(page) });
    if (opts.country) qs.set("country", opts.country);
    const data = (await get(`${base}${path}?${qs}`)) as { products?: ShopifyProductRaw[] } | null;
    if (!data || !Array.isArray(data.products)) {
      if (page === 1) return { handle, ok: false, products: [] };
      return { handle, ok: true, products, truncatedAtPage: page };
    }
    for (const p of data.products) {
      products.push({
        id: p.handle,
        title: decodeEntities(p.title ?? ""),
        url: `${base}/products/${p.handle}`,
        imageUrl: p.images?.[0]?.src ?? null,
        imageWidth: p.images?.[0]?.width,
        imageHeight: p.images?.[0]?.height,
        variants: (p.variants ?? [])
          .map((v) => ({ priceCents: Math.round(parseFloat(v.price ?? "0") * 100), available: v.available === true, title: v.title }))
          .filter((v) => Number.isFinite(v.priceCents) && v.priceCents > 0),
        currency: null,
      });
    }
    if (data.products.length < SHOPIFY_PAGE) break;
  }
  return { handle, ok: true, products };
}

/**
 * The shop's BASE currency and home country (Shopify /meta.json).
 *
 * Not /cart.js: that reports the currency Shopify Markets picked for the
 * visitor's IP, so from a US machine (this one, and every GitHub Actions
 * runner) an AUD store answers "USD". The same geo-conversion applies to the
 * product feed itself, which is why every feed read passes ?country= with the
 * store's own country — without it a A$350 box reads as 251.00.
 */
export async function shopifyMeta(base: string, country?: string | null): Promise<{ currency: string | null; country: string | null }> {
  const meta = (await get(`${base}/meta.json`)) as { currency?: string; country?: string } | null;
  if (meta?.currency) return { currency: meta.currency, country: meta.country ?? null };
  // Some shops answer /meta.json with a 500. The storefront page states the
  // currency it is pricing in; asked for the store's own country, that is the
  // currency the feed will quote.
  if (!country) return { currency: null, country: null };
  const html = (await get(`${base}/?country=${country}`, "text")) as string | null;
  const active = html?.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/)?.[1] ?? null;
  const shopCountry = html?.match(/Shopify\.country\s*=\s*"([A-Z]{2})"/)?.[1] ?? null;
  return { currency: active, country: shopCountry };
}

// Collection handles that are never sealed Pokémon, whatever else they say.
const HANDLE_EXCLUDE =
  /\.(?:jpe?g|png|gif|webp|svg)$|singles?(?!-?(?:packs?|boosters?))|graded|psa|cgc|bgs|slab|japan|jpn|\bjp\b|-jp-|jp-|chinese|korean|\bkr\b|thai|indonesian|code|online|accessor|suppl|sleeve|binder|playmat|deck-?box|toploader|plush|figure|toy|funko|lego|apparel|cloth|merch|yugioh|yu-gi-oh|one-piece|onepiece|magic|mtg|lorcana|digimon|dragon-?ball|flesh|star-?wars|weiss|union-arena|gundam|riftbound|sport|basketball|nba|nfl|afl|nrl|football|soccer|baseball|ufc|wwe|f1|board-?game|dice|miniatur|warhammer|paint|break|sale-|clearance|vintage-(?:basketball|sports)|proxy|custom|mystery|repack/i;
const HANDLE_POKEMON = /pok[eé]?mon|pkmn|ptcg/i;
const HANDLE_SEALED = /sealed|booster|etb|elite-?trainer|bundle|collection-?box|collections|premium|\btins?\b|-tins?\b|tins?-|blister|\bpacks?\b|-packs?\b|packs?-|case|display/i;
const HANDLE_PREORDER = /^(?:all-|tcg-|tcgs-|card-games?-|trading-card-games?-|new-)?pre-?orders?(?:-[a-z]+)?$|^new-releases?$|^new-arrivals$/i;
const HANDLE_GENERIC_SEALED = /^(?:all-|tcg-)?(?:sealed(?:-products?)?|booster-box(?:es)?|elite-trainer-box(?:es)?|etbs?|booster-bundles?|booster-packs?|collection-box(?:es)?|tins)$/i;

/**
 * How promising a collection handle is for Pokémon sealed, or null to skip it.
 * Higher is better. Pokémon + sealed words beat a bare "pokemon" collection
 * (which usually also holds thousands of singles), which beats a store-wide
 * sealed or pre-order collection (read strictly — see importer).
 */
export function scoreCollection(handle: string): number | null {
  const h = handle.toLowerCase();
  if (HANDLE_EXCLUDE.test(h)) return null;
  const pokemon = HANDLE_POKEMON.test(h);
  const sealed = HANDLE_SEALED.test(h);
  if (pokemon && sealed) return 10 + (/english|-en$|^en-/.test(h) ? 1 : 0) - (h.length > 60 ? 1 : 0);
  if (pokemon && /^(?:all-)?(?:english-)?pok[eé]?mon(?:-tcg|-trading-card-game|-cards)?(?:-english)?$/.test(h)) return 7;
  if (pokemon) return 3; // per-set / themed Pokémon collections
  if (HANDLE_GENERIC_SEALED.test(h)) return 5;
  if (HANDLE_PREORDER.test(h)) return 4;
  return null;
}

/** Is a collection Pokémon-specific? Titles from any other collection must say "Pokémon" outright. */
export function isPokemonCollection(handle: string): boolean {
  return HANDLE_POKEMON.test(handle);
}

/** Every collection handle the store's sitemap names. */
export async function sitemapCollections(base: string): Promise<string[]> {
  const allowed = await robotsAllows(base);
  if (!allowed("/sitemap.xml")) return [];
  const index = (await get(`${base}/sitemap.xml`, "text")) as string | null;
  let maps = index
    ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!maps.length) maps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  for (const [i, url] of maps.slice(0, 6).entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const xml = (await get(url, "text")) as string | null;
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"\s]+)/g)) handles.add(decodeURIComponent(m[1]));
  }
  return [...handles];
}

/** Ranked candidate collections for discovery (best first). */
export function rankCollections(handles: string[]): string[] {
  return handles
    .map((h) => ({ h, s: scoreCollection(h) }))
    .filter((x): x is { h: string; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s || a.h.length - b.h.length)
    .map((x) => x.h);
}

// ── WooCommerce ─────────────────────────────────────────────────────────────

export const WOO_API = "/wp-json/wc/store/v1";

interface WooProductRaw {
  id: number;
  name: string;
  type?: string;
  permalink: string;
  is_in_stock: boolean;
  is_purchasable?: boolean;
  images?: { src?: string }[];
  prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
}
interface WooCategoryRaw {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

function wooProduct(p: WooProductRaw): FeedProduct | null {
  // A variable product's options (1 pack / 3 packs / box…) have different
  // prices the Store API doesn't list per option — we can't tell which one a
  // sealed product is, so it is skipped rather than guessed.
  if (p.type && p.type !== "simple") return null;
  const minor = p.prices?.currency_minor_unit ?? 2;
  const raw = Number(p.prices?.price ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const priceCents = Math.round((raw / Math.pow(10, minor)) * 100);
  return {
    id: String(p.id),
    title: decodeEntities(p.name ?? ""),
    url: p.permalink,
    imageUrl: p.images?.[0]?.src ?? null,
    variants: [{ priceCents, available: p.is_in_stock === true && p.is_purchasable !== false }],
    currency: p.prices?.currency_code ?? null,
  };
}

export async function wooCategories(base: string): Promise<WooCategoryRaw[]> {
  const out: WooCategoryRaw[] = [];
  for (let page = 1; page <= 5; page++) {
    const cats = (await get(`${base}${WOO_API}/products/categories?per_page=100&page=${page}`)) as WooCategoryRaw[] | null;
    if (!Array.isArray(cats) || !cats.length) break;
    out.push(...cats);
    if (cats.length < 100) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return out;
}

/** Products in one Woo category (by slug), or a keyword search when `slug` starts with "search:". */
export async function readWooCategory(
  base: string,
  slug: string,
  categoryIds: Map<string, number>,
  maxPages = 10,
): Promise<CollectionRead> {
  const allowed = await robotsAllows(base);
  if (!allowed(`${WOO_API}/products`)) return { handle: slug, ok: false, products: [] };
  let filter: string;
  if (slug.startsWith("search:")) filter = `search=${encodeURIComponent(slug.slice(7))}`;
  else {
    const id = categoryIds.get(slug);
    if (id == null) return { handle: slug, ok: false, products: [] };
    filter = `category=${id}`;
  }
  const products: FeedProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    const data = (await get(`${base}${WOO_API}/products?per_page=100&page=${page}&${filter}`)) as WooProductRaw[] | null;
    if (!Array.isArray(data)) {
      if (page === 1) return { handle: slug, ok: false, products: [] };
      return { handle: slug, ok: true, products, truncatedAtPage: page };
    }
    for (const p of data) {
      const fp = wooProduct(p);
      if (fp) products.push(fp);
    }
    if (data.length < 100) break;
  }
  return { handle: slug, ok: true, products };
}
