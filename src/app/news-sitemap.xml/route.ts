import { POSTS } from "@/lib/blog";
import { getDataRef } from "@/lib/data";
import { publicDataHeaders } from "@/lib/data/plane/headers";
import { newsSitemapXml, recentNewsPosts } from "@/lib/news-sitemap";
import { postTitle } from "@/lib/seo";

// Posts from the last two days, for Google News (listed in robots.txt). Titles are dated by the published data's pointer; force-dynamic under the
// CDN header of headers.json (contract 12.7), never prerendered at build.
export const dynamic = "force-dynamic";

export async function GET() {
  const pricesAt = (await getDataRef().catch(() => null))?.publishedAt;
  const posts = recentNewsPosts(POSTS.map((p) => ({ slug: p.slug, category: p.category, date: p.date, title: postTitle(p, pricesAt) })));
  return new Response(newsSitemapXml(posts), { headers: publicDataHeaders({ "content-type": "application/xml; charset=utf-8" }) });
}
