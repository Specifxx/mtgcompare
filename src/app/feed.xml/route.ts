import { POSTS, postHref } from "@/lib/blog";
import { getDataRef } from "@/lib/data";
import { publicDataHeaders } from "@/lib/data/plane/headers";
import { postTitle } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// The blog's RSS feed. A post title may carry the month of the data ("... (October 2026)"), so the route reads the pointer of the published data
// for its date; it reads nothing else. force-dynamic under the CDN header of headers.json (contract 12.7), never prerendered at build.
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const pricesAt = (await getDataRef().catch(() => null))?.publishedAt;
  const items = POSTS.map((p) => {
    const url = `${SITE_URL}${postHref(p)}`;
    return `<item><title>${esc(postTitle(p, pricesAt))}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE_NAME)} blog</title><link>${SITE_URL}/blog</link><description>${esc(SITE_DESCRIPTION)}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: publicDataHeaders({ "content-type": "application/rss+xml; charset=utf-8" }) });
}
