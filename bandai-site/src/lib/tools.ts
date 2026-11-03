// The tools that were Premium on Rift Compare, free here (owner, 2026-10-25:
// "all the premium features … just free to use for the public"). Each reads
// the daily summary only — no shards, no database.
import { meta, priceOf, productById, products, refCents, setById, summaryOf } from "./data";
import type { Market, Offer, Product } from "./site-types";

const fxOf = () => meta()?.fx ?? { USD: 1 };
export const toUsd = (o: Pick<Offer, "cents" | "currency">, fx = fxOf()) => Math.round(o.cents / (fx[o.currency] ?? 1));

export interface DealRow {
  id: number;
  slug: string;
  name: string;
  set: string;
  kind: Product["kind"];
  rarity: string | null;
  image: string | null;
  market: number; // USD cents
  source: string;
  offerMarket: Market;
  cents: number;
  currency: string;
  usd: number;
  saving: number; // % below TCGplayer market, converted
  url: string;
}

/** Deal Finder: every in-stock store / eBay offer below TCGplayer market, in
 *  every market (converted to USD for the comparison). Same sanity window as
 *  the importer: 8–60% under. */
export function dealRows(): DealRow[] {
  const fx = fxOf();
  const out: DealRow[] = [];
  for (const p of products()) {
    const market = refCents(p.id);
    if (!market || market < 300) continue;
    const sm = summaryOf(p.id);
    for (const o of sm.best) {
      if (o.source === "tcgplayer" || !o.inStock) continue;
      if (o.printing && o.printing !== "Normal" && sm.tcg.Normal) continue;
      const usd = toUsd(o, fx);
      const saving = Math.round((1 - usd / market) * 100);
      if (saving < 8 || saving > 60) continue;
      out.push({ id: p.id, slug: p.slug, name: p.name, set: setById(p.setId)?.name ?? "", kind: p.kind, rarity: p.rarity, image: p.image, market, source: o.source, offerMarket: o.market, cents: o.cents, currency: o.currency, usd, saving, url: o.url });
    }
  }
  // Capped so the page stays light; the biggest dollar savings come first.
  return out.sort((a, b) => b.market - b.usd - (a.market - a.usd)).slice(0, 1200);
}

export interface RisingRow {
  p: Product;
  cents: number;
  c7: number;
  c30: number | null;
  inStock: number;
  listed: number;
  score: number;
}

/** Rising Cards: climbing this week AND not falling over the month, weighted
 *  by how thin in-stock supply is (a rise with nothing left to buy is the
 *  strongest signal). */
export function risingRows(limit = 100): RisingRow[] {
  const out: RisingRow[] = [];
  for (const p of products()) {
    const sm = summaryOf(p.id);
    const cents = refCents(p.id);
    if (cents == null || cents < 200 || sm.change7d == null || sm.change7d <= 2) continue;
    if (sm.change30d != null && sm.change30d < 0) continue;
    const scarcity = sm.listedSources ? 1 - sm.inStockSources / sm.listedSources : 0;
    const score = sm.change7d * (1 + Math.max(0, (sm.change30d ?? 0) / 100)) * (1 + scarcity) * Math.log10(cents / 100 + 1);
    out.push({ p, cents, c7: sm.change7d, c30: sm.change30d, inStock: sm.inStockSources, listed: sm.listedSources, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface DemandRow {
  p: Product;
  cents: number;
  listed: number;
  inStock: number;
  soldOutPct: number;
}

/** Demand Finder: cards most stores list but few still have in stock — what
 *  players are buying out. Needs at least 10 stores listing it. */
export function demandRows(limit = 100): DemandRow[] {
  const out: DemandRow[] = [];
  for (const p of products()) {
    const sm = summaryOf(p.id);
    const cents = refCents(p.id);
    if (cents == null || cents < 100 || sm.listedSources < 10) continue;
    const soldOutPct = Math.round((1 - sm.inStockSources / sm.listedSources) * 100);
    out.push({ p, cents, listed: sm.listedSources, inStock: sm.inStockSources, soldOutPct });
  }
  return out.sort((a, b) => b.soldOutPct - a.soldOutPct || b.listed - a.listed || b.cents - a.cents).slice(0, limit);
}

// ── Best Basket ─────────────────────────────────────────────────────────────

export interface BasketLine {
  qty: number;
  query: string;
  product: { id: number; slug: string; name: string; set: string; marketUsd: number | null } | null;
  cheapest: Offer | null;
}
export interface StorePlan {
  source: string;
  covers: number; // lines this store has in stock
  total: number; // in its own currency, for the lines it covers
  currency: string;
}

/** Prices a list for one market: the cheapest in-stock offer per line (any
 *  source in that market, or US TCGplayer/eBay as the fallback), and every
 *  store's total for the lines it can fill. Postage is not included. */
export function priceBasket(lines: { qty: number; id: number | null; query: string }[], market: Market) {
  const fx = fxOf();
  const out: BasketLine[] = [];
  const stores = new Map<string, StorePlan>();
  for (const l of lines) {
    const p = l.id ? productById(l.id) : null;
    if (!p) {
      out.push({ qty: l.qty, query: l.query, product: null, cheapest: null });
      continue;
    }
    const offers = priceOf(p.id).offers.filter((o) => o.inStock);
    const local = offers.filter((o) => o.market === market);
    const pool = local.length ? local : offers.filter((o) => o.market === "US");
    const cheapest = pool.slice().sort((a, b) => toUsd(a, fx) - toUsd(b, fx))[0] ?? null;
    out.push({ qty: l.qty, query: l.query, product: { id: p.id, slug: p.slug, name: p.name, set: setById(p.setId)?.name ?? "", marketUsd: refCents(p.id) }, cheapest });
    const seen = new Set<string>();
    for (const o of local.sort((a, b) => a.cents - b.cents)) {
      if (seen.has(o.source)) continue;
      seen.add(o.source);
      const s = stores.get(o.source) ?? { source: o.source, covers: 0, total: 0, currency: o.currency };
      s.covers += 1;
      s.total += o.cents * l.qty;
      stores.set(o.source, s);
    }
  }
  const found = out.filter((l) => l.product).length;
  const plans = [...stores.values()].sort((a, b) => b.covers - a.covers || toUsd({ cents: a.total, currency: a.currency }, fx) - toUsd({ cents: b.total, currency: b.currency }, fx)).slice(0, 15);
  const cheapestUsd = out.reduce((a, l) => a + (l.cheapest ? toUsd(l.cheapest, fx) * l.qty : 0), 0);
  const marketUsd = out.reduce((a, l) => a + (l.product?.marketUsd ?? 0) * l.qty, 0);
  return { lines: out, plans, found, cheapestUsd, marketUsd };
}
