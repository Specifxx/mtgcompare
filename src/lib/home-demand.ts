// The home pages' ranking input and how a product card reads into it (lib/home-rank.ts; DECISIONS.md "Home pages rank items by
// demand", 2026-11-18). data/demand.json is refreshed once a day by the daily import (scripts/pull-demand.sh, from RiftCompare's
// /api/demand/mtg: product page views and buy_product clicks, last 28 and 7 days) and bundled with the release: imported, so a
// page reads no file and no database for it.
import raw from "../../data/demand.json";
import type { ProductCardData } from "./data";
import { rankItems, type DemandFile, type RankFacts } from "./home-rank";

// Through unknown: JSON imports type each pair as number[], not [number, number], so the first non-empty file (2026-11-18)
// failed the typecheck, and with it the next release's build.
export const HOME_DEMAND = raw as unknown as DemandFile;

/** What the ranking reads of a product card: any region's page of it, its buy clicks, stock, price, TCGplayer, release. */
export function cardFacts(p: ProductCardData, o: { preorder?: boolean } = {}): RankFacts {
  return {
    pathSuffix: `/p/${p.slug}`,
    clickKey: p.slug,
    priceCents: p.lowestPriceCents,
    inStock: p.inStockStores,
    marketplace: p.marketplaceOpen,
    paidRows: p.marketplaceOpen ? 1 : 0,
    releaseDate: p.releaseDate,
    preorder: o.preorder,
    dropPct: p.medianOpenCents && p.lowestPriceCents && p.medianOpenCents > p.lowestPriceCents ? (p.medianOpenCents - p.lowestPriceCents) / p.medianOpenCents : null,
  };
}

/** Product cards, most likely to earn first (lib/home-rank.ts). */
export const rankCards = (cards: readonly ProductCardData[], o: { preorder?: boolean; today?: string } = {}) =>
  rankItems(cards, (p) => cardFacts(p, o), HOME_DEMAND, { today: o.today });
