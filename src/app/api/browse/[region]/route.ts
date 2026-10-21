import { marketIndexCards } from "@/lib/browse-data";
import { lastCheckedAt } from "@/lib/data";
import { REGIONS } from "@/lib/regions";
import { publicDataStatus } from "@/lib/public-data/store";
import { browseIndexResponse, buildIndex } from "@/lib/search-index";

// GET /api/browse/<region>: the region's browse index (lib/search-index.ts), every product /<region>/sealed lists, as compact
// tuples. The header typeahead, the browse grid's filters and the recently-viewed rail load it once per page session
// (lib/index-client.ts) and do all their searching and sorting in the browser.
//
// An ISR route handler, like the pages: rendered on the first request after a deploy or an import (the importer's
// revalidatePath("/", "layout") purges it with every page), then served from the cache and the CDN for a day. So the database
// sees one whole-market read per region per import, however many visitors search.
//
// RiftCompare's Pokémon section reads this index too, server-side and cached six hours (its src/lib/pokemon/dexcompare.ts), for
// each product's cheapest store and store counts, joined by the TCGplayer id in the image URL. It accepts INDEX_VERSION 1 only: a
// change to the tuple or a new version hides its store lines until it is updated (its ops monitor flags that), so say so there. Nothing is built at deploy time (no
// static params), so a build never needs the database. /api/ is disallowed in robots.txt.
export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: { region: string } }) {
  const res = await browseIndexResponse(params.region, async (region) => {
    const { market } = REGIONS[region];
    const [cards, checked] = await Promise.all([marketIndexCards(market), lastCheckedAt(market)]);
    return buildIndex(region, cards, checked);
  });
  // Which source answered (src/lib/public-data/): "files <snapshot time> <database>" or "db". The check that a release reads the
  // bundled files and not Neon: curl -I https://www.dexcompare.app/api/browse/au
  res.headers.set("x-dex-data", publicDataStatus());
  return res;
}
