import { POSTS, postHref } from "@/lib/blog";
import { getCatalog } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 21600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  let titles = new Map<string, string>();
  try {
    const cat = await getCatalog();
    titles = new Map(POSTS.map((p) => [p.slug, p.title({ cat })]));
  } catch {
    /* no database yet: fall back to slugs */
  }
  const items = POSTS.map((p) => {
    const url = `${SITE_URL}${postHref(p)}`;
    return `<item><title>${esc(titles.get(p.slug) ?? p.slug)}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE_NAME)} blog</title><link>${SITE_URL}/blog</link><description>${esc(SITE_DESCRIPTION)}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
