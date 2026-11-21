// The landing page's "Most popular in <region> today" (was "Most stocked" until 2026-11-20, owner: most popular first) (components/HomeRegionGrid.tsx): five in-stock products of one region, taken
// from the region home's newest Play Booster Boxes and Collector Booster Boxes (data.ts homeRails, up to eight of each) and ordered
// by price, dearest first (owner, 2026-11-12: lib/feature-floor.ts), then by how many stores have them in stock, newest set first. Read by /api/picks/<region> (CDN-cached a day)
// and, for the default region, by the landing page itself, so the first paint is already filled.
import { homeRails } from "./data";
import { REGIONS, type Region } from "./regions";
import { featureWorthy } from "./feature-floor";
import { rankCards } from "./home-demand";

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
  /** The median open store price (null under two stores). */
  median: number | null;
}

// Ten since 2026-11-13 (owner: "more products shown" on the front page); five before.
export const PICK_SLOTS = 10;

export async function regionPicks(region: Region): Promise<Pick[]> {
  const { boxes, etbs: collector } = await homeRails(REGIONS[region].market);
  // Both lists come newest set first; a stable sort keeps that order among equals. Dearest first, topped up if short.
  const market = REGIONS[region].market;
  // Most likely to earn first (owner, 2026-11-18; lib/home-rank.ts), the feature floor still first (lib/feature-floor.ts), topped up if short.
  const ranked = rankCards([...boxes, ...collector].sort((a, b) => b.inStockStores - a.inStockStores));
  const good = ranked.filter((p) => featureWorthy(p.lowestPriceCents, market));
  const pool = [...good, ...ranked.filter((p) => !good.includes(p))].slice(0, PICK_SLOTS).map((p) => ({ p }));
  return pool
    .map(({ p }) => ({ slug: p.slug, name: p.name, type: p.productType, img: p.imageUrl, cents: p.lowestPriceCents, stores: p.inStockStores, listed: Math.max(p.listedStores, p.inStockStores), tcg: p.marketplaceOpen, median: p.medianOpenCents }));
}
