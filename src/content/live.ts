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

export type MarketCard = ProductCardData & { market: Market };

export interface Family {
  key: FamilyKey;
  /** Singular, as a table row names it. */
  label: string;
  plural: string;
  /** What the product name must contain (case-insensitive): the capped read's filter. */
  query: string;
  /** The whole test on the product name. */
  match: RegExp;
  /** Packs in every product of the family, or null when it differs (or is not a pack product). */
  packs: number | null;
}

export type FamilyKey = "play-box" | "collector-box" | "draft-box" | "set-box" | "bundle" | "commander" | "play-pack" | "collector-pack" | "prerelease";

const BOX = String.raw`(?:booster\s+)?(?:box|display)\b`;

export const FAMILIES: readonly Family[] = [
  { key: "play-box", label: "Play Booster Box", plural: "Play Booster Boxes", query: "Play Booster", match: new RegExp(String.raw`\bplay\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: null },
  { key: "collector-box", label: "Collector Booster Box", plural: "Collector Booster Boxes", query: "Collector Booster", match: new RegExp(String.raw`\bcollector\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 12 },
  { key: "draft-box", label: "Draft Booster Box", plural: "Draft Booster Boxes", query: "Draft Booster", match: new RegExp(String.raw`\bdraft\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 36 },
  { key: "set-box", label: "Set Booster Box", plural: "Set Booster Boxes", query: "Set Booster", match: new RegExp(String.raw`\bset\s+booster\s+${BOX}(?!.*\bcase\b)`, "i"), packs: 30 },
  { key: "bundle", label: "Bundle", plural: "Bundles", query: "Bundle", match: /\bbundle\b(?!.*\bcase\b)/i, packs: null },
  { key: "commander", label: "Commander Deck", plural: "Commander Decks", query: "Commander", match: /\bcommander\s+deck\b|\bcommander\b.*\bprecon\b/i, packs: null },
  { key: "play-pack", label: "Play Booster pack", plural: "Play Booster packs", query: "Play Booster", match: /\bplay\s+booster\b(?!.*\b(?:box|display|case|bundle)\b)/i, packs: 1 },
  { key: "collector-pack", label: "Collector Booster pack", plural: "Collector Booster packs", query: "Collector Booster", match: /\bcollector\s+booster\b(?!.*\b(?:box|display|case|bundle)\b)/i, packs: 1 },
  { key: "prerelease", label: "Prerelease Pack", plural: "Prerelease Packs", query: "Prerelease", match: /\bprerelease\s+(?:pack|kit)\b/i, packs: null },
];

export const FAMILY: Readonly<Record<FamilyKey, Family>> = Object.fromEntries(FAMILIES.map((f) => [f.key, f])) as Record<FamilyKey, Family>;

/** The booster-box families, in the order the pages list them. */
export const BOX_FAMILIES: readonly FamilyKey[] = ["play-box", "collector-box", "draft-box", "set-box"];

/** The family a product name belongs to (the first that matches, boxes before packs), or null. */
export function familyOf(name: string): Family | null {
  return FAMILIES.find((f) => f.match.test(name)) ?? null;
}

/** Packs in a product: the family's fixed count, else the count its own name states ("30 Packs", "36-pack"), else null. */
export function packsOf(p: Pick<ProductCardData, "name">, fam: Family | null = familyOf(p.name)): number | null {
  if (fam?.packs != null) return fam.packs;
  const m = /\b(\d{1,2})[-\s]*(?:booster\s+)?packs?\b/i.exec(p.name);
  const n = m ? Number(m[1]) : null;
  return n && n >= 2 && n <= 48 ? n : null;
}

/** Price per pack in the product's own currency (cents), or null where the pack count is not known. */
export function perPackOf(p: Pick<ProductCardData, "name" | "lowestPriceCents">): number | null {
  const packs = packsOf(p);
  return packs && p.lowestPriceCents != null && p.lowestPriceCents > 0 ? Math.round(p.lowestPriceCents / packs) : null;
}

/** Buyable now: a store has it in stock, or TCGplayer does. */
export const isOpenCard = (p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">) => p.inStockStores > 0 || p.marketplaceOpen;

/** "12 stores", "4 stores + TCGplayer", "TCGplayer" or "—". */
export function whereText(p: Pick<ProductCardData, "inStockStores" | "marketplaceOpen">): string {
  if (p.inStockStores > 0) return `${p.inStockStores} store${p.inStockStores === 1 ? "" : "s"}${p.marketplaceOpen ? " + TCGplayer" : ""}`;
  return p.marketplaceOpen ? "TCGplayer" : "—";
}

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

/** Per market, the cheapest open product of a family among `cards` (in REGION_LIST order; never sorted by price: currencies differ). */
export function cheapestPerMarket(cards: readonly MarketCard[], key: FamilyKey, keep: (p: MarketCard) => boolean = () => true): { market: Market; p: MarketCard | null }[] {
  return REGION_LIST.map((r) => ({
    market: r.market,
    p: cards.filter((c) => c.market === r.market && familyOf(c.name)?.key === key && isOpenCard(c) && keep(c)).sort(cheapestFirst)[0] ?? null,
  }));
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
