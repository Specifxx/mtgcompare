// The landing page's "In stock in <region> today" grid (components/HomeRegionGrid.tsx): eight in-stock products of one region, the
// region home's newest Play Booster Boxes and Collector Booster Boxes (data.ts homeRails), four of each, as small cards. Read by
// /api/picks/<region> (CDN-cached a day) and, for the default region, by the landing page itself at build, so the first paint is
// already filled.
import { homeRails } from "./data";
import { REGIONS, type Region } from "./regions";

export interface Pick {
  slug: string;
  name: string;
  type: string;
  img: string | null;
  cents: number | null;
  stores: number;
  tcg: boolean;
}

export const PICK_SLOTS = 8;

export async function regionPicks(region: Region): Promise<Pick[]> {
  const { boxes, etbs: collector } = await homeRails(REGIONS[region].market);
  // Alternate the two types so a short list of one still fills the grid with the other (newest sets first within each).
  const mix: typeof boxes = [];
  for (let i = 0; mix.length < PICK_SLOTS && (i < boxes.length || i < collector.length); i++) {
    if (boxes[i]) mix.push(boxes[i]);
    if (collector[i] && mix.length < PICK_SLOTS) mix.push(collector[i]);
  }
  return mix.map((p) => ({ slug: p.slug, name: p.name, type: p.productType, img: p.imageUrl, cents: p.lowestPriceCents, stores: p.inStockStores, tcg: p.marketplaceOpen }));
}
