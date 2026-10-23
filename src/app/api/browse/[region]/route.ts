import { marketIndexCards } from "@/lib/browse-data";
import { lastCheckedAt } from "@/lib/data";
import { REGIONS } from "@/lib/regions";
import { publicDataStatus } from "@/lib/public-data/store";
import { browseIndexResponse, buildIndex } from "@/lib/search-index";

// GET /api/browse/<region>: the region's browse index (lib/search-index.ts), every product /<region>/sealed lists, as compact
// tuples. The header typeahead, the browse grid's filters and the recently-viewed rail load it once per page session
// (lib/index-client.ts) and do all their searching and sorting in the browser.
//
// Force-dynamic and kept a day by Vercel's CDN through its own Cache-Control (lib/search-index.ts INDEX_CACHE_CONTROL), like the
// pages (2026-10-23, cost): it was an ISR route, so every release wrote each region's whole index (tens of KB, billed per 8 KB) to
// the ISR cache on top of the CDN copy. A release empties the CDN; the next request renders it once per edge.
//
// RiftCompare's Pokémon section reads this index too, server-side and cached six hours (its src/lib/pokemon/dexcompare.ts), for
// each product's cheapest store and store counts, joined by the TCGplayer id in the image URL. It accepts INDEX_VERSION 1 only: a
// change to the tuple or a new version hides its store lines until it is updated (its ops monitor flags that), so say so there. Nothing is built at deploy time (no
// static params), so a build never needs the database. /api/ is disallowed in robots.txt.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { region: string } }) {
  const res = await browseIndexResponse(params.region, async (region) => {
    const { market } = REGIONS[region];
    const [cards, checked] = await Promise.all([marketIndexCards(market), lastCheckedAt(market)]);
    return buildIndex(region, cards, checked);
  });
  // Which source answered (src/lib/public-data/): "files <snapshot time> <database>" or "db". The check that a release reads the
  // bundled files and not Neon: curl -I https://mtgcompare.app/api/browse/au
  res.headers.set("x-dex-data", publicDataStatus());
  return res;
}
