// Everything the homepage and the five region homes render, loaded once per request through the published-file loaders of src/lib/data
// (hm/home.json, meta/sets.json, mv/*.json): no catalogue scan, no session, no cookie. The pages are force-dynamic and the CDN header of
// headers.json holds their HTML for five minutes (contract 12.7), so one HTML serves every market and the client localises to the visitor's (CountryProvider).
import { CARD_FLAGS, RELEASE_SET_KINDS, type Rarity } from "@/lib/constants";
import { MARKETS, type Country } from "@/lib/country";
import { getHomeBoard, getHomeStats, getMovers, getRecentlyUpdated, getSets, type CardLite, type HomeBoard, type HomeCard, type SetLite } from "@/lib/data";
import type { HomeStats } from "@/lib/home";
import { usdCentsToCountry } from "@/lib/fx";
import type { HomeDeal, TopDeals } from "@/lib/top-deals";
import type { TileItem } from "./PopularCardsCarousel";
import type { TrendingCard } from "./TrendingChips";

export interface HomeData {
  board: HomeBoard;
  stats: HomeStats;
  renderedAt: string;
  /** The twelve most popular printings: Scryfall's EDHREC rank, then market value (never a Neon counter). */
  popular: TileItem[];
  /** The dearest printings in the catalogue, market price only. */
  chase: TileItem[];
  trending: TrendingCard[];
  biggestMovers: (TileItem & { pct: number })[];
  recentlyUpdated: (TileItem & { pct: number })[];
  dealsByCountry: Record<Country, TopDeals>;
  /** The newest and upcoming sets for "Explore the database", upcoming first, at most SET_TILES. */
  sets: SetLite[];
  nextSet: { name: string; code: string; slug: string; releasedOn: string | null } | null;
  newestSetCode?: string;
}

const NONE: Record<Country, null> = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null };
const ZERO: Record<Country, 0> = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 };
export const SET_TILES = 12;
const CHASE_TILES = 12;
/** CardImage draws the TCGplayer image of the product id; a tile knows only the flags. */
const hasTcgImage = (flags: number): boolean => (flags & CARD_FLAGS.TCGIMG) !== 0;

/** A tile's payload: only the fields CardTile reads, so the client props stay small. The home feed carries the TCGplayer market price and no store price, so the tile quotes the reference (≈) until the market's stores are asked on the card page. */
export function tileOfHome(c: HomeCard): TileItem {
  return {
    card: {
      id: c.id, slug: c.slug, name: c.name, number: c.number, rarity: c.rarity as Rarity, variant: c.variant, printing: c.printing,
      hasImage: hasTcgImage(c.flags), marketUsd: c.marketUsd, low: { ...NONE }, stores: { ...ZERO },
    },
    setCode: c.setCode,
  };
}
/** A tile of a full card (the movers feeds hydrate real prices). */
export function tileOfLite(c: CardLite): TileItem {
  return { card: { id: c.id, slug: c.slug, name: c.name, number: c.number, rarity: c.rarity, variant: c.variant, printing: c.printing, hasImage: c.hasImage, marketUsd: c.marketUsd, low: c.low, stores: c.stores }, setCode: c.setCode };
}

const subtitleOf = (c: Pick<HomeCard, "setCode" | "number">): string => [c.setCode, c.number].filter(Boolean).join(" · ");
/** A row of Today's Top Deals from a tile: the price is TCGplayer's market, converted for the market (≈ outside the US). */
function dealOf(c: HomeCard, country: Country, badge: string): HomeDeal | null {
  if (c.marketUsd == null) return null;
  return {
    id: c.id, slug: c.slug, title: c.name, variant: c.variant, subtitle: subtitleOf(c), hasImage: hasTcgImage(c.flags),
    priceCents: country === "US" ? c.marketUsd : usdCentsToCountry(c.marketUsd, country), approx: country !== "US", badge,
  };
}
const pctBadge = (n: number): string => `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const moverRows = (tiles: HomeCard[], country: Country): HomeDeal[] => tiles.flatMap((c) => (c.change7d == null ? [] : [dealOf(c, country, pctBadge(c.change7d))].filter((d): d is HomeDeal => d != null)));

/** The home page's public payload for each market: the ONE free savings row and the real count (the rest is /api/top-deals/savings after a tier check on the server), four drops and four climbs. */
export function topDealsOf(board: HomeBoard): Record<Country, TopDeals> {
  return Object.fromEntries(
    MARKETS.map((m) => {
      const free = board.dealsFree[m];
      const savings = free ? [{ id: free.id, slug: free.slug, title: free.name, variant: free.variant, subtitle: subtitleOf(free), hasImage: hasTcgImage(free.flags), priceCents: free.buyCents, approx: false, badge: `Save ${free.belowPct}%` } satisfies HomeDeal] : [];
      return [m, { country: m, savings, savingsTotal: board.dealCounts[m] ?? 0, drops: moverRows(board.down, m), rising: moverRows(board.up, m) } satisfies TopDeals];
    }),
  ) as Record<Country, TopDeals>;
}

/** The sets for "Explore the database": what is released or coming from the release kinds, upcoming first then newest, SET_TILES in all. */
export function homeSets(sets: readonly SetLite[], today: string): SetLite[] {
  const dated = sets.filter((s) => s.releasedOn && (RELEASE_SET_KINDS as readonly string[]).includes(s.kind));
  const upcoming = dated.filter((s) => s.releasedOn! > today).sort((a, b) => a.releasedOn!.localeCompare(b.releasedOn!) || a.id - b.id);
  const released = dated.filter((s) => s.releasedOn! <= today).sort((a, b) => b.releasedOn!.localeCompare(a.releasedOn!) || b.id - a.id);
  return [...upcoming, ...released].slice(0, SET_TILES);
}

/** An optional read: whatever goes wrong inside it, even a throw before it returns a promise, is the fallback and never the page. */
const soft = <T,>(read: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(read).catch(() => fallback);

export async function loadHomeData(): Promise<HomeData> {
  const [board, stats, sets, risers, fallers, recent] = await Promise.all([
    getHomeBoard(),
    getHomeStats(),
    getSets(),
    soft(() => getMovers({ dir: "up", window: 7, minCents: 100, n: 6 }), []),      // P mv files; a failure drops the tab, never the page
    soft(() => getMovers({ dir: "down", window: 7, minCents: 100, n: 6 }), []),
    soft(() => getRecentlyUpdated(24), []),
  ]);
  const renderedAt = new Date().toISOString(), today = renderedAt.slice(0, 10);
  // Biggest movers: TCGplayer's 7-day market change is one worldwide figure, so the list is the same for every market (prices still localise).
  const moved = [...risers, ...fallers].filter((c) => c.change7d != null).sort((a, b) => Math.abs(b.change7d ?? 0) - Math.abs(a.change7d ?? 0)).slice(0, 12);
  const next = board.upcoming[0] ?? null;
  return {
    board,
    stats,
    renderedAt,
    popular: board.popular.map(tileOfHome),
    chase: board.chase.slice(0, CHASE_TILES).map(tileOfHome),
    trending: board.popular.slice(0, 6).map((c) => ({ id: c.id, slug: c.slug, name: c.name, number: c.number, variant: c.variant })),
    biggestMovers: moved.map((c) => ({ ...tileOfLite(c), pct: Math.round((c.change7d ?? 0) * 10) / 10 })),
    recentlyUpdated: recent.map((r) => ({ ...tileOfLite(r.card), pct: r.pct })),
    dealsByCountry: topDealsOf(board),
    sets: homeSets(sets, today),
    nextSet: next ? { name: next.name, code: next.code, slug: next.slug, releasedOn: next.releasedOn } : null,
    newestSetCode: board.newest[0]?.code,
  };
}
