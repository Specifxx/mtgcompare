import { readSets } from "@/lib/cards";
import { CARDS_PER_SITEMAP, CARDS_SITEMAP_ID, SITEMAP_IDS } from "@/lib/sitemap";
import { SITE_URL } from "@/lib/site";

// The sitemap index. Next 14's generateSitemaps writes /sitemap/<id>.xml for
// each id but no index for them (checked against 14.2.35: /sitemap.xml is a
// 404 without this), so robots.txt points here and this lists the files. Pure
// constants: no database, prerendered once per build.
export const dynamic = "force-static";

/** How many card sitemap files have URLs today (lib/sitemap.ts cardsSitemap): the rest are declared but not listed. */
function cardFiles(): number {
  const released = readSets().sets.reduce((n, s) => n + s.indexed, 0);
  return Math.ceil(released / CARDS_PER_SITEMAP);
}

export function GET() {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAP_IDS.filter(({ id }) => id <= CARDS_SITEMAP_ID || id - CARDS_SITEMAP_ID <= cardFiles()).map(({ id }) => `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>\n`).join("") +
    `</sitemapindex>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=86400" } });
}
