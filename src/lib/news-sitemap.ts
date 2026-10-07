// The Google News sitemap (news-sitemap.xml): posts published in the last two
// days, which is all Google News reads. Pure, so the window and the XML are
// tested. Guides are evergreen, not news, so only the dated blog posts qualify.
import { SITE_NAME, SITE_URL } from "./site";

export interface NewsPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  category?: "blog" | "guide";
}

const DAY = 86_400_000;

/** Blog posts dated within the last `days` days (inclusive of today), newest first. */
export function recentNewsPosts<T extends NewsPost>(posts: readonly T[], now: Date = new Date(), days = 2): T[] {
  const cutoff = Date.parse(now.toISOString().slice(0, 10)) - days * DAY;
  return posts
    .filter((p) => (p.category ?? "blog") === "blog" && Date.parse(p.date) >= cutoff && Date.parse(p.date) <= now.getTime())
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const xmlEscape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function newsSitemapXml(posts: readonly NewsPost[]): string {
  const items = posts
    .map(
      (p) =>
        `<url><loc>${xmlEscape(`${SITE_URL}/blog/${p.slug}`)}</loc><news:news><news:publication><news:name>${xmlEscape(SITE_NAME)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${p.date}</news:publication_date><news:title>${xmlEscape(p.title)}</news:title></news:news></url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${items}</urlset>`;
}
