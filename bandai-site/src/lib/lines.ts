// Multi-game sites (SITE.lines): one catalogue holding several TCGplayer
// categories, each set tagged with its game. Every helper here falls back to
// the site's single game, so single-game sites behave exactly as before.
import { SITE } from "@/site.config";
import type { GameLine, SetInfo } from "@/lib/site-types";

export const LINES: GameLine[] = SITE.lines ?? [];
export const isMultiGame = LINES.length > 0;

export const lineById = (id: string | null | undefined): GameLine | null => (id ? LINES.find((l) => l.id === id) ?? null : null);
export const lineBySlug = (slug: string): GameLine | null => LINES.find((l) => l.slug === slug) ?? null;
export const lineOfSet = (s: Pick<SetInfo, "line"> | null | undefined): GameLine | null => lineById(s?.line);

/** The words an eBay search for this set's products starts with. */
export const ebayQueryOf = (s: Pick<SetInfo, "line"> | null | undefined): string => lineOfSet(s)?.ebayQuery ?? SITE.ebay.query;
/** TCGplayer's product-line slug for this set's game. */
export const tcgplayerSlugOf = (s: Pick<SetInfo, "line"> | null | undefined): string => lineOfSet(s)?.tcgplayerSlug ?? SITE.tcgplayerSlug;
/** "Dual Revolution (Digimon Card Game)": a set name that says its game, on multi-game sites. */
export const setLabel = (s: Pick<SetInfo, "line" | "name">): string => {
  const l = lineOfSet(s);
  return l && !s.name.toLowerCase().includes(l.name.toLowerCase().split(" ")[0]) ? `${s.name} (${l.name})` : s.name;
};
