// Pure helpers behind the homepage's data (the loaders are src/lib/data/home.ts
// and data/site.ts): the per-market hero stats and the outlier guard of the
// "recently updated" feed. No I/O here, so tests/home.test.ts pins the rules.
// The popular and chase lists are published files (hm/home.json: Scryfall's
// EDHREC rank, then market value; the dearest printings), not a rule of ours.
import { MARKETS, type Country } from "./country";

export interface MarketStat {
  /** Cards with a live listing in this market (Card.low<market> set). */
  priced: number;
  /** In-stock store and TCGplayer offers in this market (eBay excluded). */
  inStock: number;
  /** Stores with an in-stock listing here: distinct `store:*` sources, plus TCGplayer in the US. Never eBay. */
  stores: number;
}

export interface HomeStats {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  /** When the last successful price import finished (ISO), for "prices updated Xh ago". */
  updatedAt: string | null;
  /** Distinct stores live anywhere (the title's "N Stores"). */
  liveStoresAll: number;
}

export interface StoreOfferRow {
  source: string;
  market: string;
  offers: number;
  inStock: number;
}

/** Whether an offer source counts as a store: real stores, and TCGplayer in the US (RiftCompare counts it). Never eBay. */
export function countsAsStore(source: string, market: string): boolean {
  if (source.startsWith("store:")) return true;
  return source === "tcgplayer" && market === "US";
}

export function homeStatsFrom(
  storeOffers: readonly StoreOfferRow[],
  pricedByMarket: Record<Country, number>,
  totalCards: number,
  updatedAt: string | null,
): HomeStats {
  const stores = new Map<string, Set<string>>();
  const inStock = new Map<string, number>();
  const all = new Set<string>();
  for (const r of storeOffers) {
    if (r.source.startsWith("ebay")) continue;
    inStock.set(r.market, (inStock.get(r.market) ?? 0) + r.inStock);
    if (r.inStock > 0 && countsAsStore(r.source, r.market)) {
      let s = stores.get(r.market);
      if (!s) stores.set(r.market, (s = new Set()));
      s.add(r.source);
      all.add(r.source);
    }
  }
  const statsByCountry = Object.fromEntries(
    MARKETS.map((m) => [m, { priced: pricedByMarket[m] ?? 0, inStock: inStock.get(m) ?? 0, stores: stores.get(m)?.size ?? 0 }]),
  ) as Record<Country, MarketStat>;
  return { totalCards, statsByCountry, updatedAt, liveStoresAll: all.size };
}

// ── Recently updated ─────────────────────────────────────────────────────────
// RiftCompare's getRecentlyUpdated: cards whose price changed between the two
// most recent snapshots, biggest moves first. Same outlier guard: a one-step
// swing of +300% or more, or −80% or more, is almost always a mismatched
// listing, not a real move. Cards under US$1 at either end are also skipped
// (a few cents read as a huge percentage).
export const RECENT_OUTLIER_SPIKE = 300;
export const RECENT_OUTLIER_DROP = 80;
export const RECENT_MIN_CENTS = 100;

export interface RecentMove {
  id: number;
  prevCents: number;
  nowCents: number;
  pct: number; // one decimal
}

/** Day-file maps (productId → [market cents, low cents]) → the changed products, biggest |%| first. */
export function recentMoves(
  prev: Record<string, (number | null)[]>,
  last: Record<string, (number | null)[]>,
  isCard: (id: number) => boolean,
  limit = 24,
): RecentMove[] {
  const out: RecentMove[] = [];
  for (const [key, now] of Object.entries(last)) {
    const id = Number(key);
    if (!isCard(id)) continue;
    const before = prev[key];
    const a = before?.[0];
    const b = now[0];
    if (a == null || b == null || a === b) continue;
    if (a < RECENT_MIN_CENTS || b < RECENT_MIN_CENTS) continue;
    const pct = ((b - a) / a) * 100;
    if (pct >= RECENT_OUTLIER_SPIKE || pct <= -RECENT_OUTLIER_DROP) continue;
    out.push({ id, prevCents: a, nowCents: b, pct: Math.round(pct * 10) / 10 });
  }
  out.sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct) || x.id - y.id);
  return out.slice(0, limit);
}
