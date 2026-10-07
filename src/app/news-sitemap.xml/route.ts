import { POSTS } from "@/lib/blog";
import { getCatalog } from "@/lib/data";
import { newsSitemapXml, recentNewsPosts } from "@/lib/news-sitemap";

// Posts from the last two days, for Google News (listed in robots.txt).
export const revalidate = 3600;

export async function GET() {
  let cat: Awaited<ReturnType<typeof getCatalog>> | null = null;
  try {
    cat = await getCatalog();
  } catch {
    /* no database yet: titles fall back to the description */
  }
  const posts = recentNewsPosts(POSTS.map((p) => ({ slug: p.slug, category: p.category, date: p.date, title: cat ? p.title({ cat }) : p.description })));
  return new Response(newsSitemapXml(posts), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600" } });
}
