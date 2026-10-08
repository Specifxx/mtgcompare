// owner: WP04
// src/lib/data/stores.ts: the section "stores.ts" of api.ts (contract 7.12). Store stats and listings are PUBLISHED FILES (ss/runs.json, ss/l/<store>-<market>.json) read through the PlaneSource of the request; no database,
// no unstable_cache (kind P and M of contract 7.5). The names, arguments, result types, cache kinds and tags are FROZEN: change the BODY only, add exports, never rename (requests/ protocol, 9.4).
// foldStoreRows is the one exception: api.ts says it is pure and kept byte for byte from OP, so its OP body is carried over instead of a throwing stub.
import { CONDITIONS, STALE_HOURS, type Condition } from "../constants";
import { MARKETS, MARKET_INDEX, isCountry, type Country } from "../country";
import { offerUrl, storeById, storeForSource } from "../stores";
import type { StoreListingsFile, StoreRunsFile } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { storeListingsPath } from "./plane/shards";

export interface StoreStat { source: string; market: string; offers: number; inStock: number; singlesInStock: number; sealedInStock: number; cheapest: number }
/**
 * P ss/runs.json (4 KB), memoised per data commit (M). One row per (store, market) pair the importer has read; store ids turn into `store:<key>` sources through the registry (a retired id is dropped).
 * A pair whose last COMPLETED read is older than STALE_HOURS at the time the data was published counts nothing in stock: the same rule the offers themselves follow (offer-read.ts).
 */
export function getStoreStats(): Promise<StoreStat[]> {
  return planeSource().then(({ src, ptr }) => memoByRef("stores:stats", memoKey(ptr), async () => {
    const runs = await optionalOf<StoreRunsFile>(src, "ss/runs.json");
    const asOf = Date.parse(ptr.publishedAt);
    const out: StoreStat[] = [];
    for (const [id, m, at, , offers, inStock, singles, sealed, cheapest] of runs?.r ?? []) {
      const s = storeById(id), market: Country | undefined = MARKETS[m];
      if (!s || !market) continue;
      const fresh = Number.isFinite(asOf) && asOf - Date.parse(at) <= STALE_HOURS * 3_600_000;
      out.push({ source: `store:${s.key}`, market, offers, inStock: fresh ? inStock : 0, singlesInStock: fresh ? singles : 0, sealedInStock: fresh ? sealed : 0, cheapest: fresh ? cheapest : 0 });
    }
    return out.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.market < b.market ? -1 : 1));
  }));
}
export type StoreListing = [uid: number, priceCents: number, condition: Condition | null, url: string];   // uid instead of productId (the finish is part of the unit); url = offerUrl(storeId, market, path)
export interface StoreListings { top: StoreListing[]; cheapestHere: StoreListing[] }
/** P ss/l/<store>-<market>.json, 4 KB: the store's dearest listings and the ones where it is the cheapest in its market. Empty for an unknown source or a pair never read. */
export async function getStoreListings(source: string, market: string): Promise<StoreListings> {
  const store = storeForSource(String(source ?? "")), m = String(market ?? "").toUpperCase();
  if (!store || !isCountry(m)) return { top: [], cheapestHere: [] };
  const { src } = await planeSource();
  const f = await optionalOf<StoreListingsFile>(src, storeListingsPath(store.id, MARKET_INDEX[m]));
  const rows = (list: StoreListingsFile["top"] | undefined): StoreListing[] => (list ?? []).flatMap((t) => {
    const url = offerUrl(store.id, m, t[3]);
    return url ? [[t[0], t[1], t[2] == null ? null : CONDITIONS[t[2]] ?? null, url] as StoreListing] : [];
  });
  return { top: rows(f?.top), cheapestHere: rows(f?.cheapestHere) };
}
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
