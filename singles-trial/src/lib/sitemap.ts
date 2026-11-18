// The sitemap, as pure functions. /sitemap.xml is the index; /sitemaps/pages.xml the home and game hubs; /sitemaps/<game>-sets.xml
// every set with a released card; /sitemaps/<game>-cards-<n>.xml the RELEASED cards (lib/cards.ts), CARDS_PER_FILE a file, in set
// order. A card the import has not released to Google is never listed.
import { cardIndexable, type CardRow, type CardSet } from "./cards";

export const CARDS_PER_FILE = 10_000;
export interface Entry {
  path: string;
  lastmod?: string;
}

export function cardFiles(indexed: number): number {
  return Math.ceil(indexed / CARDS_PER_FILE);
}
export function indexFiles(games: { slug: string; indexed: number }[]): string[] {
  return ["pages", ...games.flatMap((g) => (g.indexed > 0 ? [`${g.slug}-sets`, ...Array.from({ length: cardFiles(g.indexed) }, (_, i) => `${g.slug}-cards-${i + 1}`)] : []))];
}
export function setEntries(game: string, sets: readonly CardSet[], day?: string): Entry[] {
  return sets.filter((s) => s.indexed > 0).map((s) => ({ path: `/${game}/${s.slug}`, lastmod: day }));
}
export function cardEntries(game: string, sets: readonly CardSet[], cardsOf: (set: string) => readonly CardRow[], n: number): Entry[] {
  const from = (n - 1) * CARDS_PER_FILE;
  const to = from + CARDS_PER_FILE;
  const out: Entry[] = [];
  let i = 0;
  for (const s of sets) {
    if (!s.indexed) continue;
    if (i + s.indexed <= from) {
      i += s.indexed;
      continue;
    }
    for (const c of cardsOf(s.slug)) {
      if (!cardIndexable(c)) continue;
      if (i >= from && i < to) out.push({ path: `/${game}/${s.slug}/${c.s}` });
      i++;
    }
    if (i >= to) break;
  }
  return out;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export function urlsetXml(base: string, entries: readonly Entry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((e) => `<url><loc>${esc(base + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
}
export function indexXml(base: string, files: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `<sitemap><loc>${esc(`${base}/sitemaps/${f}.xml`)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
