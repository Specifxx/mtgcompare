// Reading Magic: The Gathering listings from the stores in lib/stores.ts (S8 of the import, contract 6.1). Network only: what a title MEANS is decided in lib/match.ts.
// The Shopify reader is ported from RiftCompare's price-import.ts (collection discovery, ?country= pricing, the retry and "a failed collection keeps yesterday's rows" rules), widened for Magic-sized
// collections (the biggest singles collection is 170,000 products); the other platforms' readers live beside it (lib/shadowpos.ts, ecwid.ts, bigcommerce.ts,
// nopcommerce.ts, woocommerce.ts) and fetchStoreListings() picks one per store. Every reader returns the Shopify product shape plus the listing's own URL, so ONE path (matchListings) runs the matcher,
// the best in-stock variant, the currency and the plausibility rule for all of them.
//
// importStores (the stage scripts/import.ts calls in phase 2) NEVER writes a file: it pushes into ctx.offers (OfferStage, lib/import.ts) and aggregate() folds it. A read that did not complete pushes
// `ok: false` or nothing, so the pair's previous rows stay and read out of stock after 72 hours. The F2c rule (a read whose matched count fell under 50% of the last run's is held) lives in scripts/import.ts;
// this stage only reports `matched`.
//
// SCALE. A full pass is about 10,500 pages of 250 products. Four stores are read at once, a store's pages are one request delay apart, a store has a page budget (`maxPages`, default MAX_STORE_PAGES) shared
// by its collections, products are matched page by page and never held (a 120,000-product catalogue is never in memory), and the whole stage has a time budget after which the stores not yet started are
// left alone (their rows age) and a store in flight is a FAILED read (its rows stay).
import { bestVariant, anyVariant, buildCardIndex, buildNameIndex, collapseOffers, matchStoreVariants, plausibleSealedPrice, plausibleSinglePrice, type MatchRow, type OfferDraft, type SealedRef, type StoreMatchIndexes } from "./match";
import { fetchBigCommerceStore } from "./bigcommerce";
import { CONDITIONS, sealedKind, uidOf, type Finish } from "./constants";
import { MARKET_INDEX, currencyOf, isoCountry, type Country } from "./country";
import type { PxRow, SealedListFile, SetsFile } from "./data/plane/formats";
import { SEALED_FLAGS } from "./data/plane/formats";
import { fetchEcwidStore } from "./ecwid";
import { toUsdCents } from "./fx";
import type { ImportContext } from "./import";
import { fetchNopStore } from "./nopcommerce";
import { fetchText, fetchWithTimeout, isRateLimited, REQUEST_DELAY_MS, robotsAllows, sleep } from "./scrape";
import { fetchShadowposStore } from "./shadowpos";
import { STORES, enabledFeeds, platformOf, type StoreInfo, type StoreResult } from "./stores";
import { fetchWooStore } from "./woocommerce";

export interface ShopifyVariant {
  title: string;
  price: string;
  available: boolean;
  // The store's own SKU ("MH2-176-EN-NF-1", "FDN258Normal", "MTG-FIN-353-HASH-2"): the primary key of the matcher (lib/match.ts). products.json carries it; nothing strips it.
  sku?: string | null;
  // option1..3 of products.json ("Near Mint", "English", "Foil"): the finish and language of a variant are read from them.
  options?: string[];
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
 * One store's read. `failed` = something we KNOW holds its stock could not be read; the importer then keeps the store's existing rows rather than publishing a store with most of its stock missing.
 * `note` says why. With a `sink` the products go to the sink and are not kept: `products` is empty and `count` says how many were read.
 */
export interface StoreRead {
  products: StoreListing[];
  failed: boolean;
  handles: string[];
  note?: string;
  count?: number;
}

/** How a reader is driven: a page sink (stream, do not retain), a wall-clock deadline (epoch ms; past it the read is a FAILED read), and the price below which a price-sorted reader may stop. */
export interface ReadOptions {
  sink?: (page: StoreListing[]) => void;
  deadline?: number;
  stopBelowCents?: number;
}

// A collection handle we should NOT read: other languages, graded slabs, accessories, merchandise, and what the matcher answers "not-a-single" for anyway. Matching would reject most of what is in them;
// skipping them saves the requests and the risk.
export const SKIP_HANDLE =
  /japan|(?:^|-)jp(?:-|$)|japanese|chinese|korean|graded|grade|slab|psa|proxies|proxy|figure|funko|books|toy|model-kit|statue|sleeve|accessor|supplies|playmat|binder|plush|live-break|digital|zubehor|accesorios|tickets|(?:^|-)events?$|tournois|(?:^|-)pop(?:-|$)|lots|merch|apparel|storage|token|art-series|oversize/i;
// Sealed collections are read AFTER the singles, with a small page budget (SEALED_PAGES): the sealed pages quote them, the crawl does not depend on them.
export const SEALED_HANDLE = /sealed|booster|bundle|(?:^|-)decks?(?:-|$)|commander-decks?|precon|starter|display|prerelease|collector-box/i;
// A singles handle that is the superset of an in-stock one ("mtg-singles-all-products" beside "mtg-singles-in-stock"): skipped once the in-stock one was read.
const SUPERSET_HANDLE = /all-products|all-singles|singles-all|everything|catalog/i;
const IN_STOCK_HANDLE = /in-?stock|available/i;

const MAX_HANDLES = 24;
/** 250 products a page: 700 pages = 175,000 products, past the biggest singles collection found (Boutique La Pioche, 171,272). A store's `maxPages` lowers it. */
export const MAX_STORE_PAGES = 700;
/** Pages of sealed collections a store may spend (2,000 products). */
export const SEALED_PAGES = 8;
/** Stores read at once. */
export const STORE_CONCURRENCY = 4;
/** The stage stops starting stores after this long, and a read still running when it passes is a FAILED read. */
export const STAGE_BUDGET_MS = 100 * 60_000;
/** An unverified store is published only when it passes the probe's admission rule on this very read (10.26): this many matched in-stock listings. */
export const ADMIT_MIN_MATCHED_IN_STOCK = 20;

/** Magic collection handles from a store's Shopify sitemap: singles and sealed. */
export async function discoverMagicCollections(base: string): Promise<{ singles: string[]; sealed: string[] }> {
  const out = { singles: [] as string[], sealed: [] as string[] };
  const allowed = await robotsAllows(base);
  if (!allowed("/sitemap.xml")) return out;
  const index = await fetchText(`${base}/sitemap.xml`);
  let maps = index ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_collections/i.test(u)) : [];
  if (!maps.length) maps = [`${base}/sitemap_collections_1.xml`];
  const seen = new Set<string>();
  for (const [i, sm] of maps.slice(0, 6).entries()) {
    if (i) await sleep(REQUEST_DELAY_MS);
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (seen.has(h) || !/magic|mtg/i.test(h) || /\.(jpe?g|png|gif|webp|svg)$/i.test(h) || SKIP_HANDLE.test(h)) continue;
      seen.add(h);
      (SEALED_HANDLE.test(h) ? out.sealed : out.singles).push(h);
    }
  }
  return out;
}

/** products.json variants to the listing shape, with the option values the matcher reads. */
export function shopifyVariant(v: Record<string, unknown>): ShopifyVariant {
  const options = [v.option1, v.option2, v.option3].filter((o): o is string => typeof o === "string" && o !== "" && o !== "Default Title");
  return { title: String(v.title ?? ""), price: String(v.price ?? "0"), available: v.available === true, sku: typeof v.sku === "string" ? v.sku : null, options };
}

type PageResult = { products: ShopifyProduct[]; failed: boolean; note?: string; done: boolean };

async function fetchProductsPage(store: StoreInfo, handle: string, page: number): Promise<PageResult> {
  // ?country= is critical: Shopify Markets prices per visitor country, and the runner is in the US. Forcing the store's market gets its local price.
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
  if (!res) return { products: [], failed: true, note: "no response", done: true };
  if (isRateLimited(res)) return { products: [], failed: true, note: "rate limited", done: true };
  if (!res.ok) return { products: [], failed: res.status !== 404, note: res.status === 404 ? undefined : `HTTP ${res.status}`, done: true };
  let data: { products?: Record<string, unknown>[] };
  try {
    data = (await res.json()) as { products?: Record<string, unknown>[] };
  } catch {
    return { products: [], failed: true, note: "not JSON (a bot challenge?)", done: true }; // an HTML challenge / error page
  }
  const raw = data.products ?? [];
  const products = raw.map((p) => ({
    title: String(p.title ?? ""),
    handle: String(p.handle ?? ""),
    product_type: typeof p.product_type === "string" ? p.product_type : undefined,
    tags: Array.isArray(p.tags) || typeof p.tags === "string" ? (p.tags as string[] | string) : undefined,
    variants: Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]).map(shopifyVariant) : [],
  }));
  return { products, failed: false, done: raw.length < 250 };
}

/**
 * Every Magic product a store lists, de-duplicated across overlapping collections, singles first and a few sealed pages last. `failed` = a collection we KNOW holds its stock could not be read (or the
 * deadline passed); the importer then keeps the store's existing rows rather than publishing a store with most of its stock missing.
 */
export async function fetchStoreProducts(store: StoreInfo, o: ReadOptions = {}): Promise<StoreRead> {
  const discovered = await discoverMagicCollections(store.base);
  const configured = new Set(store.collections);
  const rank = (h: string): number => (IN_STOCK_HANDLE.test(h) ? 0 : /single/i.test(h) ? 1 : 2);
  // In-stock singles handles first (a quarter of the pages of an all-products one), then the configured (proven) handles, then the rest.
  const singles = [...new Set([...store.collections, ...discovered.singles])]
    .filter((h) => !SKIP_HANDLE.test(h))
    .sort((a, b) => rank(a) - rank(b) || Number(configured.has(b)) - Number(configured.has(a)))
    .slice(0, MAX_HANDLES);
  const sealed = discovered.sealed.slice(0, 2);
  const handles = [...singles, ...sealed];
  const seen = new Set<string>();
  const kept: StoreListing[] = [];
  let count = 0;
  let pagesLeft = store.maxPages ?? MAX_STORE_PAGES;
  let sealedLeft = SEALED_PAGES;
  let readInStock = false;
  const emit = (batch: StoreListing[]): void => {
    const fresh = batch.filter((p) => p.handle && !seen.has(p.handle));
    for (const p of fresh) seen.add(p.handle);
    count += fresh.length;
    if (o.sink) o.sink(fresh);
    else kept.push(...fresh);
  };
  for (const [i, h] of handles.entries()) {
    const isSealed = i >= singles.length;
    if (!isSealed && readInStock && SUPERSET_HANDLE.test(h)) continue;
    const allowed = await robotsAllows(store.base);
    if (!allowed(`/collections/${h}/products.json`)) continue;
    let got = 0;
    for (let page = 1; isSealed ? sealedLeft > 0 : pagesLeft > 0; page++) {
      if (o.deadline && Date.now() > o.deadline) return { products: kept, failed: true, handles, count, note: "the stage's time budget ran out" };
      if (page > 1 || i) await sleep(REQUEST_DELAY_MS);
      const r = await fetchProductsPage(store, h, page);
      if (isSealed) sealedLeft--;
      else pagesLeft--;
      if (r.failed) {
        if (configured.has(h) || (!isSealed && got > 0)) return { products: kept, failed: true, handles, count, note: `/collections/${h} could not be read${r.note ? ` (${r.note})` : ""}` };
        break;
      }
      got += r.products.length;
      emit(r.products);
      if (r.done) break;
    }
    if (!isSealed && got >= 100 && IN_STOCK_HANDLE.test(h)) readInStock = true;
  }
  return { products: kept, failed: false, handles, count };
}

/** Every Magic listing a store has, read by its platform's reader. */
export function fetchStoreListings(store: StoreInfo, o: ReadOptions = {}): Promise<StoreRead> {
  switch (platformOf(store)) {
    case "shadowpos":
      return fetchShadowposStore(store, { stopBelowCents: o.stopBelowCents, deadline: o.deadline });
    case "ecwid":
      return fetchEcwidStore(store);
    case "bigcommerce":
      return fetchBigCommerceStore(store);
    case "nopcommerce":
      return fetchNopStore(store);
    case "woocommerce":
      return fetchWooStore(store);
    case "feed":
      return Promise.resolve({ products: [], failed: true, handles: [], note: "a public feed is read by readFeed, not as a storefront" });
    default:
      return fetchStoreProducts(store, o);
  }
}

/** A listing's page: its own URL when the platform gives one, else Shopify's /products/<handle>. */
export function productUrl(store: StoreInfo, p: StoreListing): string {
  return p.url ?? `${store.base}/products/${p.handle}`;
}
/** The path the Buy button uses: the listing's URL below the store's origin, query and fragment kept. null for a URL on another host (the row is dropped, never rendered broken). */
export function listingPath(store: StoreInfo, p: StoreListing): string | null {
  const url = productUrl(store, p);
  if (!url.startsWith(store.base)) return null;
  const path = url.slice(store.base.length);
  return path === "" ? "/" : path.startsWith("/") ? path : null;
}

// ── Matching a read ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the matcher needs of the day's catalogue, built once per stage. */
export interface StageIndex {
  ix: StoreMatchIndexes;
  /** TCGplayer market price in USD cents of a unit (uid) and of a sealed product, for the plausibility rule. */
  marketOf(uid: number): number | null;
  sealedMarketOf(id: number): number | null;
  tracked: ReadonlySet<number>;
}
/**
 * Built from `ctx.match` (the cards) and the work tree (sealed products, their sets and the TCGplayer market prices): phase 2 starts from a published tree, so ctx.snapshot carries identities only and the
 * tree is the one place both phases agree on. A file that is missing or unreadable is empty, never a throw: the stage then matches cards and sealed words without a plausibility reference.
 */
export function buildStageIndex(ctx: Pick<ImportContext, "match" | "work" | "tracked">): StageIndex {
  const t = ctx.work;
  const json = <T,>(rel: string): T | null => { try { return t.has(rel) ? (JSON.parse(t.read(rel)) as T) : null; } catch { return null; } };
  const setCode = new Map<number, string>((json<SetsFile>("meta/sets.json")?.sets ?? []).map((r) => [r[0], r[3]]));
  const sealed: SealedRef[] = [];
  const sealedMarket = new Map<number, number | null>();
  for (const f of t.files()) {
    if (!/^sl\/list-\d+\.json$/.test(f)) continue;
    for (const r of json<SealedListFile>(f)?.s ?? []) {
      if (r[7] & SEALED_FLAGS.GONE) continue;
      sealed.push({ id: r[0], name: r[2], setCode: r[3] ? setCode.get(r[3]) ?? null : null, kind: sealedKind(r[2]) });
      sealedMarket.set(r[0], r[8]);
    }
  }
  const unit = new Map<number, number>();
  for (const f of t.files()) {
    if (!f.startsWith("px/")) continue;
    for (const r of json<{ p: PxRow[] }>(f)?.p ?? []) {
      if (r[1] != null) unit.set(r[0] * 2, r[1]);
      if (r[2] != null) unit.set(r[0] * 2 + 1, r[2]);
    }
  }
  const rows: MatchRow[] = ctx.match;
  return { ix: { cards: buildCardIndex(rows), names: buildNameIndex(rows), sealed }, marketOf: (u) => unit.get(u) ?? null, sealedMarketOf: (id) => sealedMarket.get(id) ?? null, tracked: ctx.tracked };
}

/** One store's matched listings, folded as they arrive. */
export interface StoreTally {
  products: number;
  matched: number;
  misses: Record<string, number>;
  drafts: OfferDraft[];
}
export const newTally = (): StoreTally => ({ products: 0, matched: 0, misses: {}, drafts: [] });

const bump = (t: StoreTally, k: string): void => void (t.misses[k] = (t.misses[k] ?? 0) + 1);

/** The offer ONE (product, finish) of a listing makes: the best in-stock variant (best condition, then cheapest), or the cheapest variant at all as an out-of-stock offer. null when no variant has a price. A sealed product carries no condition. */
export function offerDraftOf(productId: number, finish: Finish, variants: readonly ShopifyVariant[], path: string, sealed = false): OfferDraft | null {
  const best = bestVariant([...variants]);
  const price = best?.priceCents ?? anyVariant([...variants]);
  if (price == null) return null;
  return { productId, finish, priceCents: price, inStock: best !== null, condition: sealed ? null : best?.condition ?? null, path };
}

/**
 * The offers of ONE listing: the matcher answers once per VARIANT (a product with Normal and Foil variants answers with both finishes), the variants that answered the same (product, finish) compete (best
 * condition in stock, then cheapest; a unit with no buyable variant is an out-of-stock draft at its cheapest price). `matched` counts the LISTING once. The plausibility rule drops a price far from TCGplayer's
 * market of the finish it matched ("implausible-price"). A listing none of whose variants matched counts the first miss that is not a language miss.
 */
export function matchListing(store: StoreInfo, p: StoreListing, si: StageIndex, tally: StoreTally): void {
  tally.products++;
  const path = listingPath(store, p);
  const answers = matchStoreVariants(
    { title: p.title, tags: p.tags, productType: p.product_type, explicitFoil: store.explicitFoil, variants: p.variants.map((v) => ({ title: v.title, sku: v.sku, options: v.options })) },
    si.ix,
  );
  const groups = new Map<string, { id: number; finish: Finish; sealed: boolean; variants: ShopifyVariant[] }>();
  let miss: string | null = null;
  answers.forEach((a, i) => {
    if ("miss" in a) {
      if (!miss || (miss === "language-option" && a.miss !== "language-option")) miss = a.miss;
      return;
    }
    const k = `${a.id}.${a.finish}`;
    const g = groups.get(k) ?? { id: a.id, finish: a.finish, sealed: a.path === "sealed", variants: [] };
    g.variants.push(p.variants[i]!);
    groups.set(k, g);
  });
  if (!groups.size) {
    bump(tally, miss ?? "nokey");
    return;
  }
  tally.matched++;
  if (!path) {
    bump(tally, "foreign-host-url");
    return;
  }
  const cur = currencyOf(store.country);
  for (const g of groups.values()) {
    if (!g.sealed && !si.tracked.has(uidOf(g.id, g.finish))) continue; // aggregate drops an untracked unit: do not carry it
    const draft = offerDraftOf(g.id, g.sealed ? "N" : g.finish, g.variants, path, g.sealed);
    if (!draft) continue;
    const usd = toUsdCents(draft.priceCents, cur);
    const ok = g.sealed ? plausibleSealedPrice(usd, si.sealedMarketOf(g.id)) : plausibleSinglePrice(usd, si.marketOf(uidOf(g.id, g.finish)));
    if (!ok) {
      bump(tally, "implausible-price");
      continue;
    }
    tally.drafts.push(draft);
  }
}

const conditionIndex = (c: string | null): number | null => {
  const i = c ? (CONDITIONS as readonly string[]).indexOf(c) : -1;
  return i < 0 ? null : i;
};

/** Collapse a tally to one row per (product, finish) and push it into the stage. Returns what the result records. */
export function stageTally(ctx: Pick<ImportContext, "offers">, store: StoreInfo, t: StoreTally, si: StageIndex): { cards: number; sealed: number; inStock: number; collapsed: number } {
  const { rows, collapsed } = collapseOffers(t.drafts);
  const sealedIds = new Set(si.ix.sealed.map((s) => s.id));
  const market = MARKET_INDEX[store.country];
  let cards = 0, sealed = 0, inStock = 0;
  for (const r of rows) {
    const stock = r.inStock ? 1 : 0;
    if (sealedIds.has(r.productId)) {
      ctx.offers!.sealed.push({ productId: r.productId, market, store: store.id, priceCents: r.priceCents, condition: null, inStock: stock, path: r.path });
      sealed++;
    } else {
      ctx.offers!.cards.push({ uid: uidOf(r.productId, r.finish), market, store: store.id, priceCents: r.priceCents, condition: conditionIndex(r.condition), inStock: stock, path: r.path });
      cards++;
    }
    inStock += stock;
  }
  return { cards, sealed, inStock, collapsed };
}

// ── The public price feeds (OFF: FEED_SOURCES is empty, contract 10.11) ─────────────────────────────────────────────────────────────────────

interface CkRow { id: number; sku: string; scryfall_id: string | null; url: string; name: string; variation: string; edition: string; is_foil: string; price_retail: string; qty_retail: number; condition_values?: Record<string, string | number> }
interface MpRow { scryfall_id: string | null; available_quantity: number | null; price_cents: number | null; price_cents_lp_plus: number | null; price_cents_nm: number | null; price_cents_foil: number | null; price_cents_lp_plus_foil: number | null; price_cents_nm_foil: number | null; price_cents_etched: number | null; price_cents_lp_plus_etched: number | null; price_cents_nm_etched: number | null; url: string }

/** Scryfall id -> the product and finish a feed row sells. null = unknown or ambiguous (skipped, never guessed). */
export function feedUnitOf(byScry: ReadonlyMap<string, readonly MatchRow[]>, byStar: ReadonlyMap<string, readonly MatchRow[]>, sid: string, kind: "nonfoil" | "foil" | "etched"): { id: number; finish: Finish } | null {
  const own = byScry.get(sid) ?? [];
  const pick = (rs: readonly MatchRow[], finish: Finish): { id: number; finish: Finish } | null => (rs.length === 1 ? { id: rs[0]!.id, finish } : null);
  if (kind === "etched") return pick(own.filter((r) => r.etched && r.hasF), "F");
  if (kind === "nonfoil") return pick(own.filter((r) => !r.etched && r.hasN), "N");
  const plain = pick(own.filter((r) => !r.etched && r.hasF), "F");
  return plain ?? pick(byStar.get(sid) ?? [], "F");
}

function cents(v: unknown): number | null {
  const n = typeof v === "string" ? Math.round(parseFloat(v) * 100) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const pathOfUrl = (base: string, url: string): string | null => {
  try { const u = new URL(url, `${base}/`); return u.origin === base ? `${u.pathname}${u.search}` : null; } catch { return null; }
};

/** Card Kingdom's price list (api.cardkingdom.com/api/v2/pricelist): one row per printing and finish, keyed by Scryfall id; the retail price of the best condition in stock. */
export function cardKingdomDrafts(rows: readonly CkRow[], base: string, byScry: ReadonlyMap<string, readonly MatchRow[]>, byStar: ReadonlyMap<string, readonly MatchRow[]>): OfferDraft[] {
  const out: OfferDraft[] = [];
  for (const r of rows) {
    if (!r.scryfall_id) continue;
    const kind = r.is_foil === "true" ? (/etched/i.test(r.variation) ? "etched" : "foil") : "nonfoil";
    const unit = feedUnitOf(byScry, byStar, r.scryfall_id, kind);
    const path = pathOfUrl(base, r.url);
    if (!unit || !path) continue;
    const cv = r.condition_values ?? {};
    const ladder: [string, string][] = [["nm", "NM"], ["ex", "LP"], ["vg", "MP"], ["g", "HP"]];
    const inStock = ladder.find(([k]) => Number(cv[`${k}_qty`] ?? 0) > 0 && cents(cv[`${k}_price`]) !== null);
    const price = inStock ? cents(cv[`${inStock[0]}_price`]) : cents(r.price_retail);
    if (price == null) continue;
    out.push({ productId: unit.id, finish: unit.finish, priceCents: price, inStock: Boolean(inStock) && r.qty_retail > 0, condition: inStock ? inStock[1] : null, path });
  }
  return out;
}

/** Mana Pool's singles list (manapool.com/api/v1/prices/singles): one row per printing with a price per finish; the lowest listing, Near Mint where it states one. */
export function manaPoolDrafts(rows: readonly MpRow[], base: string, byScry: ReadonlyMap<string, readonly MatchRow[]>, byStar: ReadonlyMap<string, readonly MatchRow[]>): OfferDraft[] {
  const out: OfferDraft[] = [];
  for (const r of rows) {
    if (!r.scryfall_id) continue;
    const path = pathOfUrl(base, r.url);
    if (!path) continue;
    const inStock = (r.available_quantity ?? 0) > 0;
    const kinds: ["nonfoil" | "foil" | "etched", number | null, number | null, number | null][] = [
      ["nonfoil", r.price_cents_nm, r.price_cents_lp_plus, r.price_cents],
      ["foil", r.price_cents_nm_foil, r.price_cents_lp_plus_foil, r.price_cents_foil],
      ["etched", r.price_cents_nm_etched, r.price_cents_lp_plus_etched, r.price_cents_etched],
    ];
    for (const [kind, nm, lp, any] of kinds) {
      const price = nm ?? lp ?? any;
      if (price == null || price <= 0) continue;
      const unit = feedUnitOf(byScry, byStar, r.scryfall_id, kind);
      if (unit) out.push({ productId: unit.id, finish: unit.finish, priceCents: price, inStock, condition: nm != null ? "NM" : lp != null ? "LP" : null, path });
    }
  }
  return out;
}

const FEED_URL: Record<string, string> = { cardkingdom: "https://api.cardkingdom.com/api/v2/pricelist", manapool: "https://manapool.com/api/v1/prices/singles" };

async function readFeed(store: StoreInfo, match: readonly MatchRow[]): Promise<{ drafts: OfferDraft[]; products: number } | { error: string }> {
  const url = FEED_URL[store.key];
  if (!url) return { error: "no adapter" };
  let body: { data?: unknown[] };
  try {
    const res = await fetchWithTimeout(url, 120_000, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { error: isRateLimited(res) ? "rate limited" : `HTTP ${res.status}` };
    body = (await res.json()) as { data?: unknown[] };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 120) : "no response" };
  }
  if (!Array.isArray(body.data)) return { error: "not a price list" };
  const byScry = new Map<string, MatchRow[]>(), byStar = new Map<string, MatchRow[]>();
  const add = (m: Map<string, MatchRow[]>, k: string | null | undefined, r: MatchRow): void => { if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(r); };
  for (const r of match) { add(byScry, r.scryId, r); add(byStar, r.starScryId, r); }
  const drafts = store.key === "cardkingdom" ? cardKingdomDrafts(body.data as CkRow[], store.base, byScry, byStar) : manaPoolDrafts(body.data as MpRow[], store.base, byScry, byStar);
  return { drafts, products: body.data.length };
}

// ── The stage ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Shopify states the currency it charges in /meta.json. null = unreadable (not a refusal). */
export async function shopifyCurrency(store: StoreInfo): Promise<string | null> {
  const t = await fetchText(`${store.base}/meta.json`);
  if (!t) return null;
  try { const c = (JSON.parse(t) as { currency?: unknown }).currency; return typeof c === "string" && c ? c.toUpperCase() : null; } catch { return null; }
}

async function pool<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!); }));
  return out;
}

const emptyResult = (store: StoreInfo): StoreResult => ({ key: store.key, country: store.country, platform: platformOf(store), products: 0, cards: 0, sealed: 0, inStock: 0, failed: false, misses: {}, matched: 0, duplicatesCollapsed: 0 });

/** S8: read every store (or the `only` keys, or one market), match, and push the offers and the reads into ctx.offers. */
export async function importStores(ctx: ImportContext, o: { only?: string[]; market?: Country }): Promise<StoreResult[]> {
  if (!ctx.offers) ctx.offers = { cards: [], sealed: [], reads: [] };
  const si = buildStageIndex(ctx);
  const feeds = new Set(enabledFeeds().map((f) => f.key));
  let stores: readonly StoreInfo[] = STORES.filter((s) => platformOf(s) !== "feed" || feeds.has(s.key));
  if (o.only?.length) stores = stores.filter((s) => o.only!.includes(s.key));
  if (o.market) stores = stores.filter((s) => s.country === o.market);
  const deadline = Date.now() + STAGE_BUDGET_MS;
  // A tracked unit is worth at least the track floor (less its exit band) in USD: a price-sorted reader stops where even a plausible offer (0.3 x market) is under it.
  const stopBelowCents = Math.floor(ctx.cfg.trackFloorCents * ctx.cfg.trackExitRatio * 0.3);

  return pool(stores, STORE_CONCURRENCY, async (store): Promise<StoreResult> => {
    const res = emptyResult(store);
    const cur = currencyOf(store.country);
    if (store.currency && store.currency !== cur) {
      res.skipped = `charges ${store.currency}, market is ${cur}`;
      return res;
    }
    if (Date.now() > deadline) {
      res.skipped = "the stage's time budget ran out before this store";
      return res;
    }
    const at = new Date().toISOString();
    const read = (ok: boolean): void => void ctx.offers!.reads.push({ store: store.id, market: MARKET_INDEX[store.country], ok, at });
    const tally = newTally();
    try {
      if (platformOf(store) === "feed") {
        const f = await readFeed(store, ctx.match);
        if ("error" in f) { res.failed = true; res.note = f.error; read(false); return res; }
        tally.products = f.products;
        tally.matched = f.drafts.length;
        tally.drafts.push(...f.drafts.filter((d) => si.tracked.has(uidOf(d.productId, d.finish))));
      } else {
        if (store.status !== "verified" && platformOf(store) === "shopify") {
          const stated = await shopifyCurrency(store);
          if (stated && stated !== cur) { res.skipped = `charges ${stated}, market is ${cur}`; return res; }
        }
        const r = await fetchStoreListings(store, { sink: (page) => { for (const p of page) matchListing(store, p, si, tally); }, deadline, stopBelowCents });
        // Readers that do not stream hand their products back: match them now.
        for (const p of r.products) matchListing(store, p, si, tally);
        if (r.note) res.note = r.note.slice(0, 200);
        if (r.failed) {
          res.failed = true;
          res.products = tally.products;
          ctx.log(`  ! ${store.name} (${store.country}, ${res.platform}): ${r.note ?? "a configured collection could not be read"}: keeping its existing rows.`);
          read(false);
          return res;
        }
      }
    } catch (e) {
      res.failed = true;
      res.note = e instanceof Error ? e.message.slice(0, 200) : "read failed";
      read(false);
      return res;
    }
    res.products = tally.products;
    res.matched = tally.matched;
    res.misses = tally.misses;
    const inStockMatched = tally.drafts.filter((d) => d.inStock).length;
    if (store.status !== "verified" && inStockMatched < ADMIT_MIN_MATCHED_IN_STOCK) {
      // Not admitted (10.26): nothing is published for the pair, its health row says why.
      res.skipped = `not admitted: ${inStockMatched} matched in-stock listings (needs ${ADMIT_MIN_MATCHED_IN_STOCK})`;
      return res;
    }
    const staged = stageTally(ctx, store, tally, si);
    Object.assign(res, { cards: staged.cards, sealed: staged.sealed, inStock: staged.inStock, duplicatesCollapsed: staged.collapsed });
    read(true);
    ctx.log(`  ${store.country} ${store.name}${res.platform === "shopify" ? "" : ` [${res.platform}]`}: ${res.products} products, ${res.matched} matched -> ${res.cards} cards, ${res.sealed} sealed (${res.inStock} in stock)${res.note ? `, ${res.note}` : ""}`);
    return res;
  });
}
