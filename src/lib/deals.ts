// Value discovery: the lists behind /[region]/deals, /[region]/cheapest-packs, /[region]/this-week and the region home's deals rail,
// and the sentences those pages print about them.
//
// Every fact here is about TODAY's listings (ProductStat, recomputed by each import), never about the past: a deal is a product
// whose cheapest in-stock price sits at least 10% under the median of the 3+ independent stores that have it in stock right now,
// exactly the bar the product card's and product page's badge uses (format.ts medianSaving), so the page and the badge always
// agree. Price per pack is packs.ts arithmetic on today's price; MSRP is rrp.ts (US only, with RRP_NOTE wherever it is printed).
//
// Shape: PURE rankers (pickDeals, rankPerPack, pickBelowMsrp, newlyTrackedFilter, the copy builders), tested with fixtures in
// tests/deals.test.ts, and THIN loaders that are one scoped, capped $queryRaw each (src/lib/db.ts rules): one market, card columns
// only, a LIMIT on every read (at most ~200 rows), tagged templates only. No unstable_cache: the pages are ISR (revalidate 86400).
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { toCard, type ProductCardData } from "./data";
import { cardOpen } from "./compact";
import { money, pctOf, plural } from "./format";
import { packsForLabel, perPackCents } from "./packs";
import { PACK_TYPES } from "./per-pack";
import type { Market, Region, RegionInfo } from "./regions";
import { usMsrpForCard } from "./rrp";
import { floorCents, PRODUCT_TYPES, TYPE_BY_LABEL } from "./sealed-title";
import { SETS } from "./sets";
import { SITE_NAME } from "./site";
import type { Row } from "./public-data/engine";
import { cardRow, cmpC, isOpen, statsInMarket } from "./public-data/joins";
import { routeRaw } from "./public-data/route";
import { publicRows } from "./public-data/store";

// ─── The deal bar (the same numbers as format.ts medianSaving) ──────────────────

/** At least this many independent stores in stock: the median of fewer is not a market. */
export const DEAL_MIN_STORES = 3;
/** The cheapest price at most 90% of the median: "at least 10% under". medianSaving() compares `lowest > median * 0.9`, and so does isDeal. */
export const DEAL_MAX_RATIO = 0.9;
/**
 * …and at least 50% of it. Below half the median a row is almost always a misclassified listing, not a bargain: AU's "Pitch Black
 * 3 Pack Blister" at A$12.95 against a A$42.45 median, a US "Paldea Evolved Booster Box" at $209.99 against $529.95.
 */
export const DEAL_MIN_RATIO = 0.5;

/** The floor a believable price of this product type clears in this market (sealed-title.ts floorCents), or 0 for an unknown type. */
function floorFor(typeLabel: string, market: string): number {
  const t = TYPE_BY_LABEL.get(typeLabel);
  return t ? floorCents(t.key, market) : 0;
}

/** Is this card a deal today: 3+ stores in stock, cheapest between 50% and 90% of their median, and above its type's price floor? */
export function isDeal(p: ProductCardData, market: string): boolean {
  const lo = p.lowestPriceCents;
  const med = p.medianOpenCents;
  if (!lo || !med || p.inStockStores < DEAL_MIN_STORES) return false;
  if (lo > med * DEAL_MAX_RATIO || lo < med * DEAL_MIN_RATIO) return false;
  return lo >= floorFor(p.productType, market);
}

/** The deals among `rows`: isDeal only, biggest saving (lowest ÷ median) first, then the cheaper; each product once. */
export function pickDeals(rows: readonly ProductCardData[], market: string): ProductCardData[] {
  const seen = new Set<string>();
  const ratio = (p: ProductCardData) => p.lowestPriceCents! / p.medianOpenCents!;
  return rows
    .filter((p) => isDeal(p, market))
    .sort((a, b) => ratio(a) - ratio(b) || a.lowestPriceCents! - b.lowestPriceCents! || a.slug.localeCompare(b.slug))
    .filter((p) => !seen.has(p.slug) && !!seen.add(p.slug));
}

/** A deal's saving in whole percent ("18" for 18% under the median), as medianSaving() prints it. */
export function dealPct(p: ProductCardData): number {
  return -(pctOf(p.lowestPriceCents ?? 0, p.medianOpenCents) ?? 0);
}

// ─── The deals page's sections ──────────────────────────────────────────────────

export interface DealSection {
  /** The in-page anchor (/[region]/deals#booster-boxes): the hubs' type pages link to it. */
  id: "booster-boxes" | "elite-trainer-boxes" | "booster-bundles" | "collections" | "more";
  title: string;
  /** One of them, as a sentence says it: "No booster box is 10% under…". */
  one: string;
  /** Product type labels (sealed-title.ts PRODUCT_TYPES). */
  types: string[];
  /** The most this section shows (they add up to 48: the loaders read at most 96 rows per render). */
  take: number;
  /** Where its "see all" link goes: a type page, or the browse page sorted by saving. */
  more: { path: string; label: string };
}

const NAMED = ["Booster Box", "Elite Trainer Box", "Pokémon Center Elite Trainer Box", "Booster Bundle", "Collection", "Ultra-Premium Collection", "Tin"];

export const DEAL_SECTIONS: readonly DealSection[] = [
  { id: "booster-boxes", title: "Booster boxes", one: "booster box", types: ["Booster Box"], take: 12, more: { path: "/type/booster-boxes", label: "All booster boxes" } },
  {
    id: "elite-trainer-boxes",
    title: "Elite Trainer Boxes",
    one: "Elite Trainer Box",
    types: ["Elite Trainer Box", "Pokémon Center Elite Trainer Box"],
    take: 12,
    more: { path: "/type/elite-trainer-boxes", label: "All ETBs" },
  },
  { id: "booster-bundles", title: "Booster bundles", one: "booster bundle", types: ["Booster Bundle"], take: 8, more: { path: "/type/booster-bundles", label: "All bundles" } },
  { id: "collections", title: "Collections & tins", one: "collection or tin", types: ["Collection", "Ultra-Premium Collection", "Tin"], take: 8, more: { path: "/type/collections", label: "All collections" } },
  {
    id: "more",
    title: "Packs, blisters, decks & more",
    one: "pack, blister or deck",
    types: PRODUCT_TYPES.map((t) => t.label).filter((l) => !NAMED.includes(l)),
    take: 8,
    more: { path: "/sealed?stock=in&sort=saving", label: "Everything by saving" },
  },
];

/** The deals page's section of a product type ("more" for anything not named). */
export function dealSectionOf(typeLabel: string): DealSection {
  return DEAL_SECTIONS.find((s) => s.types.includes(typeLabel)) ?? DEAL_SECTIONS[DEAL_SECTIONS.length - 1];
}

// ─── Price per pack ─────────────────────────────────────────────────────────────

export interface PerPackRow {
  p: ProductCardData;
  packs: number;
  /** Today's cheapest price ÷ packs, in cents. */
  perPack: number;
  /** US only: TPCi's MSRP for the product ÷ its packs (rrp.ts), else null. */
  msrpPerPack: number | null;
}

/**
 * The per-pack ranking of some cards: open, a pack type (per-pack.ts PACK_TYPES), a pack count the product line fixes (packs.ts),
 * a price at or above its type's floor; cheapest per pack first, then the cheaper product, then by name. Each product once.
 */
export function rankPerPack(cards: readonly ProductCardData[], market: string): PerPackRow[] {
  const seen = new Set<string>();
  const out: PerPackRow[] = [];
  for (const p of cards) {
    if (seen.has(p.slug) || !cardOpen(p) || !PACK_TYPES.includes(p.productType)) continue;
    const packs = packsForLabel(p.productType, p.setCode, p.name);
    const perPack = perPackCents(p.lowestPriceCents, packs);
    if (!packs || perPack == null || p.lowestPriceCents! < floorFor(p.productType, market)) continue;
    seen.add(p.slug);
    const msrp = usMsrpForCard(market, p.productType, p.setCode);
    out.push({ p, packs, perPack, msrpPerPack: msrp != null ? Math.round(msrp / packs) : null });
  }
  return out.sort((a, b) => a.perPack - b.perPack || a.p.lowestPriceCents! - b.p.lowestPriceCents! || a.p.name.localeCompare(b.p.name));
}

export interface PerPackLeaders {
  /** Per pack type, in PACK_TYPES order (types with nothing open left out): the ranking within that type. */
  byType: { type: string; rows: PerPackRow[] }[];
  /** The ten cheapest per pack across every type. */
  top10: PerPackRow[];
}

/** Group a ranking by type (PACK_TYPES order) and take the overall top ten. Pure. */
export function perPackLeadersOf(cards: readonly ProductCardData[], market: string): PerPackLeaders {
  const ranked = rankPerPack(cards, market);
  const byType = PACK_TYPES.map((type) => ({ type, rows: ranked.filter((r) => r.p.productType === type) })).filter((g) => g.rows.length > 0);
  return { byType, top10: ranked.slice(0, 10) };
}

// ─── Below US MSRP ──────────────────────────────────────────────────────────────

/**
 * Open US products priced under TPCi's MSRP for them (rrp.ts), the furthest under first, then the cheaper. Below half the MSRP is
 * left out, as below half the median is on the deals page: that is a misread listing far more often than a price. Pure.
 */
export function pickBelowMsrp(cards: readonly ProductCardData[]): ProductCardData[] {
  const msrp = (p: ProductCardData) => usMsrpForCard("US", p.productType, p.setCode);
  const seen = new Set<string>();
  return cards
    .filter((p) => {
      const m = msrp(p);
      const lo = p.lowestPriceCents;
      return cardOpen(p) && m != null && lo != null && lo < m && lo >= m * DEAL_MIN_RATIO && !seen.has(p.slug) && !!seen.add(p.slug);
    })
    .sort((a, b) => a.lowestPriceCents! / msrp(a)! - b.lowestPriceCents! / msrp(b)! || a.lowestPriceCents! - b.lowestPriceCents!);
}

// The sets and product types rrp.ts publishes a US MSRP for (Scarlet & Violet and Mega Evolution today), and each type's MSRP
// (the highest across those sets: an SQL prefilter only; pickBelowMsrp applies the exact per-set figure).
const MSRP_TYPES = new Map<string, number>();
const MSRP_SETS: string[] = [];
for (const s of SETS) {
  let any = false;
  for (const t of PRODUCT_TYPES) {
    const m = usMsrpForCard("US", t.label, s.code);
    if (m == null) continue;
    any = true;
    MSRP_TYPES.set(t.label, Math.max(MSRP_TYPES.get(t.label) ?? 0, m));
  }
  if (any) MSRP_SETS.push(s.code);
}

// ─── New on DexCompare ──────────────────────────────────────────────────────────

/** How far back "first seen by DexCompare" looks. */
export const NEW_DAYS = 14;
/**
 * A day on which DexCompare created this many products or more is an import event (the 2026-09-25 launch created 7,007; a
 * re-grouping re-creates hundreds), not new listings: its products are left out of "New on DexCompare".
 */
export const BULK_DAY = 200;

/** The start (UTC midnight) of the first day the window counts. Whole days, so a bulk day at the edge is counted in full. */
export function newSince(now: Date, days = NEW_DAYS): Date {
  const d = new Date(now.getTime() - days * 86400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The pure form of newlyTracked()'s guard, over Product rows (every market's: creation is global): rows created since newSince(now),
 * minus every row of a day with BULK_DAY or more creations, newest first. The SQL does the same with a CTE.
 */
export function newlyTrackedFilter<T extends { createdAt: Date }>(rows: readonly T[], now: Date, opts: { days?: number; bulk?: number } = {}): T[] {
  const since = newSince(now, opts.days).getTime();
  const bulk = opts.bulk ?? BULK_DAY;
  const recent = rows.filter((r) => r.createdAt.getTime() >= since && r.createdAt.getTime() <= now.getTime());
  const perDay = new Map<string, number>();
  for (const r of recent) perDay.set(utcDay(r.createdAt), (perDay.get(utcDay(r.createdAt)) ?? 0) + 1);
  return recent.filter((r) => perDay.get(utcDay(r.createdAt))! < bulk).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ─── Loaders: one scoped, capped $queryRaw each ─────────────────────────────────

/** A card row as the SQL below returns it: ProductStat's card columns, then the Product's. */
interface RawCard {
  lowestPriceCents: number | null;
  inStockStores: number;
  listedStores: number;
  marketplaceOpen: boolean;
  medianOpenCents: number | null;
  slug: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
}

// The columns a ProductCard renders (data.ts cardSelect), and nothing else.
const CARD_COLUMNS = Prisma.sql`s."lowestPriceCents", s."inStockStores", s."listedStores", s."marketplaceOpen", s."medianOpenCents", p.slug, p.name, p."productType", p."setCode", p."imageUrl"`;
const OPEN_SQL = Prisma.sql`(s."inStockStores" > 0 OR s."marketplaceOpen")`;

// Each loader below is routeRaw(files, sql): the public data files answer in "files" mode (the default: src/lib/public-data/), the
// SQL in "db" mode. The file version is the SQL's own conditions and order, over ProductStat ⨝ Product (public-data/joins.ts).

function fromRaw(r: RawCard): ProductCardData {
  return toCard({
    lowestPriceCents: r.lowestPriceCents,
    inStockStores: r.inStockStores,
    listedStores: r.listedStores,
    marketplaceOpen: r.marketplaceOpen,
    medianOpenCents: r.medianOpenCents,
    product: { slug: r.slug, name: r.name, productType: r.productType, setCode: r.setCode, imageUrl: r.imageUrl },
  });
}

/**
 * The market's deals (isDeal), biggest saving first: one read of at most 2 × take rows (take ≤ 100) on ProductStat's
 * (market, inStockStores) index, optionally of some product types only; then pickDeals and the first `take`.
 */
export async function dealsInMarket(market: Market, { take = 48, types }: { take?: number; types?: readonly string[] } = {}): Promise<ProductCardData[]> {
  const n = Math.max(1, Math.min(100, Math.floor(take)));
  const typeFilter = types?.length ? Prisma.sql`AND p."productType" = ANY(${[...types]})` : Prisma.empty;
  const fromFiles = (): RawCard[] =>
    statsInMarket(market)
      .map(cardRow)
      .filter(
        (r) =>
          r.inStockStores >= DEAL_MIN_STORES &&
          r.medianOpenCents !== null &&
          r.lowestPriceCents !== null &&
          r.lowestPriceCents >= r.medianOpenCents * DEAL_MIN_RATIO &&
          r.lowestPriceCents <= r.medianOpenCents * DEAL_MAX_RATIO &&
          (!types?.length || types.includes(r.productType)),
      )
      .sort((a, b) => a.lowestPriceCents! / a.medianOpenCents! - b.lowestPriceCents! / b.medianOpenCents! || a.lowestPriceCents! - b.lowestPriceCents!)
      .slice(0, n * 2);
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<RawCard[]>`
    SELECT ${CARD_COLUMNS}
    FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId"
    WHERE s.market = ${market}
      AND s."inStockStores" >= ${DEAL_MIN_STORES}
      AND s."medianOpenCents" IS NOT NULL
      AND s."lowestPriceCents" BETWEEN s."medianOpenCents" * ${DEAL_MIN_RATIO} AND s."medianOpenCents" * ${DEAL_MAX_RATIO}
      ${typeFilter}
    ORDER BY s."lowestPriceCents"::float / s."medianOpenCents", s."lowestPriceCents"
    LIMIT ${n * 2}`);
  return pickDeals(rows.map(fromRaw), market).slice(0, n);
}

/** The deals page's sections, each its own capped read (48 deals and at most 96 rows in all), in DEAL_SECTIONS order. */
export async function dealsBySection(market: Market): Promise<{ section: DealSection; deals: ProductCardData[] }[]> {
  const lists = await Promise.all(DEAL_SECTIONS.map((s) => dealsInMarket(market, { take: s.take, types: s.types })));
  return DEAL_SECTIONS.map((section, i) => ({ section, deals: lists[i] }));
}

/**
 * The cheapest open products of every pack type, by price per pack: one read, the `perType` cheapest of each type
 * (ROW_NUMBER over the type), so at most 8 × 24 = 192 rows; then packs.ts arithmetic, the floor guard and the ranking (rankPerPack).
 */
export async function perPackLeaders(market: Market, perType = 24): Promise<PerPackLeaders> {
  const n = Math.max(1, Math.min(25, Math.floor(perType)));
  const fromFiles = (): RawCard[] => {
    const byType = new Map<string, RawCard[]>();
    for (const sp of statsInMarket(market)) {
      if (!isOpen(sp.s) || sp.s.lowestPriceCents === null || !PACK_TYPES.includes(String(sp.p.productType))) continue;
      const r = cardRow(sp);
      let list = byType.get(r.productType);
      if (!list) byType.set(r.productType, (list = []));
      list.push(r);
    }
    return [...byType.values()].flatMap((list) => list.sort((a, b) => a.lowestPriceCents! - b.lowestPriceCents! || cmpC(a.slug, b.slug)).slice(0, n));
  };
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<RawCard[]>`
    SELECT "lowestPriceCents", "inStockStores", "listedStores", "marketplaceOpen", "medianOpenCents", slug, name, "productType", "setCode", "imageUrl"
    FROM (
      SELECT ${CARD_COLUMNS}, ROW_NUMBER() OVER (PARTITION BY p."productType" ORDER BY s."lowestPriceCents", p.slug) AS rn
      FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId"
      WHERE s.market = ${market} AND ${OPEN_SQL} AND s."lowestPriceCents" IS NOT NULL AND p."productType" = ANY(${PACK_TYPES})
    ) ranked
    WHERE rn <= ${n}`);
  return perPackLeadersOf(rows.map(fromRaw), market);
}

/**
 * US only: open Scarlet & Violet and Mega Evolution products of the types rrp.ts prices, under their MSRP. One read of at most 120
 * rows (prefiltered in SQL by each type's MSRP, the furthest under first), then pickBelowMsrp with the exact per-set MSRP.
 */
export async function belowMsrpUS(take = 24): Promise<ProductCardData[]> {
  if (!MSRP_TYPES.size || !MSRP_SETS.length) return [];
  const msrp = Prisma.join([...MSRP_TYPES].map(([type, cents]) => Prisma.sql`(${type}::text, ${cents}::int)`));
  const fromFiles = (): RawCard[] =>
    statsInMarket("US")
      .filter(({ s, p }) => isOpen(s) && MSRP_SETS.includes(String(p.setCode)) && MSRP_TYPES.has(String(p.productType)))
      .map(cardRow)
      .filter((r) => r.lowestPriceCents !== null && r.lowestPriceCents < MSRP_TYPES.get(r.productType)!)
      .sort(
        (a, b) =>
          a.lowestPriceCents! / MSRP_TYPES.get(a.productType)! - b.lowestPriceCents! / MSRP_TYPES.get(b.productType)! || a.lowestPriceCents! - b.lowestPriceCents!,
      )
      .slice(0, 120);
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<RawCard[]>`
    WITH m(type, msrp) AS (VALUES ${msrp})
    SELECT ${CARD_COLUMNS}
    FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId" JOIN m ON m.type = p."productType"
    WHERE s.market = 'US' AND ${OPEN_SQL} AND p."setCode" = ANY(${MSRP_SETS}) AND s."lowestPriceCents" < m.msrp
    ORDER BY s."lowestPriceCents"::float / m.msrp, s."lowestPriceCents"
    LIMIT 120`);
  return pickBelowMsrp(rows.map(fromRaw)).slice(0, Math.max(0, take));
}

/**
 * Products DexCompare first saw in the last NEW_DAYS days that are open in this market, newest first. One read: a CTE counts the
 * Product rows created per day since newSince() and drops every day with BULK_DAY or more (imports, re-groupings), as
 * newlyTrackedFilter does. Product.createdAt is when DexCompare created the row, not a release date: the page says so.
 */
export async function newlyTracked(market: Market, take = 24, now = new Date()): Promise<ProductCardData[]> {
  const since = newSince(now).toISOString();
  const limit = Math.max(1, Math.min(48, Math.floor(take)));
  const fromFiles = (): RawCard[] => {
    const sinceMs = Date.parse(since);
    const created = (p: Row) => (p.createdAt instanceof Date ? p.createdAt.getTime() : Date.parse(String(p.createdAt)));
    const perDay = new Map<string, number>();
    for (const p of publicRows("Product")) if (created(p) >= sinceMs) perDay.set(utcDay(new Date(created(p))), (perDay.get(utcDay(new Date(created(p)))) ?? 0) + 1);
    return statsInMarket(market)
      .filter(({ s, p }) => isOpen(s) && created(p) >= sinceMs && (perDay.get(utcDay(new Date(created(p)))) ?? 0) < BULK_DAY)
      .sort((a, b) => created(b.p) - created(a.p) || cmpC(String(a.p.slug), String(b.p.slug)))
      .slice(0, limit)
      .map(cardRow);
  };
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<RawCard[]>`
    WITH days AS (
      SELECT date_trunc('day', "createdAt") AS day, count(*) AS n
      FROM "Product"
      WHERE "createdAt" >= ${since}::timestamp
      GROUP BY 1
    )
    SELECT ${CARD_COLUMNS}
    FROM days
    JOIN "Product" p ON date_trunc('day', p."createdAt") = days.day
    JOIN "ProductStat" s ON s."productId" = p.id AND s.market = ${market}
    WHERE days.n < ${BULK_DAY} AND ${OPEN_SQL}
    ORDER BY p."createdAt" DESC, p.slug
    LIMIT ${limit}`);
  return rows.map(fromRaw);
}

/** Per set (at most 10): how many products the market lists, and how many are open (in stock, or on pre-order before release). One GROUP BY. */
export async function productCountsBySets(market: Market, codes: readonly string[]): Promise<Map<string, { products: number; open: number }>> {
  const out = new Map<string, { products: number; open: number }>();
  const some = [...new Set(codes)].slice(0, 10);
  if (!some.length) return out;
  const fromFiles = () => {
    const acc = new Map<string, { code: string; products: number; open: number }>();
    for (const { s, p } of statsInMarket(market)) {
      const code = p.setCode as string | null;
      if (!code || !some.includes(code)) continue;
      const a = acc.get(code) ?? { code, products: 0, open: 0 };
      a.products++;
      if (isOpen(s)) a.open++;
      acc.set(code, a);
    }
    return [...acc.values()];
  };
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<{ code: string; products: number; open: number }[]>`
    SELECT p."setCode" AS code, count(*)::int AS products, (count(*) FILTER (WHERE ${OPEN_SQL}))::int AS open
    FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId"
    WHERE s.market = ${market} AND p."setCode" = ANY(${some})
    GROUP BY p."setCode"`);
  for (const r of rows) out.set(r.code, { products: r.products, open: r.open });
  return out;
}

// ─── Sets around today (this week's digest) ─────────────────────────────────────

export const SOON_DAYS = 45;
export const JUST_RELEASED_DAYS = 30;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Sets releasing after today and within SOON_DAYS (soonest first), and sets out in the last JUST_RELEASED_DAYS (newest first). */
export function setsAround(today: string, sets = SETS) {
  const soon = sets.filter((s) => s.releaseDate > today && s.releaseDate <= addDays(today, SOON_DAYS)).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const recent = sets.filter((s) => s.releaseDate <= today && s.releaseDate >= addDays(today, -JUST_RELEASED_DAYS)).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return { soon, recent };
}

// ─── Small helpers the pages share ──────────────────────────────────────────────

/** Where to send someone a region has nothing for: Australia ↔ New Zealand, the US → Canada, everyone else → the US. */
export function nearestRegion(region: Region): Region {
  if (region === "au") return "nz";
  if (region === "nz") return "au";
  if (region === "us") return "ca";
  return "us";
}

const SUFFIX = ` | ${SITE_NAME}`;
/** A page title: the layout's " | DexCompare" template when the whole fits in 65 characters, otherwise the title alone (absolute). */
export function fitTitle(title: string): string | { absolute: string } {
  return title.length + SUFFIX.length <= 65 ? title : { absolute: title };
}

// ─── Copy: what the pages say (tested against copy-rules.ts BANNED_COPY; each says "today" or "checked") ──

type R = Pick<RegionInfo, "inName" | "adjective" | "market" | "currency">;
const tcg = (r: R) => r.market === "US";

export const dealsCopy = {
  title: (r: R) => `Pokémon booster box & ETB deals in ${r.inName}`,
  h1: (r: R) => `Pokémon sealed cheaper than most ${r.adjective} stores today`,
  /** The lede, around the live "checked <Ago>": `${lead} <Ago/>${tail}`. */
  lede: (r: R) => ({
    lead: `Products where the cheapest in-stock price is at least 10% under the median of 3 or more ${r.adjective} stores that have it, checked`,
    tail:
      `. Today’s prices only: we keep no price history.` + (tcg(r) ? ` In the US the cheapest can be a TCGplayer seller’s.` : ""),
  }),
  description: (r: R, deals: number, bestPct: number | null) =>
    deals > 0
      ? `${plural(deals, "Pokémon sealed product")} priced at least 10% under the median of 3+ ${r.adjective} stores today${bestPct ? `, up to ${bestPct}% under` : ""}. Booster boxes, ETBs, bundles and more, in ${r.currency}.`
      : `The cheapest Pokémon booster packs per pack in ${r.inName} today, and any sealed product priced 10% under the median of 3+ ${r.adjective} stores.`,
  summary: (deals: number, bestPct: number | null) => `${plural(deals, "product")}${bestPct ? ` · up to ${bestPct}% below the median` : ""}`,
  empty: (r: R) => `No product is 10% under the median of 3 or more ${r.adjective} stores today, so here is the cheapest way to buy packs instead.`,
  rail: "Cheaper than most stores today",
  railKicker: "10%+ below the median price",
};

export const packsCopy = {
  title: (r: R) => `Cheapest Pokémon booster packs in ${r.inName} — price per pack today`,
  h1: (r: R) => `The cheapest way to buy Pokémon booster packs in ${r.inName}`,
  lede: (r: R) => ({
    lead: `Every sealed product that holds a fixed number of booster packs, ranked by today’s cheapest ${r.adjective} price${tcg(r) ? " (a store’s or a TCGplayer seller’s)" : ""} divided by the packs inside. Prices checked`,
    tail: ".",
  }),
  description: (r: R, best: PerPackRow | null) =>
    best
      ? `Pokémon booster boxes, ETBs, bundles and packs in ${r.inName}, ranked by price per pack today. Cheapest right now: ${best.p.name} at ${money(best.perPack, r.market)} a pack.`
      : `Pokémon booster boxes, ETBs, bundles and packs in ${r.inName}, ranked by price per pack today.`,
  answer: (r: R, best: PerPackRow) => `${best.p.name}: ${money(best.perPack, r.market)} a pack today (${money(best.p.lowestPriceCents, r.market)} for ${best.packs} packs).`,
  method: "Per pack = the listed price ÷ the booster packs inside; promos, sleeves and dice are not priced; shipping excluded.",
};

export const digestCopy = {
  title: (r: R) => `This week in Pokémon sealed — ${r.inName}`,
  h1: (r: R) => `This week in Pokémon sealed — ${r.inName}`,
  intro: (r: R) =>
    `What’s releasing in the next ${SOON_DAYS} days and open for pre-order, what came out in the last ${JUST_RELEASED_DAYS}, and what’s cheaper than most ${r.adjective} stores today. Every number is today’s, checked against each store’s own listings.`,
  description: (r: R) =>
    `Pokémon TCG sets releasing in the next ${SOON_DAYS} days with pre-orders, sets just released, and sealed product cheaper than most ${r.adjective} stores today.`,
  newLabel: `First seen by DexCompare in the last ${NEW_DAYS} days — not necessarily new releases`,
};

export const homeCopy = {
  title: (r: R, stores: number) => `Pokémon booster boxes & ETBs in ${r.inName} — compare ${stores} stores`,
  description: (r: R, stores: number, inStock: number) =>
    `Compare Pokémon booster boxes, ETBs, bundles and collections across ${plural(stores, `${r.adjective} store`)}${tcg(r) ? " and TCGplayer" : ""}: ${inStock.toLocaleString("en")} in stock today, prices in ${r.currency}.`,
};

/** Where a product can be bought today, in a few words: "5 stores", "5 stores + TCGplayer", "TCGplayer", "Pre-order · 3 stores". */
export function stockLabel(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">, preorder = false): string {
  const where = p.inStockStores ? `${plural(p.inStockStores, "store")}${p.marketplaceOpen ? " + TCGplayer" : ""}` : p.marketplaceOpen ? "TCGplayer" : "sold out";
  return preorder ? `Pre-order · ${where}` : where;
}
