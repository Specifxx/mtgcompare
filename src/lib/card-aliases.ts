// Community nicknames for ONE exact printing (RiftCompare's card-aliases.ts): the
// phrase a collector types ("gold roger luffy") that appears nowhere in a
// product's TCGplayer name. Keyed by Card.slug, never by name (a nickname names a
// printing, not a character), and SEEDED EMPTY: an alias is added only when an
// owner or a source confirms it, never guessed. The search box answers an alias
// with its card and the card page says "Also known as …" (and puts it in the meta
// description). tests/card-aliases.test.ts pins the shape and that every alias
// resolves back to its card.
export const CARD_ALIASES: Record<string, readonly string[]> = {};

const norm = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** A printing's nicknames, as displayed. */
export function aliasesFor(slug: string, table: Record<string, readonly string[]> = CARD_ALIASES): string[] {
  return [...(table[slug] ?? [])];
}

/** The card slugs a typed query names exactly (case, punctuation and accents ignored). */
export function slugsForAlias(query: string, table: Record<string, readonly string[]> = CARD_ALIASES): string[] {
  const q = norm(query);
  if (!q) return [];
  return Object.entries(table)
    .filter(([, list]) => list.some((a) => norm(a) === q))
    .map(([slug]) => slug);
}
