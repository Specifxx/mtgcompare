// The product page's own reads, beyond productPage() (src/lib/data.ts). Request path: each is scoped to one market, selects only the
// columns a product card renders and is capped (src/lib/db.ts rules 1–2); the page is ISR-cached, so each runs once per import.
//
//   • inStockAlternatives: "In stock instead" on a sold-out page, and "More <type> in <region>" on an in-stock product with no set.
//     ONE $queryRaw, LIMIT 4; only when it finds nothing, the existing cheapestInStock() of the headline types (one capped findMany).
//   • typeNeighbours: "More <type> in <region>" on an in-stock product with no set (2026-11-14): the four products that follow it in the
//     type's name order, so every such page is linked from four sibling pages instead of all of them linking the same four.
//   • relatedWithFormats: the same-set read the page always made (take 40), returned whole: the page's value check reads every format
//     of the set from it, and the "More from <set>" grid shows eight of them (setNeighbours). No new query.
import { prisma } from "./db";
import { ascNullsLast, cardRow, isOpen, positionIn, statsInMarket } from "./public-data/joins";
import { routeRaw } from "./public-data/route";
import { ringAfter } from "./ring";
import { cardOpen } from "./compact";
import { cheapestInStock, HEADLINE_TYPES, relatedProducts, sortCards, toCard, type ProductCardData } from "./data";
import { productNoindex } from "./index-tiers";
import type { Market } from "./regions";
import { SETS } from "./sets";

/** A row of the alternatives query: the card columns (data.ts cardSelect), flat. */
export interface AltRow {
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

/** What the loader needs from Prisma: a tagged-template $queryRaw (injected by the tests). */
export interface AltDb {
  $queryRaw: <T = unknown>(q: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}

/**
 * Set codes in the order alternatives prefer them: released sets newest first, then the sets still to come (soonest first), so a sold-out
 * ETB is offered this year's Collector boxes before a pre-order and before a 2017 one. Computed per call: a set's release day passes without a deploy.
 */
export function setCodesNewestFirst(today = new Date().toISOString().slice(0, 10)): string[] {
  const out = SETS.filter((s) => s.releaseDate <= today).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  const ahead = SETS.filter((s) => s.releaseDate > today).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return [...out, ...ahead].map((s) => s.code);
}

export function altToCard(r: AltRow): ProductCardData {
  const { lowestPriceCents, inStockStores, listedStores, marketplaceOpen, medianOpenCents, ...product } = r;
  return toCard({ lowestPriceCents, inStockStores, listedStores, marketplaceOpen, medianOpenCents, product });
}

/**
 * Up to `take` (4) products of the same type that are open in the market right now (a store has it in stock, or TCGplayer does), the
 * product itself excluded: the same set first, then the newest sets, then the cheapest. Nothing of the type open: the region's cheapest
 * open headline products (booster boxes, Collector boxes, bundles), newest sets first.
 */
export async function inStockAlternatives(
  market: Market,
  productType: string,
  setCode: string | null,
  excludeSlug: string,
  take = 4,
  deps: { db?: AltDb; fallback?: typeof cheapestInStock; today?: string } = {},
): Promise<ProductCardData[]> {
  const db = deps.db ?? (prisma as unknown as AltDb);
  const codes = setCodesNewestFirst(deps.today);
  const limit = Math.max(1, Math.min(take, 12));
  // The SQL's own order over the public data files (src/lib/public-data/), used unless a test injects its db.
  const fromFiles = (): AltRow[] => {
    const pos = positionIn(codes);
    return statsInMarket(market)
      .filter(({ s, p }) => isOpen(s) && p.productType === productType && p.slug !== excludeSlug)
      .map(cardRow)
      .sort(
        (a, b) =>
          Number(setCode !== null && b.setCode === setCode) - Number(setCode !== null && a.setCode === setCode) ||
          pos(a.setCode) - pos(b.setCode) ||
          ascNullsLast(a.lowestPriceCents, b.lowestPriceCents),
      )
      .slice(0, limit);
  };
  const sql = () => db.$queryRaw<AltRow[]>`
    SELECT p."slug", p."name", p."productType", p."setCode", p."imageUrl",
           s."lowestPriceCents", s."inStockStores", s."listedStores", s."marketplaceOpen", s."medianOpenCents"
    FROM "ProductStat" s JOIN "Product" p ON p."id" = s."productId"
    WHERE s."market" = ${market} AND (s."inStockStores" > 0 OR s."marketplaceOpen") AND p."productType" = ${productType} AND p."slug" <> ${excludeSlug}
    ORDER BY COALESCE(p."setCode" = ${setCode}, false) DESC, array_position(${codes}::text[], p."setCode") NULLS LAST, s."lowestPriceCents" ASC NULLS LAST
    LIMIT ${limit}`;
  // COALESCE: a product with no set compares NULL with the set, which must sort as "not the same set", not first.
  const rows = deps.db ? await sql() : await routeRaw(fromFiles, sql);
  if (rows.length) return rows.map(altToCard);
  const fallback = deps.fallback ?? cheapestInStock;
  return (await fallback(market, HEADLINE_TYPES, limit)).filter((c) => c.slug !== excludeSlug);
}

/**
 * The `take` rows that follow `self` in name order (ringAfter). A slug that is not among the rows takes the rows after where its
 * name would sort. Name order keeps a line together ("From the Vault: Lore" beside the other From the Vault boxes).
 */
export function neighboursByName<T extends { slug: string; name: string }>(rows: readonly T[], self: { slug: string; name: string }, take = 4): T[] {
  const key = (r: { slug: string; name: string }) => `${r.name.toLowerCase()}\u0000${r.slug}`;
  const sorted = [...rows.filter((r) => r.slug !== self.slug), self as T].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  return ringAfter(sorted, self.slug, take);
}

/**
 * "More from <set>" on a product page: eight of the set's other products in the market (`related`, in stock first and cheapest first:
 * data.ts sortCards). Until 2026-11-14 it was the first eight for every page, so a set with more than nine products (41 of the 73 the
 * US lists; Star Trek has 59) linked its eight cheapest from every page and the rest from none. Now, for a product that is in stock, it
 * is the eight after this one in that order among the set's in-stock products whose own page is indexable (lib/index-tiers.ts): the
 * products priced nearest above it, wrapping to the cheapest. A sold-out product, or a set with eight or fewer such products, keeps
 * the first eight as before. Pure.
 */
export function setNeighbours(related: readonly ProductCardData[], self: ProductCardData, take = 8): ProductCardData[] {
  const pool = related.filter((c) => c.slug !== self.slug && cardOpen(c) && !productNoindex(c, c.productType));
  if (!cardOpen(self) || pool.length <= take) return related.slice(0, take);
  return ringAfter(sortCards([...pool, self]), self.slug, take);
}

/**
 * "More <type> in <region>" on an in-stock product page with no set (Secret Lair drops, decks, collections): the four products after
 * this one in the type's name order, among those open in the market whose own page is indexable (lib/index-tiers.ts), so a link never
 * points at a noindex page. Measured 2026-11-14 on the US sitemap: 255 of 801 product pages were linked from one page only (220 Secret
 * Lair drops, from their type page), because every such page showed the same cheapest four. From the public data files; with the
 * database (PUBLIC_DATA_MODE "db") or nothing else of the type, the cheapest in stock as before (inStockAlternatives).
 */
export async function typeNeighbours(market: Market, productType: string, self: { slug: string; name: string }, take = 4): Promise<ProductCardData[]> {
  const before = () => inStockAlternatives(market, productType, null, self.slug, take);
  const rows = await routeRaw<AltRow[] | null>(
    () => neighboursByName(statsInMarket(market).filter(({ s, p }) => p.productType === productType && isOpen(s)).map(cardRow).filter((r) => !productNoindex(r, productType)), self, take),
    async () => null,
  );
  return rows && rows.length ? rows.map(altToCard) : before();
}

/**
 * The other products of the product's set in this market: the page's one same-set read (data.ts relatedProducts, take 40), all of it.
 * In stock first, cheapest first (sortCards). The page computes its value check from every row and shows the first eight.
 */
export async function relatedWithFormats(market: Market, setCode: string, excludeSlug: string): Promise<ProductCardData[]> {
  return relatedProducts(market, setCode, excludeSlug, 40);
}
