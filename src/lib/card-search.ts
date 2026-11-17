// The card search over data/cards/search.json (lib/cards.ts searchCards), for the /api/cards/search route and the search page.
// SERVER ONLY. The index is read once per server instance (~100,000 rows) and kept.
import { readSearch, readSets, searchCards, type SearchHit } from "./cards";

let sets: Map<string, { name: string; abbr: string | null }> | null = null;

export function cardSearch(q: string, limit = 12): { hits: (SearchHit & { setName: string })[]; total: number } {
  sets ??= new Map(readSets().sets.map((s) => [s.slug, { name: s.name, abbr: s.abbr }]));
  const { hits, total } = searchCards(readSearch(), sets, q, limit);
  return { hits: hits.map((h) => ({ ...h, setName: sets!.get(h.set)?.name ?? "" })), total };
}
