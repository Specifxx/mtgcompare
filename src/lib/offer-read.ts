// src/lib/offer-read.ts (owner WP02, FROZEN). THE shared reader of live offers for libraries and scripts that must not go through the page loaders (price alerts, deck/sealed/release watches, watchlist, inbox, the admin, the eBay job).
// It owns the freshness rule (inStock AND the (store, market) run of ss/runs.json newer than STALE_HOURS and ok) and the synthesis of the TCGplayer row from px, so no library re-implements either.
// CHANGED against the Neon-era module: the source is a PlaneSource (the site's pinned HTTP source in a request; `fsSource(".data/v1")` over a checkout of the pointed commit in an Actions job), not a database. The SAME function runs in both places.
// eBay is never returned (it is not in any published file). Not under src/app, not a page loader: called only from the per-user libraries named in CLAUDE.md and from scripts.
import type { Country } from "./country";
import { MARKETS } from "./country";
import { CONDITIONS, STALE_HOURS, tcgplayerUrl, type Condition, type Finish, type UnitRef } from "./constants";
import type { OfferFile, OfferTuple, PxFile, PxRow, StoreRunsFile } from "./data/plane/formats";
import { bucketPath, cardBucket } from "./data/plane/shards";
import type { PlaneSource } from "./data/plane/source";
import { offerUrl, sourceOfStoreId } from "./stores";

export interface LiveOffer { productId: number; finish: Finish; market: Country; storeId: number; source: string; priceCents: number; currency: string; url: string; condition: Condition | null; inStock: boolean; refreshedAt: Date }
export const OFFER_STALE_MS = STALE_HOURS * 3_600_000;
const CURRENCY: Record<Country, string> = { US: "USD", AU: "AUD", UK: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" };

/** Pure: the live offers of the given units from already-read buckets. `of` = the offer tuples of the buckets, `px` = the price rows (only for the TCGplayer synthesis), `runs` = ss/runs.json. Rows of a stale or failed feed come back with inStock false (never dropped, so a page can grey them). */
export interface StoreRegistry { sourceOfStoreId(id: number): string | null; offerUrl(storeId: number, market: Country, path: string): string | null }
const REGISTRY: StoreRegistry = { sourceOfStoreId, offerUrl };                                          // the registry of WP04; a test injects a stand-in built from tests/fixtures/store-ids.json
export function liveOffersFrom(units: readonly UnitRef[], of: readonly OfferTuple[], px: ReadonlyMap<number, PxRow>, runs: StoreRunsFile | null, o: { market?: Country; includeTcgplayer?: boolean; now?: number; registry?: StoreRegistry } = {}): LiveOffer[] {
  const reg = o.registry ?? REGISTRY;
  const now = o.now ?? Date.now(), want = new Map(units.map((u) => [u.id * 2 + (u.finish === "F" ? 1 : 0), u] as const));
  const run = new Map<number, { at: Date; ok: boolean }>(); for (const r of runs?.r ?? []) run.set(r[0] * 8 + r[1], { at: new Date(r[2]), ok: r[3] === 1 });
  const out: LiveOffer[] = [];
  for (const t of of) {
    const u = want.get(t[0]); if (!u) continue;
    const market = MARKETS[t[1]] as Country | undefined; if (!market || (o.market && market !== o.market)) continue;
    const src = reg.sourceOfStoreId(t[2]), url = reg.offerUrl(t[2], market, t[6]); if (!src || !url) continue;                                   // a retired store id drops the row, never renders it broken
    const rr = run.get(t[2] * 8 + t[1]), fresh = !!rr && rr.ok && now - rr.at.getTime() < OFFER_STALE_MS;
    out.push({ productId: u.id, finish: u.finish, market, storeId: t[2], source: src, priceCents: t[3], currency: CURRENCY[market], url, condition: t[4] == null ? null : (CONDITIONS[t[4]] ?? null), inStock: t[5] === 1 && fresh, refreshedAt: rr?.at ?? new Date(0) });
  }
  if (o.includeTcgplayer && (!o.market || o.market === "US")) for (const u of units) {
    const row = px.get(u.id); const low = row ? (u.finish === "N" ? row[3] : row[4]) : null; if (low == null) continue;
    out.push({ productId: u.id, finish: u.finish, market: "US", storeId: 0, source: "tcgplayer", priceCents: low, currency: "USD", url: tcgplayerUrl(u.id, u.finish), condition: null, inStock: true, refreshedAt: new Date(now) });
  }
  return out;
}
/** Offers of the given units (cards: {id, finish}), optionally one market. includeTcgplayer adds one synthesised row per finish that has a TCGplayer low (market US, source "tcgplayer", storeId 0). Reads the `of` (and `px`) bucket of each distinct card bucket and ss/runs.json: a unit that is not tracked has no offer file and yields nothing. */
export async function readLiveOffers(src: PlaneSource, q: { units: readonly UnitRef[]; market?: Country; includeTcgplayer?: boolean; now?: number; registry?: StoreRegistry }): Promise<LiveOffer[]> {
  const buckets = [...new Set(q.units.map((u) => cardBucket(u.id)))].sort((a, b) => a - b);
  const get = async <T,>(rel: string): Promise<T | null> => { try { return await src.json<T>(rel); } catch { return null; } };
  const [ofs, pxs, runs] = await Promise.all([Promise.all(buckets.map((b) => get<OfferFile>(bucketPath("of", b)))), q.includeTcgplayer ? Promise.all(buckets.map((b) => get<PxFile>(bucketPath("px", b)))) : Promise.resolve([] as (PxFile | null)[]), get<StoreRunsFile>("ss/runs.json")]);
  const px = new Map<number, PxRow>(); for (const f of pxs) for (const r of f?.p ?? []) px.set(r[0], r);
  return liveOffersFrom(q.units, ofs.flatMap((f) => f?.o ?? []), px, runs, q);
}
