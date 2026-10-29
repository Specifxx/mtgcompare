// The other card-game sites' own searches, `{q}` replaced by the query (each
// site's WebSite SearchAction target), for the "Searching another game?" line
// under a search here (components/FamilySearch.tsx, 2026-10-28). Plain links:
// nothing is fetched from them. The footer's SISTER_SITES (lib/site.ts) stays
// the list of homepages.
export const FAMILY_SEARCH = [
  { key: "rift", name: "RiftCompare", game: "Riftbound", search: "https://riftcompare.com/browse?q={q}" },
  { key: "op", name: "OP Compare", game: "One Piece", search: "https://opcompare.app/browse?q={q}" },
  { key: "dex", name: "DexCompare", game: "Pokémon sealed", search: "https://dexcompare.app/us/sealed?q={q}" },
  { key: "gundam", name: "Gundam Compare", game: "Gundam", search: "https://gundamcompare.com/cards?q={q}" },
  { key: "lorcana", name: "Lorcana Compare", game: "Lorcana", search: "https://lorcanacompare.com/cards?q={q}" },
  { key: "ygo", name: "YGO Compare", game: "Yu-Gi-Oh!", search: "https://ygocompare.com/cards?q={q}" },
] as const;

export function familySearchLinks(q: string): { key: string; name: string; game: string; href: string }[] {
  const term = q.trim().slice(0, 80);
  if (!term) return [];
  return FAMILY_SEARCH.map((s) => ({ key: s.key, name: s.name, game: s.game, href: s.search.replace("{q}", encodeURIComponent(term)) }));
}
