// Helpers the two Amazon scripts share: the public catalogue, read straight from data/public/ (the files the import
// just exported), per region: the products with an in-stock store offer in that market, most-compared first.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REGIONS, type Region } from "../src/lib/regions";

export interface PubProduct { id: string; groupKey: string; slug: string; name: string; productType: string; setCode: string | null }
interface PubOffer { productId: string; store: string; market: string; priceCents: number; inStock: boolean; marketplace?: boolean }

const PUBLIC = path.join(process.cwd(), "data", "public");
const read = <T,>(f: string): T[] => (existsSync(path.join(PUBLIC, f)) ? (JSON.parse(readFileSync(path.join(PUBLIC, f), "utf8")) as T[]) : []);

/** The region's products with at least one in-stock store offer, with those offers' prices (cents): most stores, then dearest, first. */
export function regionProducts(region: Region): { p: PubProduct; prices: number[] }[] {
  const market = REGIONS[region].market;
  const prices = new Map<string, number[]>();
  for (const o of read<PubOffer>("offers.json")) {
    if (o.market !== market || !o.inStock || o.marketplace || !(o.priceCents > 0)) continue;
    prices.set(o.productId, [...(prices.get(o.productId) ?? []), o.priceCents]);
  }
  return read<PubProduct>("products.json")
    .filter((p) => prices.has(p.id))
    .map((p) => ({ p, prices: prices.get(p.id)!.sort((a, b) => a - b) }))
    .sort((a, b) => b.prices.length - a.prices.length || b.prices[0] - a.prices[0]);
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
