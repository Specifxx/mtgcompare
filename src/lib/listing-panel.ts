// The eBay view types and pure display selections: the card page's listing panel, the graded tab and the "Chase cards on eBay right now" strip. They live here, not in an
// ebay*.ts module, because components and the Neon-backed loaders import them (tests/no-ebay-api.test.ts: only ebay*.ts files import ebay*.ts files).
//
// The rows come from Neon only (EbayPanel, EbayBest, EbayBanner), written by scripts/ebay.ts after a COMPLETED search (lib/ebay-import.ts). eBay listing data is never a file
// and never reaches GitHub (licence). Nothing here or on a page calls eBay. Listings are display-only: never ranked into a price row, never in alerts or baskets, never counted
// as a store. A URL is never stored: an item id and a market rebuild it with the CURRENT campaign at render.
import type { Country } from "./country";
import type { Finish } from "./constants";

/** One eBay listing of the Listings tab: an entry of EbayPanel.listings, with the row's market and age. */
export interface PanelListing {
  market: Country;
  finish: Finish;
  rank: number;
  priceCents: number;               // ITEM price, in the market's currency
  shippingCents: number | null;     // 0 = free postage stated by the seller; null = not stated
  currency: string;
  itemId: string;
  title: string;
  imageUrl: string | null;          // eBay's own image, hot-linked, never re-hosted
  checkedAt: string;                // ISO: when a COMPLETED search saw it (the age label's source)
}

/** One slab of the Graded tab (PSA, BGS, CGC, SGC). Never an Offer, never in a comparison. */
export interface PanelGraded {
  market: Country;
  itemId: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  title: string;
  imageUrl: string | null;
  grader: string;
  grade: string;                    // "10", "9.5" or "Graded" when the title names a grader and no grade
  checkedAt: string;
}

export interface EbayPanelData {
  listings: PanelListing[];
  graded: PanelGraded[];
}

/** Display caps (contract 10.15): a live tile 24 h, a panel row 48 h; the job sweeps at 72 h. */
export const TILE_MAX_AGE_HOURS = 24;
export const PANEL_MAX_AGE_HOURS = 48;
export const SWEEP_AFTER_HOURS = 72;

const HOUR = 3_600_000;
export const ageHours = (checkedAt: string, now: number): number => Math.max(0, (now - Date.parse(checkedAt)) / HOUR);
export const isFresh = (checkedAt: string, now: number, maxHours: number): boolean => {
  const t = Date.parse(checkedAt);
  return Number.isFinite(t) && now - t <= maxHours * HOUR;
};
/** "Checked 5 h ago" (licence F20: disclose how much older the shown listing is). Under an hour: minutes. Rendered after mount only (hydration-safe). */
export function ageLabel(checkedAt: string, now: number): string {
  const h = ageHours(checkedAt, now);
  if (h < 1) return `Checked ${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `Checked ${Math.round(h)} h ago`;
  return `Checked ${Math.round(h / 24)} d ago`;
}

export const panelTitle = (s: string, n = 70): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Only https images from eBay's own image hosts are rendered (a stored value is never trusted blindly). */
export function safeEbayImage(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)ebayimg\.com$/i.test(x.hostname) ? x.toString() : null;
  } catch {
    return null;
  }
}

/** The eBay domain of each market (SG reroutes to ebay.com; EU is Spain). The same table as lib/affiliate.ts, so an item URL needs no ebay*.ts import. */
const ITEM_HOST: Record<Country, string> = { US: "www.ebay.com", AU: "www.ebay.com.au", UK: "www.ebay.co.uk", SG: "www.ebay.com", CA: "www.ebay.ca", EU: "www.ebay.es" };
/** The plain item URL; the caller tags it with ebayAffiliateUrl(url, source). Only digits and "|" survive in the id. */
export function itemUrl(market: Country, itemId: string): string {
  const id = itemId.replace(/[^0-9|]/g, "");
  return `https://${ITEM_HOST[market] ?? ITEM_HOST.US}/itm/${id.split("|")[1] || id.split("|")[0]}`;
}

/** The listing panel's rows for one market, headline pick first, at most `limit`, none older than the display cap. */
export function panelFor(data: EbayPanelData, market: Country, now: number, limit = 8): { listings: PanelListing[]; graded: PanelGraded[] } {
  const listings = data.listings.filter((l) => l.market === market && isFresh(l.checkedAt, now, PANEL_MAX_AGE_HOURS)).sort((a, b) => a.rank - b.rank).slice(0, limit);
  const graded = data.graded.filter((g) => g.market === market && isFresh(g.checkedAt, now, PANEL_MAX_AGE_HOURS)).slice(0, 6);
  return { listings, graded };
}

// ── the chase strip ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A card of the public chase pool (hm/home.json chase): art plus a search link, buyable with no eBay data at all. */
export interface ChaseArt {
  id: number;
  slug: string;
  name: string;
  setCode: string;
  label: string | null;             // the treatment text ("Borderless", "Serialized")
  finish: Finish;
  marketCents: number | null;       // TCGplayer market, USD cents
  imageUrl: string | null;
}

/** A live eBay listing for a pool card in ONE market (an entry of the EbayBanner payload). */
export interface ChaseLive {
  id: number;
  name: string;
  label: string | null;
  setCode: string | null;
  finish: Finish;
  market: Country;
  priceCents: number;
  currency: string;
  freeShipping: boolean;
  itemId: string;
  imageUrl: string;
  checkedAt: string;
  marketCents: number | null;
}

export type ChaseTile = { kind: "live"; live: ChaseLive } | { kind: "art"; art: ChaseArt };
export const tileId = (t: ChaseTile): number => (t.kind === "live" ? t.live.id : t.art.id);
export const tileSet = (t: ChaseTile): string => ((t.kind === "live" ? t.live.setCode : t.art.setCode) ?? "").toLowerCase();
export const tileName = (t: ChaseTile): string => (t.kind === "live" ? t.live.name : t.art.name).toLowerCase();
const tileValue = (t: ChaseTile): number => (t.kind === "live" ? t.live.marketCents : t.art.marketCents) ?? 0;

/**
 * What the strip shows (affiliates-banners brief 7.4): live tiles of the visitor's market first, in pool order (dearest first within the pool), then art tiles to fill; the first
 * `diverse` places take at most one card per set and one per name; a live entry older than the display cap, or one the payload cannot place, never shows (its art tile does).
 * Pure: `now` is a parameter, so the server render (now = null: no live tiles) and the client agree on structure.
 */
export function pickVisible(art: readonly ChaseArt[], live: readonly ChaseLive[], market: Country, now: number | null, limit = 6, diverse = 6): ChaseTile[] {
  const liveHere = now == null ? [] : live.filter((l) => l.market === market && safeEbayImage(l.imageUrl) && isFresh(l.checkedAt, now, TILE_MAX_AGE_HOURS));
  const liveIds = new Set(liveHere.map((l) => l.id));
  const ordered: ChaseTile[] = [
    ...[...liveHere].sort((a, b) => (b.marketCents ?? 0) - (a.marketCents ?? 0) || a.id - b.id).map((l): ChaseTile => ({ kind: "live", live: l })),
    ...art.filter((a) => !liveIds.has(a.id)).map((a): ChaseTile => ({ kind: "art", art: a })),
  ];
  const out: ChaseTile[] = [];
  const sets = new Set<string>(), names = new Set<string>(), ids = new Set<number>();
  const rest: ChaseTile[] = [];
  for (const t of ordered) {
    if (ids.has(tileId(t))) continue;
    if (out.length < Math.min(diverse, limit) && (sets.has(tileSet(t)) || names.has(tileName(t)))) { rest.push(t); continue; }
    out.push(t); ids.add(tileId(t)); sets.add(tileSet(t)); names.add(tileName(t));
    if (out.length >= limit) return out;
  }
  for (const t of rest) { if (out.length >= limit) break; if (!ids.has(tileId(t))) { out.push(t); ids.add(tileId(t)); } }
  // a deterministic fill by value when the pool is short on the first pass
  return out.length >= limit ? out : [...out, ...ordered.filter((t) => !ids.has(tileId(t))).sort((a, b) => tileValue(b) - tileValue(a)).slice(0, limit - out.length)];
}

/** The eBay search words for a pool card on a plain affiliate search tile: name (front face, no commas: a comma means OR), set and the finish/treatment words sellers write. */
export function chaseQuery(c: { name: string; setCode?: string | null; label?: string | null; finish?: Finish }): string {
  const front = c.name.split(" // ")[0]!.replace(/\([^)]*\)/g, " ").replace(/,/g, " ");
  const words = [front, c.setCode ?? "", c.label ? c.label.replace(/·/g, " ") : "", c.finish === "F" ? "foil" : "", "mtg"].join(" ");
  return words.replace(/\s+/g, " ").trim();
}
