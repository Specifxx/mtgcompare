// The joins the hand-written SQL reads make (ProductStat ⨝ Product), over the public data files, for their file implementations
// (each call site's routeRaw: the SQL stays as it was for "db" mode, and the function beside it answers from these rows).
// SERVER ONLY. Conditions are the SQL's own, written once: OPEN is (inStockStores > 0 OR marketplaceOpen), COMPARABLE adds
// listedStores >= 2 (data.ts COMPARABLE).
import type { Row } from "./engine";
import { publicRowsBy } from "./store";

export interface StatProduct {
  /** ProductStat */
  s: Row;
  /** Its Product */
  p: Row;
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);

export const isOpen = (s: Row) => num(s.inStockStores) > 0 || s.marketplaceOpen === true;
export const isComparable = (s: Row) => isOpen(s) || num(s.listedStores) >= 2;

/** Every ProductStat of the market with its Product (a stat whose product is missing is dropped, as the SQL JOIN drops it). */
export function statsInMarket(market: string): StatProduct[] {
  const out: StatProduct[] = [];
  for (const s of publicRowsBy("ProductStat", "market", [market])) {
    const p = publicRowsBy("Product", "id", [s.productId])[0];
    if (p) out.push({ s, p });
  }
  return out;
}

/** The flat card row the SQL selects (CARD_COLUMNS): the stat's card columns, then the product's. */
export function cardRow({ s, p }: StatProduct) {
  return {
    lowestPriceCents: (s.lowestPriceCents as number | null) ?? null,
    inStockStores: num(s.inStockStores),
    listedStores: num(s.listedStores),
    marketplaceOpen: s.marketplaceOpen === true,
    medianOpenCents: (s.medianOpenCents as number | null) ?? null,
    slug: String(p.slug),
    name: String(p.name),
    productType: String(p.productType),
    setCode: (p.setCode as string | null) ?? null,
    imageUrl: (p.imageUrl as string | null) ?? null,
  };
}

/** Postgres ORDER BY of a nullable number: NULLS LAST ascending. */
export function ascNullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return (a as number) - (b as number);
}

/** COLLATE "C": code-point order. */
export function cmpC(a: string, b: string): number {
  if (a === b) return 0;
  let i = 0;
  while (i < a.length && i < b.length && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === a.length) return -1;
  if (i === b.length) return 1;
  return a.codePointAt(i)! - b.codePointAt(i)!;
}

/** array_position(list, v) NULLS LAST as a sort key. */
export function positionIn(list: readonly string[]): (v: unknown) => number {
  const at = new Map(list.map((x, i) => [x, i]));
  return (v) => (typeof v === "string" && at.has(v) ? at.get(v)! : Number.MAX_SAFE_INTEGER);
}
