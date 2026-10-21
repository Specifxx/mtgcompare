// What a blog post's live blocks show: capped reads of the current listings in every market (src/content/live.ts), once per
// render (the page is force-dynamic and kept by the CDN for a day). Nothing here is history.
import { boxesIn, familyIn, lastCheckedAnywhere, marketCounts, namedAcross, topStores, type MarketCard, type MarketCount, type StoreRow } from "@/content/live";
import { STAR_TREK_WORDS } from "@/content/star-trek";
import { REGION_LIST, type Market } from "@/lib/regions";
import type { PostSlug } from "./index";

export interface PostData {
  today: string;
  checked: string | null;
  /** Booster boxes in stock, per market (cheapest or dearest first, as the post reads them). */
  boxes: MarketCard[];
  /** Products named for the post's release (Star Trek), every market. */
  named: MarketCard[];
  counts: MarketCount[];
  stores: Partial<Record<Market, StoreRow[]>>;
}

export const emptyPostData = (today: string, checked: string | null = null): PostData => ({ today, checked, boxes: [], named: [], counts: [], stores: {} });

const perMarket = async (f: (m: Market) => Promise<{ name: string }[]>): Promise<MarketCard[]> =>
  (await Promise.all(REGION_LIST.map(async (r) => (await f(r.market)).map((p) => ({ ...(p as MarketCard), market: r.market }))))).flat();

export async function loadPostData(slug: PostSlug, now: Date = new Date()): Promise<PostData> {
  const today = now.toISOString().slice(0, 10);
  const checked = lastCheckedAnywhere();
  const d = emptyPostData(today);
  switch (slug) {
    case "cheapest-magic-booster-boxes":
      d.boxes = await perMarket((m) => boxesIn(m, 8, "asc"));
      break;
    case "magic-booster-box-prices":
      d.boxes = await perMarket((m) => boxesIn(m, 8, "desc"));
      break;
    case "are-magic-cards-cheaper-abroad":
      d.boxes = await perMarket(async (m) => [...(await familyIn(m, "play-box", 30)), ...(await familyIn(m, "collector-box", 30))]);
      break;
    case "where-to-buy-magic-cards": {
      const [counts, stores] = await Promise.all([marketCounts(), Promise.all(REGION_LIST.map(async (r) => [r.market, await topStores(r.market, 5)] as const))]);
      d.counts = counts;
      d.stores = Object.fromEntries(stores);
      break;
    }
    default:
      d.named = await namedAcross(STAR_TREK_WORDS, 40);
  }
  return { ...d, checked: await checked };
}
