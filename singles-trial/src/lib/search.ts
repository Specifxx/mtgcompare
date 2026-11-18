// Search across the live games (server only). Hits carry their game; ties between games go to the more valuable card.
import { searchCards, type SearchHit } from "./cards";
import { readSearch, readSets } from "./store";
import { LIVE_GAMES } from "../site.config";

export interface GameHit extends SearchHit {
  game: string;
}
export function searchAll(query: string, game: string | null, limit: number): { hits: GameHit[]; total: number } {
  const games = LIVE_GAMES.filter((g) => !game || g.slug === game);
  let total = 0;
  const hits: GameHit[] = [];
  for (const g of games) {
    const sets = new Map(readSets(g.slug).sets.map((s) => [s.slug, { name: s.name, abbr: s.abbr }]));
    const r = searchCards(readSearch(g.slug), sets, query, limit);
    total += r.total;
    hits.push(...r.hits.map((h) => ({ ...h, game: g.slug })));
  }
  // Each game's list is already best-first; interleave by rank, then value.
  const ranked = hits.map((h, i) => ({ h, rank: i % limit })).sort((a, b) => a.rank - b.rank || b.h.v - a.h.v).map((x) => x.h);
  return { hits: games.length > 1 ? ranked.slice(0, limit) : hits, total };
}
