// "Searching another game?": the same query on each card-game sister site
// that names its search in site.config.ts (SisterSite.search, 2026-10-28).
// Plain links: nothing is fetched from them.
import type { SisterSite } from "./site-types";

export function familySearchLinks(sites: readonly SisterSite[], q: string): { name: string; game: string; href: string }[] {
  const term = q.trim().slice(0, 80);
  if (!term) return [];
  return sites.filter((s) => s.search).map((s) => ({ name: s.name, game: s.game, href: s.search!.replace("{q}", encodeURIComponent(term)) }));
}
