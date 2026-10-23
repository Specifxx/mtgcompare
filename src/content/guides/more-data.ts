// The live reads and the pure arithmetic behind the data-driven guides added on 2026-10-23 (cost per pack, Play vs Collector by set,
// Universes Beyond, Commander decks, Secret Lair, gifts, the release calendar, the weekly market wrap). Every number a guide prints
// comes from here, from the region's current ProductStat rows (through src/lib/db.ts, which serves data/public) or, for the wrap,
// from data/public/price-history.json (src/lib/price-history.ts). Reads are one market each and capped.
//
// Pack counts are lib/packs.ts's alone (packsForLabel): a product it gives no count for gets no per-pack price. Nothing here
// converts a currency: a gift's price cap is a round figure in the region's own currency (GIFT_CAP), stated as such on the page.
import { prisma } from "@/lib/db";
import { cardSelect, OPEN, toCard, type ProductCardData } from "@/lib/data";
import { packsForLabel, perPackCents } from "@/lib/packs";
import { dailySeries, MIN_DAYS, readPriceHistory, type PriceHistory } from "@/lib/price-history";
import type { Market } from "@/lib/regions";
import { SETS } from "@/lib/sets";

// ─── Reads ─────────────────────────────────────────────────────────────────────

/** A market's open products of one type label, cheapest first (or dearest first), at most `take`. */
export async function openOfType(market: Market, label: string, take: number, order: "asc" | "desc" = "asc", extra: Record<string, unknown> = {}): Promise<ProductCardData[]> {
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, lowestPriceCents: { gt: 0, ...extra }, product: { productType: label } },
    orderBy: { lowestPriceCents: order },
    take,
    select: cardSelect,
  });
  return rows.map(toCard);
}

/** A market's open products of the given sets (by code), cheapest first, at most `take`. */
export async function openOfSets(market: Market, codes: readonly string[], take: number): Promise<ProductCardData[]> {
  if (!codes.length) return [];
  const rows = await prisma.productStat.findMany({
    where: { market, ...OPEN, lowestPriceCents: { gt: 0 }, product: { setCode: { in: [...codes] } } },
    orderBy: { lowestPriceCents: "asc" },
    take,
    select: cardSelect,
  });
  return rows.map(toCard);
}

/** How many open products of a type label the market has. */
export async function openCount(market: Market, label: string): Promise<number> {
  return prisma.productStat.count({ where: { market, ...OPEN, product: { productType: label } } });
}

/** Per set code: the products the market lists, and how many are open (in stock or on pre-order). */
export async function setCountsOf(market: Market, codes: readonly string[]): Promise<Record<string, { products: number; open: number }>> {
  if (!codes.length) return {};
  const rows = await prisma.productStat.findMany({
    where: { market, product: { setCode: { in: [...codes] } } },
    select: { inStockStores: true, marketplaceOpen: true, product: { select: { setCode: true } } },
  });
  const out: Record<string, { products: number; open: number }> = {};
  for (const r of rows) {
    const c = (out[r.product.setCode!] ??= { products: 0, open: 0 });
    c.products++;
    if (r.inStockStores > 0 || r.marketplaceOpen) c.open++;
  }
  return out;
}

// ─── Per pack ──────────────────────────────────────────────────────────────────

/** The product types a per-pack table compares, in the order it shows them (all have a pack count in lib/packs.ts for some sets). */
export const PER_PACK_TYPES = ["Play Booster Box", "Collector Booster Box", "Draft Booster Box", "Set Booster Box", "Bundle", "Play Booster Pack", "Collector Booster Pack"] as const;

export interface PackRow {
  p: ProductCardData;
  packs: number;
  perPack: number;
}

/** The open products with a known pack count, cheapest per pack first. */
export function perPackRows(products: readonly ProductCardData[]): PackRow[] {
  const out: PackRow[] = [];
  for (const p of products) {
    const packs = packsForLabel(p.productType, p.setCode, p.name);
    const perPack = perPackCents(p.lowestPriceCents, packs);
    if (packs && perPack != null) out.push({ p, packs, perPack });
  }
  return out.sort((a, b) => a.perPack - b.perPack || (a.p.lowestPriceCents ?? 0) - (b.p.lowestPriceCents ?? 0));
}

/** Per type: its cheapest open product per pack (types with none are left out). */
export function cheapestPackByType(byType: Partial<Record<string, ProductCardData[]>>): { type: string; row: PackRow }[] {
  const out: { type: string; row: PackRow }[] = [];
  for (const type of PER_PACK_TYPES) {
    const best = perPackRows(byType[type] ?? [])[0];
    if (best) out.push({ type, row: best });
  }
  return out;
}

export interface SetPair {
  code: string;
  name: string;
  releaseDate: string;
  play: PackRow | null;
  collector: PackRow | null;
}

/**
 * Set by set (newest first): the cheapest Play Booster box and the cheapest Collector Booster box per pack, from the open boxes read.
 * Only sets with both, so each row compares like with like. At most `take` sets.
 */
export function playVsCollector(play: readonly ProductCardData[], collector: readonly ProductCardData[], take = 12): SetPair[] {
  const best = (rows: PackRow[]) => {
    const m = new Map<string, PackRow>();
    for (const r of rows) if (r.p.setCode && !m.has(r.p.setCode)) m.set(r.p.setCode, r);
    return m;
  };
  const p = best(perPackRows(play));
  const c = best(perPackRows(collector));
  return SETS.filter((s) => p.has(s.code) && c.has(s.code))
    .slice(0, take)
    .map((s) => ({ code: s.code, name: s.name, releaseDate: s.releaseDate, play: p.get(s.code)!, collector: c.get(s.code)! }));
}

// ─── Gifts ─────────────────────────────────────────────────────────────────────

/**
 * The gift guide's price cap, a round figure in each region's own currency. Not a conversion of US$50 (the site never converts a
 * price): a round local amount near it, which the page states as it is.
 */
export const GIFT_CAP: Readonly<Record<Market, number>> = { US: 5000, AU: 7500, NZ: 8500, CA: 7000, UK: 4000, EU: 4500, SG: 6500 } as Record<Market, number>;

/** The gift guide's product types, in the order it shows them. */
export const GIFT_TYPES = ["Bundle", "Commander Deck", "Starter Kit", "Prerelease Pack", "Scene Box", "Collector Booster Pack", "Play Booster Pack"] as const;

// ─── The weekly wrap ───────────────────────────────────────────────────────────

export interface WeekMove {
  slug: string;
  /** The cheapest in-stock price seven days before the history's last day, and on that day. */
  before: number;
  after: number;
  /** after − before, in cents, and in whole percent of before. */
  delta: number;
  pct: number;
  stores: number;
}

export interface Wrap {
  /** The history's last day (YYYY-MM-DD) and the day a week before it, or null when there is no history file. */
  through: string | null;
  from: string | null;
  /** Days of snapshots the file holds. */
  days: number;
  /** Products in stock at both ends of the week whose cheapest price moved by at least 5%: lower first, higher second. */
  lower: WeekMove[];
  higher: WeekMove[];
  /** Products compared (in stock, at 2+ stores, on both days). */
  compared: number;
}

const iso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/**
 * The week's real price moves in one market, from the snapshots: each product in stock at two or more stores on both the last day
 * and seven days before it. A history under eight days deep gives no moves (the page says so). A move over half the price is a
 * misfiled listing, not a price, and is left out.
 */
export function weekMoves(h: PriceHistory | null, market: string, take = 8, minPct = 5): Wrap {
  if (!h) return { through: null, from: null, days: 0, lower: [], higher: [], compared: 0 };
  const days = h.through - h.since + 1;
  const base: Wrap = { through: iso(h.through), from: iso(h.through - 7), days, lower: [], higher: [], compared: 0 };
  if (days < MIN_DAYS + 1) return base;
  const moves: WeekMove[] = [];
  for (const slug of Object.keys(h.series[market] ?? {})) {
    const s = dailySeries(h, market, slug, 8);
    const a = s.find((d) => d.day === h.through - 7);
    const b = s.find((d) => d.day === h.through);
    if (!a || !b || a.cents == null || b.cents == null || a.stores < 2 || b.stores < 2) continue;
    base.compared++;
    const delta = b.cents - a.cents;
    const pct = Math.round((delta / a.cents) * 100);
    if (Math.abs(pct) < minPct || Math.abs(pct) > 50) continue;
    moves.push({ slug, before: a.cents, after: b.cents, delta, pct, stores: b.stores });
  }
  base.lower = moves.filter((m) => m.delta < 0).sort((x, y) => x.pct - y.pct || x.slug.localeCompare(y.slug)).slice(0, take);
  base.higher = moves.filter((m) => m.delta > 0).sort((x, y) => y.pct - x.pct || x.slug.localeCompare(y.slug)).slice(0, take);
  return base;
}

/** The wrap for a market, from data/public/price-history.json. */
export function wrapFor(market: Market): Wrap {
  return weekMoves(readPriceHistory(), market);
}

/** The product cards for the wrap's slugs (names and links), in one read. */
export async function cardsFor(market: Market, slugs: readonly string[]): Promise<ProductCardData[]> {
  if (!slugs.length) return [];
  const rows = await prisma.productStat.findMany({ where: { market, product: { slug: { in: [...slugs] } } }, select: cardSelect });
  return rows.map(toCard);
}
