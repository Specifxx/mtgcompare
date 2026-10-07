import { POSTS, postHref } from "@/lib/blog";
import { getCatalog, getIndexSeries } from "@/lib/data";
import { llmsFull } from "@/lib/llms-full";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES } from "@/lib/stores";

// /llms-full.txt: the longer snapshot (linked from /llms.txt), from the cached
// loaders only. Without a database it still answers with the static parts.
export const revalidate = 86400;

export async function GET() {
  const storesByMarket: Record<string, number> = {};
  for (const s of STORES) storesByMarket[s.country] = (storesByMarket[s.country] ?? 0) + 1;
  try {
    const [cat, series] = await Promise.all([getCatalog(), getIndexSeries().catch(() => [])]);
    const last = series[series.length - 1];
    const body = llmsFull({
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      description: SITE_DESCRIPTION,
      cards: cat.cards,
      sets: cat.sets,
      storesByMarket,
      guides: POSTS.map((p) => ({ title: p.title({ cat }), href: postHref(p), description: p.description })),
      index: last ? { day: last.day, value: last.value } : null,
      pricesAt: cat.pricesAt,
    });
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response(`# ${SITE_NAME}\n\n> ${SITE_DESCRIPTION}\n\nThe catalogue is not available right now. See ${SITE_URL}/llms.txt.\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
