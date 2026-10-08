import { POSTS, postHref } from "@/lib/blog";
import { getCatalogStats, getIndexSeries, getMarketOverview, getSets } from "@/lib/data";
import { llmsFull } from "@/lib/llms-full";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES } from "@/lib/stores";

// /llms-full.txt: the longer snapshot (linked from /llms.txt), from the plane
// loaders only (never the catalogue shim). Without data it still answers with
// the static parts.
export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET() {
  const storesByMarket: Record<string, number> = {};
  for (const s of STORES) storesByMarket[s.country] = (storesByMarket[s.country] ?? 0) + 1;
  try {
    const [stats, sets, market, series] = await Promise.all([getCatalogStats(), getSets(), getMarketOverview().catch(() => null), getIndexSeries().catch(() => [])]);
    const last = series[series.length - 1];
    const body = llmsFull({
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      description: SITE_DESCRIPTION,
      cards: (market?.constituents ?? []).map((c) => ({ slug: c.slug, name: c.name, number: null, label: null, marketUsd: c.cents })),
      sets,
      totals: { cards: stats.cards, sets: stats.sets },
      storesByMarket,
      guides: POSTS.map((p) => ({ title: p.title({ cat: { pricesAt: stats.pricesAt } }), href: postHref(p), description: p.description })),
      index: last ? { day: last.day, value: last.value } : null,
      pricesAt: stats.pricesAt,
    });
    return new Response(body, { headers: HEADERS });
  } catch {
    return new Response(`# ${SITE_NAME}\n\n> ${SITE_DESCRIPTION}\n\nThe catalogue is not available right now. See ${SITE_URL}/llms.txt.\n`, { headers: HEADERS });
  }
}
