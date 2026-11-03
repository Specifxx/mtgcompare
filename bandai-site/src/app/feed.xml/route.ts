import { SITE } from "@/site.config";
import { posts } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/html";

export const revalidate = 86400;

export function GET() {
  const items = posts()
    .map((p) => `<item><title>${escapeHtml(p.title)}</title><link>${SITE_URL}/blog/${p.slug}</link><guid>${SITE_URL}/blog/${p.slug}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${escapeHtml(p.description)}</description></item>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(SITE.name)}</title><link>${SITE_URL}</link><description>${escapeHtml(SITE.description)}</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}
