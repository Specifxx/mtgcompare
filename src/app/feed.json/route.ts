import { AUTHOR, POSTS, postHref } from "@/lib/blog";
import { getCatalog } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// JSON Feed 1.1 of the blog (https://jsonfeed.org/version/1.1), beside the RSS
// feed.xml: the same posts, titles from the same cached catalogue.
export const revalidate = 21600;

export async function GET() {
  let titles = new Map<string, string>();
  try {
    const cat = await getCatalog();
    titles = new Map(POSTS.map((p) => [p.slug, p.title({ cat })]));
  } catch {
    /* no database yet: fall back to slugs */
  }
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${SITE_NAME} blog`,
    home_page_url: `${SITE_URL}/blog`,
    feed_url: `${SITE_URL}/feed.json`,
    description: SITE_DESCRIPTION,
    language: "en",
    authors: [{ name: AUTHOR.name, url: `${SITE_URL}${AUTHOR.url}` }],
    items: POSTS.map((p) => {
      const url = `${SITE_URL}${postHref(p)}`;
      return {
        id: url,
        url,
        title: titles.get(p.slug) ?? p.slug,
        summary: p.description,
        content_text: p.description,
        image: `${url}/opengraph-image`,
        date_published: new Date(`${p.date}T00:00:00Z`).toISOString(),
        tags: p.tags,
      };
    }),
  };
  return new Response(JSON.stringify(feed), { headers: { "Content-Type": "application/feed+json; charset=utf-8" } });
}
