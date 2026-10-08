import { AUTHOR, POSTS, postHref } from "@/lib/blog";
import { getDataRef } from "@/lib/data";
import { publicDataHeaders } from "@/lib/data/plane/headers";
import { postTitle } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// JSON Feed 1.1 of the blog (https://jsonfeed.org/version/1.1), beside the RSS
// feed.xml: the same posts, titles dated by the published data's pointer.
// force-dynamic under the CDN header of headers.json (contract 12.7).
export const dynamic = "force-dynamic";

export async function GET() {
  const pricesAt = (await getDataRef().catch(() => null))?.publishedAt;
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
        title: postTitle(p, pricesAt),
        summary: p.description,
        content_text: p.description,
        image: `${url}/opengraph-image`,
        date_published: new Date(`${p.date}T00:00:00Z`).toISOString(),
        tags: p.tags,
      };
    }),
  };
  return new Response(JSON.stringify(feed), { headers: publicDataHeaders({ "content-type": "application/feed+json; charset=utf-8" }) });
}
