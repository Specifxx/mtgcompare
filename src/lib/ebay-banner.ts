// The chase-strip payload: ONE EbayBanner row (key "v1"), written only by the eBay job after a COMPLETED search (lib/ebay-import.ts) and read by one loader (getChaseBanner, lib/data/ebay.ts).
// Pure: build, merge, trim and validate. The payload holds LIVE LISTINGS only (itemId, price, eBay's own image, age); the pool of cards (art, names, the search-link fallback) is public and comes
// from the published home feed, so a deleted or unreachable database leaves a strip of plain affiliate search tiles, never a blank. A listing URL is never stored: the item id and the
// market rebuild it with the current campaign at render. No seller identity. Display only.
import type { Country } from "./country";
import type { Finish } from "./constants";
import type { BannerPayloadV1, BannerTile } from "./data/ebay";
import { TILE_MAX_AGE_HOURS, safeEbayImage } from "./listing-panel";

export const BANNER_KEY = "v1";
export const BANNER_MAX_BYTES = 100_000;
/** A tile not refreshed within this many hours is dropped at merge time (the display cap is 24 h; 36 h leaves one missed run). */
export const BANNER_KEEP_HOURS = 36;
export const BANNER_MARKETS: Country[] = ["US", "UK", "AU", "EU", "CA"];

const HOUR = 3_600_000;
export const tileKey = (t: Pick<BannerTile, "id" | "market"> & { finish?: Finish }): string => `${t.id}|${t.finish ?? "N"}|${t.market}`;
export const emptyPayload = (now: number): BannerPayloadV1 => ({ v: 1, builtAt: Math.floor(now / 1000), tiles: [] });

/** One tile from a screened listing. `freeShipping` is true only when the seller stated zero postage, null when postage is not stated. */
export function tileOf(p: {
  id: number; name: string; finish: Finish; market: Country; priceCents: number; shipCents: number | null; itemId: string; imageUrl: string | null; checkedAt: Date; setCode?: string | null; label?: string | null; marketCents?: number | null;
}): BannerTile | null {
  const image = safeEbayImage(p.imageUrl);
  if (!image || !p.itemId || p.priceCents <= 0) return null;
  const t: BannerTile = { id: p.id, name: p.name.slice(0, 80), image, cents: p.priceCents, ship: p.shipCents == null ? null : p.shipCents === 0, market: p.market, itemId: p.itemId, checkedAt: p.checkedAt.toISOString(), finish: p.finish };
  if (p.setCode) t.sc = p.setCode.toLowerCase();
  if (p.label) t.label = p.label.slice(0, 40);
  if (p.marketCents != null) t.usd = p.marketCents;
  return t;
}

export interface BannerUpdate {
  /** a listing found by a completed search */
  fresh: BannerTile[];
  /** pool printings whose name was searched to completion in a market with NO usable listing: their old tile is removed (yesterday's listing is not evidence of today's) */
  cleared: { id: number; market: Country }[];
  /** the current pool: a tile for a printing that left it is dropped */
  poolIds: ReadonlySet<number>;
}
/** merge(previous payload, this run's results): fresh replaces, cleared removes, the rest stays while it is younger than BANNER_KEEP_HOURS. Ordered by value, dearest first, ties by id. */
export function mergeBanner(prev: BannerPayloadV1 | null, u: BannerUpdate, now: number): BannerPayloadV1 {
  const out = new Map<string, BannerTile>();
  const cleared = new Set(u.cleared.map((c) => `${c.id}|${c.market}`));
  for (const t of prev?.tiles ?? []) {
    if (!u.poolIds.has(t.id) || cleared.has(`${t.id}|${t.market}`)) continue;
    if (now - Date.parse(t.checkedAt) > BANNER_KEEP_HOURS * HOUR) continue;
    out.set(tileKey(t), t);
  }
  for (const t of u.fresh) if (u.poolIds.has(t.id)) { out.set(tileKey(t), t); }
  const tiles = [...out.values()].sort((a, b) => (b.usd ?? b.cents) - (a.usd ?? a.cents) || a.id - b.id || a.market.localeCompare(b.market));
  return trimToBudget({ v: 1, builtAt: Math.floor(now / 1000), tiles });
}
export const payloadBytes = (p: BannerPayloadV1): number => Buffer.byteLength(JSON.stringify(p), "utf8");
/** The payload is asserted at most 100 KB: drop the lowest-ranked tiles (the tail of the value order) until it fits. */
export function trimToBudget(p: BannerPayloadV1, max = BANNER_MAX_BYTES): BannerPayloadV1 {
  let tiles = p.tiles;
  while (tiles.length && payloadBytes({ ...p, tiles }) > max) tiles = tiles.slice(0, Math.max(0, tiles.length - Math.max(1, Math.ceil(tiles.length * 0.1))));
  return tiles === p.tiles ? p : { ...p, tiles };
}

/** Read a stored Json value defensively: anything that is not a v1 payload with well-formed tiles is null (the strip then shows plain search tiles). */
export function parsePayload(x: unknown): BannerPayloadV1 | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { v?: unknown; builtAt?: unknown; tiles?: unknown };
  if (o.v !== 1 || typeof o.builtAt !== "number" || !Array.isArray(o.tiles)) return null;
  const tiles: BannerTile[] = [];
  for (const raw of o.tiles) {
    const t = raw as Partial<BannerTile> | null;
    if (!t || typeof t.id !== "number" || typeof t.name !== "string" || typeof t.cents !== "number" || typeof t.itemId !== "string" || typeof t.checkedAt !== "string" || typeof t.market !== "string") continue;
    if (!BANNER_MARKETS.includes(t.market as Country) || !Number.isFinite(Date.parse(t.checkedAt)) || t.cents <= 0) continue;
    if (!safeEbayImage(t.image ?? null)) continue;
    tiles.push({ ...(t as BannerTile), ship: t.ship === true ? true : t.ship === false ? false : null });
  }
  return { v: 1, builtAt: o.builtAt, tiles };
}

/** Per market: the age in hours of the OLDEST tile and the tile count (/admin/ebay: amber over 48 h; the licence sweep is 72 h). */
export function freshnessByMarket(p: BannerPayloadV1 | null, now: number): Record<string, { tiles: number; oldestHours: number | null }> {
  const out: Record<string, { tiles: number; oldestHours: number | null }> = {};
  for (const m of BANNER_MARKETS) out[m] = { tiles: 0, oldestHours: null };
  for (const t of p?.tiles ?? []) {
    const e = out[t.market]!; e.tiles++;
    const h = Math.max(0, (now - Date.parse(t.checkedAt)) / HOUR);
    e.oldestHours = Math.max(e.oldestHours ?? 0, Math.round(h * 10) / 10);
  }
  return out;
}
/** Tiles the display would still show right now. */
export const displayable = (p: BannerPayloadV1 | null, now: number): BannerTile[] => (p?.tiles ?? []).filter((t) => now - Date.parse(t.checkedAt) <= TILE_MAX_AGE_HOURS * HOUR);
