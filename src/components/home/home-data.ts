// Everything the homepage and the five region homes render, loaded once per
// ISR render through the cached loaders in lib/data.ts (no cookie, no session:
// the page is one HTML for every market and localises on the client).
import { MARKETS, type Country } from "@/lib/country";
import { getCatalog, getHomeStats, getPopular, getRecentlyUpdated, type CardLite, type Catalog } from "@/lib/data";
import type { HomeStats, PopularKind } from "@/lib/home";
import { movers, newestBoosterSet, upcomingSets } from "@/lib/selectors";
import { getTopDeals, type TopDeals } from "@/lib/top-deals";
import type { TileItem } from "./PopularCardsCarousel";
import type { TrendingCard } from "./TrendingChips";

export interface HomeData {
  cat: Catalog;
  stats: HomeStats;
  renderedAt: string;
  popular: TileItem[];
  popularKind: PopularKind;
  chaseSetName?: string;
  trending: TrendingCard[];
  biggestMovers: (TileItem & { pct: number })[];
  recentlyUpdated: (TileItem & { pct: number })[];
  dealsByCountry: Record<Country, TopDeals>;
  nextSet: { name: string; code: string; slug: string; releasedOn: string | null } | null;
  newestSetName?: string;
  newestSetCode?: string;
}

/** A tile's payload: only the fields CardTile reads, so the client props stay small. */
export function tileOf(cat: Catalog, c: CardLite): TileItem {
  return {
    card: {
      id: c.id, slug: c.slug, name: c.name, number: c.number, rarity: c.rarity, variant: c.variant, printing: c.printing,
      hasImage: c.hasImage, marketUsd: c.marketUsd, low: c.low, stores: c.stores,
    },
    setCode: cat.setById.get(c.setId)?.code ?? "",
  };
}

export async function loadHomeData(): Promise<HomeData> {
  const [cat, stats, popular, recent, deals] = await Promise.all([
    getCatalog(),
    getHomeStats(),
    getPopular(12),
    getRecentlyUpdated(24),
    Promise.all(MARKETS.map((m) => getTopDeals(m))),
  ]);
  const newest = newestBoosterSet(cat.sets);
  // Biggest movers: TCGplayer's 7-day market change is one worldwide figure,
  // so the list is the same for every market (prices still localise).
  const moved = [...movers(cat.cards, "up", 12), ...movers(cat.cards, "down", 12)]
    .sort((a, b) => Math.abs(b.change7d ?? 0) - Math.abs(a.change7d ?? 0))
    .slice(0, 12);
  const next = upcomingSets(cat.sets).find((s) => s.kind === "booster" || s.kind === "extra") ?? null;
  return {
    cat,
    stats,
    renderedAt: new Date().toISOString(),
    popular: popular.cards.map((c) => tileOf(cat, c)),
    popularKind: popular.kind,
    chaseSetName: popular.kind === "chase" ? newest?.name : undefined,
    trending: popular.cards.slice(0, 6).map((c) => ({ id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant })),
    biggestMovers: moved.map((c) => ({ ...tileOf(cat, c), pct: Math.round((c.change7d ?? 0) * 10) / 10 })),
    recentlyUpdated: recent.map((r) => ({ ...tileOf(cat, r.card), pct: r.pct })),
    dealsByCountry: Object.fromEntries(MARKETS.map((m, i) => [m, deals[i]])) as Record<Country, TopDeals>,
    nextSet: next ? { name: next.name, code: next.code, slug: next.slug, releasedOn: next.releasedOn } : null,
    newestSetName: newest?.name,
    newestSetCode: newest?.code,
  };
}
