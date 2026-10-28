// The region section pages that can run thin (a few rows in a small market, or on a quiet week), and when. Each page sets noindex
// by its rule and the sitemap leaves the same page out (src/app/sitemap.ts thinSectionPaths), so the two never disagree: a sitemap that
// lists a noindex URL is a conflict in Search Console, and a near-empty list that is indexable is what it reports as a soft 404.
// The rules are pure (tests/index-tiers.test.ts); the counts come from the pages' own loaders.
import { dealsBySection, perPackLeaders } from "./deals";
import type { Market } from "./regions";
import { priceMovesData } from "./stock-data";

/** Deals: fewer than this many deals AND fewer per-pack leaders (the page then leads with the per-pack ranking). */
export const DEALS_THIN = 6;
/** Cheapest per pack: fewer leaders than this. */
export const PACKS_THIN = 3;
/** Price moves: fewer moves (up and down together) than this: one or two rows under a long explanation. */
export const MOVES_THIN = 3;

export const dealsThin = (deals: number, leaders: number): boolean => deals < DEALS_THIN && leaders < DEALS_THIN;
export const packsThin = (leaders: number): boolean => leaders < PACKS_THIN;
export const movesThin = (moves: number): boolean => moves < MOVES_THIN;

/** The region's section paths ("/deals", "/cheapest-packs", "/price-moves") that are thin today: noindex, and out of the sitemap. */
export async function thinSections(market: Market): Promise<string[]> {
  const [sections, leaders, moves] = await Promise.all([dealsBySection(market), perPackLeaders(market), priceMovesData(market)]);
  const out: string[] = [];
  if (dealsThin(sections.reduce((n, s) => n + s.deals.length, 0), leaders.top10.length)) out.push("/deals");
  if (packsThin(leaders.top10.length)) out.push("/cheapest-packs");
  if (movesThin(moves.up.length + moves.down.length)) out.push("/price-moves");
  return out;
}
