import { SITEMAP_IDS } from "@/lib/sitemap";
import { SITE_URL } from "@/lib/site";

// The sitemap index. Next 14's generateSitemaps writes /sitemap/<id>.xml for
// each id but no index for them (checked against 14.2.35: /sitemap.xml is a
// 404 without this), so robots.txt points here and this lists the files. Pure
// constants: no database, prerendered once per build.
export const dynamic = "force-static";

export function GET() {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAP_IDS.map(({ id }) => `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>\n`).join("") +
    `</sitemapindex>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=86400" } });
}
