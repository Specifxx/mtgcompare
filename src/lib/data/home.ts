// owner: WP15
// src/lib/data/home.ts: C0 STUB (contract 9.3 step 2), the section "home.ts" of api.ts. Every function below throws until WP15 implements it;
// the names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): change the BODY only, add exports, never rename (requests/ protocol, 9.4).
import type { Country } from "../country";
import type { Finish } from "../constants";
import type { CardLite, SetLite } from "./types";

export interface HomeTile { id: number; slug: string; name: string; setCode: string; number: string | null; rarity: string; flags: number; headFinish: Finish; marketUsd: number | null }
export interface HomeFeed { at: string; stats: { cards: number; tracked: number; sets: number; sealed: number; oracles: number }; newest: SetLite[]; upcoming: SetLite[]; chase: HomeTile[]; popular: HomeTile[]; up: HomeTile[]; down: HomeTile[]; dealCounts: Record<Country, number>; dealsFree: Record<Country, (HomeTile & { buyCents: number; belowPct: number }) | null> }
export function getHomeFeed(): Promise<HomeFeed> { throw new Error("not implemented: WP15"); }                                            // P hm/home.json (8 KB) + meta/sets.json; free-safe by construction (one deal per market, counts)
export function getPopular(n?: number): Promise<HomeTile[]> { throw new Error("not implemented: WP15"); }                                // P hm/home.json popular tiles (EDHREC rank, then market); never reordered by a Neon counter
export interface MarketOverview { at: string; basket: { n: number; totalUsd: number; avg: number; median: number }; advancing: number; declining: number; constituents: { id: number; slug: string; name: string; cents: number }[]; sets: { setId: number; n: number; totalCents: number }[] }
export interface MarketRecords { gaps: { card: CardLite; finish: Finish; home: number; away: Country; awayCents: number; awayConverted: number; saving: number; pct: number }[]; highs: { card: CardLite; finish: Finish; cents: number; high90: number }[]; lows: { card: CardLite; finish: Finish; cents: number; high90: number; pctBelow: number }[] }
export function getMarketOverview(): Promise<MarketOverview> { throw new Error("not implemented: WP15"); }                                 // P mk/overview.json: replaces the whole-catalogue scan of /market
export function getMarketRecords(home: Country): Promise<MarketRecords> { throw new Error("not implemented: WP15"); }                      // P mk/records.json (stores only, free) + getCardsByIds for the 40 cards
