// The landing page's market report ("Magic sealed prices today"): the numbers behind its written-out sections, read once per render
// from the public data files through the same capped reads the guides use (src/content/guides/more-data.ts, src/lib/data.ts). The
// page is force-dynamic and kept a day by Vercel's CDN (next.config.js CDN_PAGES "/"), so this runs about once a day per edge.
//
// Every read is one market and capped: per region, one count overview and the cheapest open product of four types; for the default
// region (the US), the open prices of the same four types (at most 300 rows each) for the price ranges. No new data file, no history
// claim beyond what data/public/price-history.json holds (the weekly wrap, empty until a week of snapshots exists).
import type { ProductCardData } from "./data";
import { allRegionOverviews } from "./data";
import { REGION_LIST, REGIONS, X_DEFAULT_REGION, type Region } from "./regions";
import { openOfType, priceSpread, wrapFor, cardsFor, type Wrap } from "../content/guides/more-data";

/** The four product types the report prices, in the order it writes them. */
export const REPORT_TYPES = ["Play Booster Box", "Collector Booster Box", "Bundle", "Commander Deck"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface RegionLine {
  region: Region;
  products: number;
  open: number;
  stores: number;
  /** The cheapest open product of each type in the region, or null. */
  cheapest: Partial<Record<ReportType, ProductCardData | null>>;
}

export interface TypeRange {
  type: ReportType;
  low: number;
  median: number;
  high: number;
  n: number;
  /** The cheapest three open products of the type (the "cheapest today" lists). */
  top: ProductCardData[];
  /** The open product of the type held by the most stores. */
  widest: ProductCardData | null;
}

export interface HomeReport {
  region: Region;
  regions: RegionLine[];
  ranges: TypeRange[];
  wrap: Wrap;
  wrapCards: ProductCardData[];
}

export async function loadHomeReport(region: Region = X_DEFAULT_REGION): Promise<HomeReport> {
  const market = REGIONS[region].market;
  const [overviews, regions, ranges] = await Promise.all([
    allRegionOverviews(),
    Promise.all(
      REGION_LIST.map(async (r) => {
        const cheapest = Object.fromEntries(await Promise.all(REPORT_TYPES.map(async (t) => [t, (await openOfType(r.market, t, 1))[0] ?? null] as const)));
        return { region: r.region, cheapest };
      }),
    ),
    Promise.all(
      REPORT_TYPES.map(async (type): Promise<TypeRange | null> => {
        const rows = await openOfType(market, type, 300);
        const s = priceSpread(rows);
        if (!s) return null;
        const widest = rows.reduce<ProductCardData | null>((a, p) => (!a || p.inStockStores > a.inStockStores ? p : a), null);
        return { type, ...s, top: rows.slice(0, 3), widest };
      }),
    ),
  ]);
  const wrap = wrapFor(market);
  const wrapCards = await cardsFor(market, [...wrap.lower, ...wrap.higher].slice(0, 6).map((m) => m.slug));
  return {
    region,
    regions: regions.map((x) => {
      const o = overviews[REGIONS[x.region].market] ?? { products: 0, inStock: 0, stores: 0 };
      return { region: x.region, products: o.products, open: o.inStock, stores: o.stores, cheapest: x.cheapest };
    }),
    ranges: ranges.filter((x): x is TypeRange => x != null),
    wrap,
    wrapCards,
  };
}

export const emptyHomeReport = (region: Region = X_DEFAULT_REGION): HomeReport => ({
  region,
  regions: [],
  ranges: [],
  wrap: { through: null, from: null, days: 0, lower: [], higher: [], compared: 0 },
  wrapCards: [],
});
