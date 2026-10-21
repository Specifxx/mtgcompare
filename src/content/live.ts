// The live numbers the editorial pages (the guides, src/content/guides, and the blog, src/lib/blog) print: small, capped reads of
// the current ProductStat and StoreStat rows through the same Prisma calls the price pages make (src/lib/db.ts routes them to the
// public data files). Nothing here is history: every figure is "today", with when the stores were last read.
//
// Products are grouped into FAMILIES by their own name ("… Play Booster Box", "… Collector Booster Display"), not by the product
// type table, so a guide reads the same whichever type key the importer files a product under. A family states a pack count only
// where every product of it has the same one (a Collector Booster box: 12 packs; a Draft Booster box: 36; a Set Booster box: 30).
// A Play Booster box held 36 packs in the first sets and 30 in later ones, so its count is read from the product's own name when the
// name says it ("30 packs"), and is otherwise left out: no per-pack price is ever guessed.
import { cardSelect, lastCheckedAt, OPEN, toCard, type ProductCardData } from "@/lib/data";
import { prisma } from "@/lib/db";
import { REGION_LIST, type Market } from "@/lib/regions";
import { STORE_BY_KEY, TCGPLAYER } from "@/lib/stores";
import { BOX_FAMILIES, FAMILY, familyOf, type FamilyKey, type MarketCard } from "./families";

export * from "./families";

const cheapestFirst = (a: ProductCardData, b: ProductCardData) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0);

/**
 * One market's open products of a family: one capped read (the name filter), then the family's own test. `order` "asc" is cheapest
 * first; "desc" dearest first. At most `take` rows come back; the read is capped at four times that.
 */
export async function familyIn(market: Market, key: FamilyKey, take: number, order: "asc" | "desc" = "asc", extra?: string): Promise<ProductCardData[]> {
  const fam = FAMILY[key];
  const rows = await prisma.productStat.findMany({
    where: {
      market,
      ...OPEN,
      lowestPriceCents: { gt: 0 },
      product: { name: { contains: fam.query, mode: "insensitive" }, ...(extra ? { AND: [{ name: { contains: extra, mode: "insensitive" } }] } : {}) },
    },
    orderBy: { lowestPriceCents: order },
    take: take * 4,
    select: cardSelect,
  });
  return rows
    .map(toCard)
    .filter((p) => familyOf(p.name)?.key === key)
    .slice(0, take);
}

/** The open booster boxes of every box family in a market, cheapest (or dearest) first: up to `take` of each, merged. */
export async function boxesIn(market: Market, take: number, order: "asc" | "desc" = "asc"): Promise<ProductCardData[]> {
  const lists = await Promise.all(BOX_FAMILIES.map((k) => familyIn(market, k, take, order)));
  const all = lists.flat().sort(cheapestFirst);
  return (order === "asc" ? all : all.reverse()).slice(0, take);
}

/** Every market's open products whose name contains `words` (a release's name), at most `take` per market, cheapest first. */
export async function namedAcross(words: string, take = 40): Promise<MarketCard[]> {
  const lists = await Promise.all(
    REGION_LIST.map(async (r) => {
      const rows = await prisma.productStat.findMany({
        where: { market: r.market, ...OPEN, lowestPriceCents: { gt: 0 }, product: { name: { contains: words, mode: "insensitive" } } },
        orderBy: { lowestPriceCents: "asc" },
        take,
        select: cardSelect,
      });
      return rows.map((row) => ({ ...toCard(row), market: r.market }));
    }),
  );
  return lists.flat();
}

/** One store's current counts. */
export interface StoreRow {
  store: string;
  name: string;
  inStock: number;
  listed: number;
}

/** The market's active stores with the most in stock (at most `take` small rows), TCGplayer left out. */
export async function topStores(market: Market, take = 10): Promise<StoreRow[]> {
  const rows = await prisma.storeStat.findMany({
    where: { market, dormant: false, inStock: { gt: 0 }, store: { not: TCGPLAYER.key } },
    orderBy: { inStock: "desc" },
    take,
    select: { store: true, inStock: true, listed: true },
  });
  return rows.map((r) => ({ ...r, name: STORE_BY_KEY.get(r.store)?.name ?? r.store }));
}

/** Per market: how many stores have something listed, and how many sealed products are open. */
export interface MarketCount {
  market: Market;
  stores: number;
  open: number;
}

export async function marketCounts(): Promise<MarketCount[]> {
  const [stores, open] = await Promise.all([
    prisma.storeStat.groupBy({ by: ["market"], where: { listed: { gt: 0 }, dormant: false, store: { not: TCGPLAYER.key } }, _count: { _all: true } }),
    prisma.productStat.groupBy({ by: ["market"], where: OPEN, _count: { _all: true } }),
  ]);
  return REGION_LIST.map((r) => ({
    market: r.market,
    stores: stores.find((x) => x.market === r.market)?._count._all ?? 0,
    open: open.find((x) => x.market === r.market)?._count._all ?? 0,
  }));
}

/** When the stores were last read anywhere (ISO), or null before the first import. */
export async function lastCheckedAnywhere(): Promise<string | null> {
  const r = await prisma.storeStat.aggregate({ where: { store: { not: TCGPLAYER.key } }, _max: { lastOkAt: true } });
  return r._max.lastOkAt?.toISOString() ?? null;
}

/** When one market's stores were last read (ISO), or null. */
export async function lastCheckedIn(market: Market): Promise<string | null> {
  return (await lastCheckedAt(market))?.toISOString() ?? null;
}
