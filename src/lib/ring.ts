// Which few siblings a page links, when it has many (2026-11-14). Pure, no imports: the product page's "More from <set>" and "More
// <type>" blocks (lib/product-data.ts) and the blog's "More from the blog" all use it.

/**
 * The `take` items that follow `self` in a sorted list that contains it, wrapping at the end; `self` never among them. Pure. In a
 * list of more than `take` others, every item is picked by exactly `take` of them: the links spread evenly, where "the first few of
 * the list" gave every page the same links and the rest of the list none.
 */
export function ringAfter<T extends { slug: string }>(sorted: readonly T[], selfSlug: string, take: number): T[] {
  const at = sorted.findIndex((r) => r.slug === selfSlug);
  const others = sorted.filter((r) => r.slug !== selfSlug);
  if (at < 0 || others.length <= take) return others.slice(0, take);
  return Array.from({ length: take }, (_, i) => others[(at + i) % others.length]);
}
