// owner: WP04
// src/lib/data/stores.ts: C0 STUB (contract 9.3 step 2), the section "stores.ts" of api.ts. Every function below throws until WP04 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
// foldStoreRows is the one exception: api.ts says it is pure and kept byte for byte from OP, so its OP body is carried over instead of a throwing stub.
import type { Condition } from "../constants";

export interface StoreStat { source: string; market: string; offers: number; inStock: number; singlesInStock: number; sealedInStock: number; cheapest: number }
export function getStoreStats(): Promise<StoreStat[]> { throw new Error("not implemented: WP04"); }                                       // P ss/runs.json (4 KB); store ids -> source keys through the registry
export type StoreListing = [uid: number, priceCents: number, condition: Condition | null, url: string];   // uid instead of productId (the finish is part of the unit); url = offerUrl(storeId, market, path)
export interface StoreListings { top: StoreListing[]; cheapestHere: StoreListing[] }
export function getStoreListings(source: string, market: string): Promise<StoreListings> { throw new Error("not implemented: WP04"); }   // P ss/l/<store>-<market>.json, 4 KB
/** Pure; kept byte for byte from OP. The importer's board builder and tests/set-checklist.test.ts use it: the cheapest store price and the distinct store count per product. */
export function foldStoreRows(rows: readonly { productId: number; _min: { priceCents: number | null } }[]): Map<number, { minCents: number; stores: number }> {
  const out = new Map<number, { minCents: number; stores: number }>();
  for (const r of rows) {
    const p = r._min.priceCents;
    if (p == null || p <= 0) continue;
    const prev = out.get(r.productId);
    if (!prev) out.set(r.productId, { minCents: p, stores: 1 });
    else {
      prev.stores++;
      if (p < prev.minCents) prev.minCents = p;
    }
  }
  return out;
}
