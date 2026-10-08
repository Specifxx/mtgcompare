// owner: WP05
// src/lib/data/ebay.ts: the section "ebay.ts" of api.ts (contract 7.12), kind N. eBay data is NEON ONLY (EbayPanel, EbayBest, EbayBanner): it is never a published file and never reaches GitHub (licence).
// The names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
//
// Both loaders are called from /api routes in the browser, never from the server render of a public page (tests/public-no-neon.test.ts): a crawler that does not run scripts never wakes the database.
// A failed read THROWS inside the cached callback (an empty panel is never stored for six hours) and the loader catches outside it: a database that is down, rotated or deleted gives an empty bundle /
// null and the page shows plain affiliate eBay search tiles. The job purges the tag after every run that wrote (POST /api/revalidate?tag=ebay-banner).
// This module reads no plane file, so it may hold unstable_cache (tests/nested-cache.test.ts). It imports no ebay*.ts module (tests/no-ebay-api.test.ts): the pure payload code is lib/ebay-banner.ts, used by the job.
import { unstable_cache } from "next/cache";
import type { Country } from "../country";
import { MARKETS, marketFromIndex } from "../country";
import { finishFromIndex, type Finish } from "../constants";
import { prisma } from "../db";
import type { PanelGraded, PanelListing } from "../listing-panel";
import { PANEL_MAX_AGE_HOURS, safeEbayImage } from "../listing-panel";
import { EBAY_BANNER_TAG, TTL } from "./core";

export interface EbayPanelBundle { best: { finish: Finish; market: Country; priceCents: number; shipCents: number | null; itemId: string; checkedAt: string }[]; listings: PanelListing[]; graded: PanelGraded[] }   // PanelListing / PanelGraded live in listing-panel.ts (tests/no-ebay-api.test.ts forbids a non-ebay*.ts file importing an ebay*.ts module)
/**
 * One LIVE LISTING for a pool printing in one market. `ship` is true when the seller stated free postage, false when postage is charged, null when it is not stated. The additive optional fields
 * (finish, sc, label, usd) let the strip order and describe a tile without a catalogue read; a reader that ignores them still renders (REQ-WP05 amendment, requests/AMENDMENTS.md).
 */
export interface BannerTile { id: number; name: string; image: string | null; cents: number; ship: boolean | null; market: Country; itemId: string; checkedAt: string; finish?: Finish; sc?: string; label?: string; usd?: number }
export interface BannerPayloadV1 { v: 1; builtAt: number; tiles: BannerTile[] }                   // <= 100 KB, asserted

const EMPTY: EbayPanelBundle = { best: [], listings: [], graded: [] };
const asArray = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** The stored rows of one product as the bundle. Pure: a malformed entry is dropped, never thrown on; a row older than the panel display cap is not served. */
export function bundleOf(
  best: { finish: number; market: number; priceCents: number; shipCents: number | null; itemId: string; checkedAt: Date }[],
  panels: { market: number; checkedAt: Date; listings: unknown; graded: unknown }[],
  now: number = Date.now(),
): EbayPanelBundle {
  const fresh = (d: Date): boolean => now - d.getTime() <= PANEL_MAX_AGE_HOURS * 3_600_000;
  const out: EbayPanelBundle = { best: [], listings: [], graded: [] };
  for (const b of best) if (fresh(b.checkedAt)) out.best.push({ finish: finishFromIndex(b.finish), market: marketFromIndex(b.market), priceCents: b.priceCents, shipCents: b.shipCents, itemId: b.itemId, checkedAt: b.checkedAt.toISOString() });
  for (const p of panels) {
    if (!fresh(p.checkedAt)) continue;
    const market = marketFromIndex(p.market); const at = p.checkedAt.toISOString();
    for (const l of asArray(p.listings)) {
      const price = num(l.priceCents), id = str(l.itemId), cur = str(l.currency);
      if (price == null || price <= 0 || !id || !cur) continue;
      out.listings.push({ market, finish: finishFromIndex(num(l.finish) ?? 0), rank: num(l.rank) ?? out.listings.length, priceCents: price, shippingCents: num(l.shipCents), currency: cur, itemId: id, title: (str(l.title) ?? "").slice(0, 200), imageUrl: safeEbayImage(str(l.image)), checkedAt: at });
    }
    for (const g of asArray(p.graded)) {
      const price = num(g.priceCents), id = str(g.itemId), cur = str(g.currency), grader = str(g.grader);
      if (price == null || price <= 0 || !id || !cur || !grader) continue;
      out.graded.push({ market, itemId: id, priceCents: price, shippingCents: num(g.shipCents), currency: cur, title: (str(g.title) ?? "").slice(0, 200), imageUrl: safeEbayImage(str(g.image)), grader, grade: str(g.grade) ?? "Graded", checkedAt: at });
    }
  }
  return out;
}

const readPanel = unstable_cache(
  async (productId: number): Promise<EbayPanelBundle> => {
    const [best, panels] = await Promise.all([
      prisma.ebayBest.findMany({ where: { productId }, select: { finish: true, market: true, priceCents: true, shipCents: true, itemId: true, checkedAt: true } }),
      prisma.ebayPanel.findMany({ where: { productId }, select: { market: true, checkedAt: true, listings: true, graded: true } }),
    ]);
    return bundleOf(best, panels);
  },
  ["ebay-panel-v1"],
  { tags: [EBAY_BANNER_TAG], revalidate: TTL.hours6 },
);
export async function getEbayPanel(productId: number): Promise<EbayPanelBundle> {                  // N tag EBAY_BANNER_TAG; callers call it ONLY when CardDetail.tracked != 0; an empty bundle when Neon is down
  if (!Number.isInteger(productId) || productId <= 0) return EMPTY;
  try { return await readPanel(productId); } catch { return EMPTY; }
}

const readBanner = unstable_cache(
  async (): Promise<BannerPayloadV1 | null> => {
    const row = await prisma.ebayBanner.findUnique({ where: { key: "v1" }, select: { payload: true } });
    if (!row) return null;
    return parseBannerRow(row.payload);
  },
  ["chase-banner-v1"],
  { tags: [EBAY_BANNER_TAG], revalidate: TTL.hours6 },
);
/** The stored Json as a v1 payload, or null. Pure; the same rules as lib/ebay-banner.ts parsePayload (kept here so this module imports no ebay*.ts file). */
export function parseBannerRow(x: unknown): BannerPayloadV1 | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { v?: unknown; builtAt?: unknown; tiles?: unknown };
  if (o.v !== 1 || typeof o.builtAt !== "number" || !Array.isArray(o.tiles)) return null;
  const tiles: BannerTile[] = [];
  for (const raw of o.tiles) {
    const t = raw as Partial<BannerTile> | null;
    if (!t || typeof t.id !== "number" || typeof t.name !== "string" || typeof t.cents !== "number" || t.cents <= 0 || typeof t.itemId !== "string" || typeof t.checkedAt !== "string" || !Number.isFinite(Date.parse(t.checkedAt))) continue;
    if (typeof t.market !== "string" || !(MARKETS as string[]).includes(t.market) || !safeEbayImage(t.image ?? null)) continue;
    tiles.push({ ...(t as BannerTile), ship: t.ship === true ? true : t.ship === false ? false : null });
  }
  return { v: 1, builtAt: o.builtAt, tiles };
}
export async function getChaseBanner(): Promise<BannerPayloadV1 | null> {                          // N EbayBanner row; the chase POOL is public (hm/home.json chase), the listings are not; null -> plain affiliate search tiles. getEbayPicks and getChaseStrip are REMOVED
  try { return await readBanner(); } catch { return null; }
}
