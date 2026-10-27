import { GUIDES, guideRegions } from "@/content/guides";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { X_DEFAULT_REGION } from "@/lib/regions";

// The guides as RSS 2.0, newest update first, as RiftCompare's /feed.xml: feed readers,
// Feedly and some search crawlers find new articles here. Each item links the guide's
// default-region page (or its only region). Constants only: built once per deploy.
export const dynamic = "force-static";

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const items = [...GUIDES]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .map((g) => {
      const r = guideRegions(g).includes(X_DEFAULT_REGION) ? X_DEFAULT_REGION : guideRegions(g)[0];
      const url = `${SITE_URL}/${r}/guides/${g.slug}`;
      return `<item><title>${x(g.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(`${g.updated}T00:00:00Z`).toUTCString()}</pubDate><description>${x(g.description)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(SITE_NAME)} guides</title><link>${SITE_URL}</link><description>${x(SITE_TAGLINE)}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
