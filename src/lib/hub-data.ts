// The hub pages' reads (sets index, release calendar, type pages, the sitemap's store list). Each is ONE scoped, capped query
// (src/lib/db.ts rules 1–2): a GROUP BY that returns one row per set, a type's 48 cheapest open products and 24 sold-out ones
// with their counts, the keys of the stores worth a sitemap URL. Pages call them inside ISR renders (revalidate = 86400), and
// a page that needs one in generateMetadata too wraps it in React cache().
import { cardSelect, OPEN, toCard, type ProductCardData } from "./data";
import { prisma } from "./db";
import type { Market } from "./regions";
import { isOpen, statsInMarket } from "./public-data/joins";
import { routeRaw } from "./public-data/route";
import { publicRows } from "./public-data/store";

export interface SetCount {
  products: number;
  /** Buyable now: a store has it in stock or TCGplayer does (data.ts OPEN). For a set not out yet, these are pre-orders. */
  inStock: number;
}

/**
 * Per set: how many products the market lists and how many are open. One GROUP BY in SQL, one row per set (there are fewer
 * than 80 sets; capped at 150), instead of data.ts setCounts' read of every product row in the market.
 */
export async function setCountsGrouped(market: Market): Promise<Map<string, SetCount>> {
  const fromFiles = () => {
    const acc = new Map<string, { setCode: string; products: number; inStock: number }>();
    for (const { s, p } of statsInMarket(market)) {
      const code = p.setCode as string | null;
      if (!code) continue;
      const a = acc.get(code) ?? { setCode: code, products: 0, inStock: 0 };
      a.products++;
      if (isOpen(s)) a.inStock++;
      acc.set(code, a);
    }
    return [...acc.values()].slice(0, 150);
  };
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<{ setCode: string; products: number; inStock: number }[]>`
    SELECT p."setCode" AS "setCode",
           count(*)::int AS "products",
           (count(*) FILTER (WHERE s."inStockStores" > 0 OR s."marketplaceOpen"))::int AS "inStock"
    FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."market" = ${market} AND p."setCode" IS NOT NULL
    GROUP BY p."setCode"
    LIMIT 150`);
  return new Map(rows.map((r) => [r.setCode, { products: Number(r.products), inStock: Number(r.inStock) }]));
}

/** The type page's grids: the 48 cheapest open products, then the 24 sold-out ones most stores list. */
export const TYPE_OPEN_TAKE = 48;
export const TYPE_SOLD_TAKE = 24;

export interface TypePageData {
  /** Open products, cheapest first (at most TYPE_OPEN_TAKE). */
  open: ProductCardData[];
  /** Sold out everywhere, most-listed first (at most TYPE_SOLD_TAKE). */
  sold: ProductCardData[];
  /** Every open / sold-out product of the type in the market, for "See all N in stock". */
  openCount: number;
  soldCount: number;
  /** US: products only TCGplayer lists (no independent store does). */
  tcgOnly: number;
}

/**
 * A type page's data: at most 72 product rows plus one aggregate. US Collections alone have ~530 open products: the page shows
 * the cheapest 48 and links to the browse page's filtered view for the rest.
 */
export async function typePageData(market: Market, label: string): Promise<TypePageData> {
  const ofType = { market, product: { productType: label } };
  const [open, sold, counts] = await Promise.all([
    prisma.productStat.findMany({
      where: { ...ofType, ...OPEN },
      orderBy: [{ lowestPriceCents: "asc" }, { product: { name: "asc" } }],
      take: TYPE_OPEN_TAKE,
      select: cardSelect,
    }),
    prisma.productStat.findMany({
      where: { ...ofType, inStockStores: 0, marketplaceOpen: false },
      orderBy: [{ listedStores: "desc" }, { product: { name: "asc" } }],
      take: TYPE_SOLD_TAKE,
      select: cardSelect,
    }),
    routeRaw(
      () => {
        const c = { open: 0, sold: 0, tcgOnly: 0 };
        for (const { s, p } of statsInMarket(market)) {
          if (p.productType !== label) continue;
          if (isOpen(s)) c.open++;
          if (s.inStockStores === 0 && s.marketplaceOpen !== true) c.sold++;
          if (s.listedStores === 0) c.tcgOnly++;
        }
        return [c];
      },
      () => prisma.$queryRaw<{ open: number; sold: number; tcgOnly: number }[]>`
      SELECT (count(*) FILTER (WHERE s."inStockStores" > 0 OR s."marketplaceOpen"))::int AS "open",
             (count(*) FILTER (WHERE s."inStockStores" = 0 AND NOT s."marketplaceOpen"))::int AS "sold",
             (count(*) FILTER (WHERE s."listedStores" = 0))::int AS "tcgOnly"
      FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
      WHERE s."market" = ${market} AND p."productType" = ${label}`,
    ),
  ]);
  const c = counts[0];
  return {
    open: open.map(toCard),
    sold: sold.map(toCard),
    openCount: Number(c?.open ?? 0),
    soldCount: Number(c?.sold ?? 0),
    tcgOnly: Number(c?.tcgOnly ?? 0),
  };
}

/**
 * The stores worth a sitemap URL: StoreStat says they list something and are not dormant (hub-copy.ts storeIndexable, the
 * store page's noindex rule). One row: the keys aggregated in SQL (a few KB, bounded by the store registry).
 */
export async function activeStoreKeys(): Promise<string[]> {
  const fromFiles = () => {
    const keys = publicRows("StoreStat")
      .filter((r) => (r.listed as number) > 0 && r.dormant !== true)
      .map((r) => String(r.store))
      .sort();
    return [{ keys: keys.length ? keys : null }];
  };
  const rows = await routeRaw(fromFiles, () => prisma.$queryRaw<{ keys: string[] | null }[]>`
    SELECT array_agg("store" ORDER BY "store") AS "keys" FROM "StoreStat" WHERE "listed" > 0 AND NOT "dormant"`);
  return rows[0]?.keys ?? [];
}
