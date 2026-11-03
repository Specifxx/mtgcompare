// Every public page reads these committed files, never the database (the Rift
// Compare PUBLIC_DATA_MODE=files lesson, made the only mode here). They ship
// with the deployment (next.config.js outputFileTracingIncludes) and are read
// once per server instance.
import fs from "node:fs";
import path from "node:path";
import type { Catalog, EbayPick, Market, Meta, Offer, PriceEntry, Product, SetInfo } from "./site-types";
import { CURRENCY } from "./site-types";
import { readSetPrices, readSummary, type SummaryEntry } from "./price-store";
import { decodeOffer } from "./offer-codec";
import { referenceCents } from "./import/tcgcsv";
import type { Series } from "./series";

const DIR = path.join(process.cwd(), "data");

function read<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}

let cache: {
  catalog: Catalog;
  summary: Record<string, SummaryEntry>;
  meta: Meta | null;
  picks: EbayPick[];
  bySlug: Map<string, Product>;
  byId: Map<number, Product>;
  setBySlug: Map<string, SetInfo>;
  setById: Map<number, SetInfo>;
} | null = null;

function load() {
  if (cache) return cache;
  const catalog = read<Catalog>("public/catalog.json", { generatedAt: "", sets: [], products: [] });
  cache = {
    catalog,
    summary: readSummary(),
    meta: read<Meta | null>("public/meta.json", null),
    picks: read<EbayPick[]>("public/ebay-picks.json", []),
    bySlug: new Map(catalog.products.map((p) => [p.slug, p])),
    byId: new Map(catalog.products.map((p) => [p.id, p])),
    setBySlug: new Map(catalog.sets.map((s) => [s.slug, s])),
    setById: new Map(catalog.sets.map((s) => [s.id, s])),
  };
  return cache;
}

export const sets = () => load().catalog.sets;
export const products = () => load().catalog.products;
export const meta = () => load().meta;
export const ebayPicks = () => load().picks;
export const productBySlug = (slug: string) => load().bySlug.get(slug) ?? null;
export const productById = (id: number) => load().byId.get(id) ?? null;
export const setBySlug = (slug: string) => load().setBySlug.get(slug) ?? null;
export const setById = (id: number) => load().setById.get(id) ?? null;

const EMPTY: PriceEntry = { tcg: {}, offers: [], change7d: null, change30d: null };
// Full offers live in one file per set, loaded only by pages that show them.
const shards = new Map<number, Record<string, PriceEntry>>();
export function priceOf(id: number): PriceEntry {
  const p = productById(id);
  if (!p) return EMPTY;
  if (!shards.has(p.setId)) shards.set(p.setId, readSetPrices(p.setId));
  return shards.get(p.setId)![id] ?? EMPTY;
}

export interface Summary {
  tcg: PriceEntry["tcg"];
  change7d: number | null;
  change30d: number | null;
  inStockSources: number;
  listedSources: number;
  /** Cheapest in-stock offer per market, plus TCGplayer. */
  best: Offer[];
  /** Cheapest in-stock eBay listing per market (ad strips only, never a price claim). */
  ebay: Offer[];
}
const EMPTY_SUMMARY: Summary = { tcg: {}, change7d: null, change30d: null, inStockSources: 0, listedSources: 0, best: [], ebay: [] };
const decoded = new Map<number, Summary>();
/** Everything a list page needs, without loading the per-set shards. */
export function summaryOf(id: number): Summary {
  const hit = decoded.get(id);
  if (hit) return hit;
  const e = load().summary[id];
  if (!e) return EMPTY_SUMMARY;
  const s: Summary = { tcg: e.t, change7d: e.c7, change30d: e.c30, inStockSources: e.n, listedSources: e.l ?? e.n, best: e.b.map(decodeOffer).filter((o): o is Offer => !!o), ebay: (e.e ?? []).map(decodeOffer).filter((o): o is Offer => !!o) };
  decoded.set(id, s);
  return s;
}
export const refCents = (id: number): number | null => referenceCents(summaryOf(id).tcg);

export function historyOf(p: Product): Series {
  const h = read<Record<string, Series>>(`history/${p.setId}.json`, {});
  return h[p.id] ?? [];
}

export function productsInSet(setId: number) {
  return products().filter((p) => p.setId === setId);
}

export function byValue(list: Product[]) {
  return list
    .map((p) => ({ p, v: refCents(p.id) ?? -1 }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.p);
}

/** Released sets, newest first, that have cards (no promo / token groups first). */
export function mainSets() {
  return sets().filter((s) => s.productCount > 0);
}

export function latestReleasedSet(): SetInfo | null {
  return (
    sets().find((s) => !s.upcoming && productsInSet(s.id).filter((p) => p.kind === "card").length > 60) ?? null
  );
}
export function nextUpcomingSet(): SetInfo | null {
  const up = sets().filter((s) => s.upcoming).sort((a, b) => (a.releasedOn ?? "").localeCompare(b.releasedOn ?? ""));
  return up[0] ?? null;
}

export interface Mover {
  p: Product;
  cents: number;
  change: number;
}
export function movers(days: 7 | 30 = 7, minCents = 200): { up: Mover[]; down: Mover[] } {
  const rows: Mover[] = [];
  for (const p of products()) {
    const e = summaryOf(p.id);
    const c = days === 7 ? e.change7d : e.change30d;
    const cents = refCents(p.id);
    if (c == null || cents == null || cents < minCents) continue;
    rows.push({ p, cents, change: c });
  }
  return {
    up: rows.filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 50),
    down: rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, 50),
  };
}

export interface Deal {
  p: Product;
  offer: Offer;
  market: number;
  saving: number; // percent below TCGplayer market
}
/** In-stock store/eBay offers below TCGplayer market (USD offers only, so the
 *  comparison is like-for-like). */
/** A store deal inside one market (the seasonal sale pages): the cheapest in-stock store at least
 * 10% under the median of that market's in-stock stores (3+ stores), in that market's own currency,
 * stores only (never eBay, Amazon or TCGplayer). Biggest saving × value first, one row per product. */
export interface StoreDeal {
  p: Product;
  offer: Offer;
  median: number;
  stores: number;
  saving: number; // percent below the median store
}
export function storeDealsIn(m: Market, limit = 24, kind?: Product["kind"]): StoreDeal[] {
  const out: StoreDeal[] = [];
  const cur = CURRENCY[m];
  for (const p of products()) {
    if (kind && p.kind !== kind) continue;
    const sm = summaryOf(p.id);
    if (sm.inStockSources < 3 || !sm.best.some((o) => o.market === m && o.source !== "tcgplayer")) continue;
    const cheapest = new Map<string, Offer>();
    for (const o of priceOf(p.id).offers) {
      if (o.market !== m || o.currency !== cur || !o.inStock || o.preorder) continue;
      if (o.source === "ebay" || o.source === "amazon" || o.source === "tcgplayer") continue;
      const had = cheapest.get(o.source);
      if (!had || o.cents < had.cents) cheapest.set(o.source, o);
    }
    if (cheapest.size < 3) continue;
    const list = [...cheapest.values()].sort((a, b) => a.cents - b.cents);
    const c = list.map((o) => o.cents);
    const mid = c.length >> 1;
    const median = c.length % 2 ? c[mid] : Math.round((c[mid - 1] + c[mid]) / 2);
    if (median < 500) continue;
    const saving = Math.round((1 - list[0].cents / median) * 100);
    // Over 45% under the middle store is far likelier a wrong match (a single pack, another language) than a sale.
    if (saving >= 10 && saving <= 45) out.push({ p, offer: list[0], median, stores: list.length, saving });
  }
  return out.sort((a, b) => b.median * b.saving - a.median * a.saving).slice(0, limit);
}

export function deals(limit = 40): Deal[] {
  const out: Deal[] = [];
  for (const p of products()) {
    const market = refCents(p.id);
    if (!market || market < 500) continue;
    const sm = summaryOf(p.id);
    for (const o of sm.best) {
      if (o.source === "tcgplayer" || !o.inStock || o.currency !== "USD") continue;
      if (o.printing && o.printing !== "Normal" && sm.tcg.Normal) continue;
      const saving = Math.round((1 - o.cents / market) * 100);
      if (saving >= 8 && saving <= 60) out.push({ p, offer: o, market, saving });
    }
  }
  return out.sort((a, b) => b.market * b.saving - a.market * a.saving).slice(0, limit);
}
