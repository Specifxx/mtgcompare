// The landing page's "Most stocked in <region> today" (components/HomeRegionGrid.tsx): five in-stock products of one region, taken
// from the region home's newest Play Booster Boxes and Collector Booster Boxes (data.ts homeRails, up to eight of each) and ordered
// by how many of the region's stores have them in stock, newest set first on a tie. Read by /api/picks/<region> (CDN-cached a day)
// and, for the default region, by the landing page itself, so the first paint is already filled.
import { homeRails } from "./data";
import { REGIONS, type Region } from "./regions";

export interface Pick {
  slug: string;
  name: string;
  type: string;
  img: string | null;
  cents: number | null;
  stores: number;
  /** Independent stores that list it (in stock or not): "in stock at 12 of 15 stores". */
  listed: number;
  tcg: boolean;
}

export const PICK_SLOTS = 5;

export async function regionPicks(region: Region): Promise<Pick[]> {
  const { boxes, etbs: collector } = await homeRails(REGIONS[region].market);
  // Both lists come newest set first; a stable sort by store count keeps that order among equals.
  const pool = [...boxes, ...collector].map((p, i) => ({ p, i }));
  pool.sort((a, b) => b.p.inStockStores - a.p.inStockStores || a.i - b.i);
  return pool
    .slice(0, PICK_SLOTS)
    .map(({ p }) => ({ slug: p.slug, name: p.name, type: p.productType, img: p.imageUrl, cents: p.lowestPriceCents, stores: p.inStockStores, listed: Math.max(p.listedStores, p.inStockStores), tcg: p.marketplaceOpen }));
}
