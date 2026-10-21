// The browse page's reads (src/lib/db.ts rules): one page of 48 rows in SQL for /<region>/sealed and /page/N, and the region's
// whole comparable list once per import for the CDN-cached index (/api/browse/<region>), never per page and never per keystroke.
//
// Both are ONE $queryRaw over ProductStat ⨝ Product with only the columns a card renders: a flat row per product instead of
// Prisma's two queries for a nested select (ProductStat, then Product WHERE id IN (…every id…)), so the index read moves less
// than the old marketProducts() did. Same filter as data.ts COMPARABLE (buyable now, or listed by two stores or more).
import { Prisma } from "@prisma/client";
import { PAGE_SIZE, toCard, type ProductCardData } from "./data";
import { prisma } from "./db";
import type { Market } from "./regions";
import { relevanceCompare, SET_CODES_NEWEST_FIRST, TYPE_LABELS_BY_RANK } from "./search-index";
import { routeRaw } from "./public-data/route";
import { cardRow, isComparable, statsInMarket } from "./public-data/joins";

/**
 * The most rows the index reads for one region (US lists about 2,200 today). A ceiling, not a page: past it the least relevant rows
 * (sold out, oldest sets) drop out of the index, which the warning below makes visible; the paged HTML still lists every product.
 */
export const INDEX_CAP = 4000;

interface Row {
  slug: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  inStockStores: number;
  listedStores: number;
  marketplaceOpen: boolean;
  medianOpenCents: number | null;
}

const COLUMNS = Prisma.sql`p.slug, p.name, p."productType", p."setCode", p."imageUrl",
  s."lowestPriceCents", s."inStockStores", s."listedStores", s."marketplaceOpen", s."medianOpenCents"`;

// lib/search-index.ts relevanceCompare, in SQL: open first, newest set, chase types first, then name and slug byte-wise (COLLATE "C"
// orders by code point, as codePointCompare does), so the server's page N is exactly page N of the index sorted in the browser.
const RELEVANCE = Prisma.sql`(s."inStockStores" > 0 OR s."marketplaceOpen") DESC,
  array_position(${SET_CODES_NEWEST_FIRST}::text[], p."setCode") NULLS LAST,
  array_position(${TYPE_LABELS_BY_RANK}::text[], p."productType") NULLS LAST,
  p.name COLLATE "C", p.slug COLLATE "C"`;

const comparableIn = (market: Market) =>
  Prisma.sql`s.market = ${market} AND (s."inStockStores" > 0 OR s."marketplaceOpen" OR s."listedStores" >= 2)`;

function toCardData(r: Row): ProductCardData {
  const { slug, name, productType, setCode, imageUrl, ...stat } = r;
  return toCard({ ...stat, product: { slug, name, productType, setCode, imageUrl } });
}

/** Page `page` (1-based) of /<region>/sealed: 48 rows in the browse order. The page count is data.ts marketProductCount (one COUNT). */
/** The market's comparable rows in the browse order, from the public data files (the SQL below, for "db" mode). */
function comparableFromFiles(market: Market): Row[] {
  return statsInMarket(market)
    .filter(({ s }) => isComparable(s))
    .map(cardRow)
    .sort(relevanceCompare);
}

export async function marketPage(market: Market, page: number): Promise<ProductCardData[]> {
  const from = (page - 1) * PAGE_SIZE;
  const rows = await routeRaw(() => comparableFromFiles(market).slice(from, from + PAGE_SIZE), () => prisma.$queryRaw<Row[]>`
    SELECT ${COLUMNS}
    FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId"
    WHERE ${comparableIn(market)}
    ORDER BY ${RELEVANCE}
    LIMIT ${PAGE_SIZE} OFFSET ${from}`);
  return rows.map(toCardData);
}

/**
 * Every comparable product of the market, in the browse order, for the index route only (an ISR route handler: one read per region
 * per import). About 0.5 MB from the database for the US; the CDN serves the JSON (~70 KB gzip) to every visitor after that.
 */
export async function marketIndexCards(market: Market): Promise<ProductCardData[]> {
  const rows = await routeRaw(() => comparableFromFiles(market).slice(0, INDEX_CAP), () => prisma.$queryRaw<Row[]>`
    SELECT ${COLUMNS}
    FROM "ProductStat" s JOIN "Product" p ON p.id = s."productId"
    WHERE ${comparableIn(market)}
    ORDER BY ${RELEVANCE}
    LIMIT ${INDEX_CAP}`);
  if (rows.length >= INDEX_CAP) {
    console.warn(`[browse-index] ${market}: the index reached INDEX_CAP (${INDEX_CAP} rows); the least relevant products are left out of search and filters. Raise it in src/lib/browse-data.ts.`);
  }
  return rows.map(toCardData);
}
