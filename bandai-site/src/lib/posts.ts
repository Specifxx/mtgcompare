import { POSTS } from "@/content/blog";
export const posts = () => POSTS.slice().sort((a, b) => b.date.localeCompare(a.date));
export const postBySlug = (s: string) => POSTS.find((p) => p.slug === s) ?? null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Posts whose title or keywords name one of `terms` as a whole word (a set's name or code), newest first.
 *  Terms under three characters are ignored: a bare "1" or "OP" would match everything. */
export function postsAbout(terms: string[]) {
  const res = terms.filter((t) => t && t.length >= 3).map((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(t)}($|[^\\p{L}\\p{N}])`, "iu"));
  if (!res.length) return [];
  return posts().filter((p) => res.some((re) => re.test(p.title) || p.keywords.some((k) => re.test(k))));
}

/** Up to `n` other posts to read next: newest first, the current one left out. */
export const morePosts = (slug: string, n = 3) => posts().filter((p) => p.slug !== slug).slice(0, n);
