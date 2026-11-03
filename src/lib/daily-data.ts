// The Price Duel's product pool (lib/daily.ts): every product a store has in
// stock in the region today, with a photo and a price. One read of the browse
// index the region page already makes; the page is CDN-cached for a day.
import { cardOpen } from "./compact";
import { marketProducts, type ProductCardData } from "./data";
import type { DailyItem } from "./daily";
import type { Market } from "./regions";

export function toDailyItems(cards: readonly ProductCardData[]): DailyItem[] {
  const out: DailyItem[] = [];
  for (const p of cards) {
    if (!cardOpen(p) || p.inStockStores < 1 || p.lowestPriceCents == null || !p.imageUrl) continue;
    out.push({ slug: p.slug, name: p.name, type: p.productType, image: p.imageUrl, cents: p.lowestPriceCents });
  }
  return out;
}

export async function dailyPool(market: Market): Promise<DailyItem[]> {
  return toDailyItems(await marketProducts(market));
}
