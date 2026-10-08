import { AUTHORS, POSTS, postHref } from "@/lib/blog";
import { getDataRef, getKeywordIndex, getLibraryDecks, getSitemapPlan, getSitemapSection, getStoreStats } from "@/lib/data";
import { publicDataHeaders } from "@/lib/data/plane/headers";
import { STORES } from "@/lib/stores";
import { KEYWORD_SITEMAP_MIN, deckPaths, inPlan, parseSectionParam, sectionEntries, staticEntries, urlsetXml, type StaticExtras } from "@/lib/sitemap-sections";

// /sitemaps/<kind>-<n>.xml: one child sitemap (contract 4.5), at most 10,000 URLs. The ".xml" lives in the dynamic param (a bracketed
// segment cannot carry a literal extension), so the param arrives as "cards-3.xml". An unknown kind or an index past the plan is a 404
// and never an empty <urlset>, so a mistyped Search Console submission fails loudly. The slugs are the published sm/<kind>-<n>.json files
// (only rows track.ts isIndexable admits: never THIN, never ?finish); `static` is composed here from code and a few bounded reads, each
// of which contributes nothing when it fails. Rendered per request under the CDN header of headers.json, never at build (rule 5).
export const dynamic = "force-dynamic";

const KEEP_STORE_MIN_STOCK = 10;   // a store page is indexed once the store has this many in-stock listings (thin store pages are noindex)

async function extras(): Promise<StaticExtras> {
  const [keywords, decks, stats] = await Promise.all([
    getKeywordIndex().catch(() => []),
    getLibraryDecks().catch(() => []),                    // N: the one public Neon read the sitemap may make; [] when Neon is down
    getStoreStats().catch(() => []),
  ]);
  const stocked = new Set(stats.filter((s) => s.inStock >= KEEP_STORE_MIN_STOCK).map((s) => s.source));
  let storeKeys: string[] = [];
  try { storeKeys = STORES.filter((s) => stocked.has(`store:${s.key}`)).map((s) => s.key); } catch { /* the registry is not loaded: no store pages */ }
  return {
    postHrefs: POSTS.map((p) => postHref(p)),
    authorSlugs: AUTHORS.map((a) => a.slug),
    keywordSlugs: keywords.filter((k) => k.count >= KEYWORD_SITEMAP_MIN).map((k) => k.slug),
    deckPaths: deckPaths(decks),
    storeKeys,
  };
}

export async function GET(_req: Request, { params }: { params: { section: string } }) {
  const ref = parseSectionParam(params.section);
  if (!ref) return new Response("Not found", { status: 404 });
  try {
    const plan = await getSitemapPlan();
    if (!inPlan(plan, ref.kind, ref.index)) return new Response("Not found", { status: 404 });
    const ptr = await getDataRef(), lastmod = ptr?.priceDay;
    const entries = ref.kind === "static" ? staticEntries(lastmod, await extras()) : sectionEntries(ref.kind, await getSitemapSection(ref.kind, ref.index), lastmod);
    return new Response(urlsetXml(entries), { headers: publicDataHeaders({ "content-type": "application/xml; charset=utf-8" }) });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "120", "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }
}
