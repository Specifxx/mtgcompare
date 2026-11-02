// This site's side of the Compare Empire network (lib/family-network.ts, DECISIONS.md "Sites that grow
// each other", 2026-11-02): the feed the sealed import publishes, and the cluster file it copies from the
// sister card sites, both under data/public/family/ (traced like the rest of data/public). Pages read the
// committed cluster file and nothing else: no fetch at request time, no other site's database.
import fs from "node:fs";
import path from "node:path";
import { productPage } from "./data";
import { dealsInMarket } from "./deals";
import { REGIONS, type Region } from "./regions";
import { SITE_URL } from "./site";
import {
  CLUSTER_FILE,
  pickTiles,
  toFamilyRegion,
  validCluster,
  type FamilyFeed,
  type FamilyItem,
  type FamilyTile,
} from "./family-network";

export const FAMILY_ID = "mtg" as const;
export const FAMILY_DIR = path.join(process.cwd(), "data", "public", "family");

let cluster: FamilyFeed[] | null = null;
/** The card sisters' feeds as the last import copied them, re-validated (an old file ages out by itself). */
export function familyFeeds(now = Date.now()): FamilyFeed[] {
  if (cluster) return cluster;
  try {
    cluster = validCluster(JSON.parse(fs.readFileSync(path.join(FAMILY_DIR, CLUSTER_FILE), "utf8")), FAMILY_ID, now);
  } catch {
    cluster = [];
  }
  return cluster;
}

/** One tile per sister card site, the visitor's region first. Empty when no sister has anything real. */
export function familyTiles(kind: "deal" | "preorder", region: Region): FamilyTile[] {
  return pickTiles(familyFeeds(), { self: FAMILY_ID, cluster: "cards", kind, region: toFamilyRegion(region), max: 6 });
}

/** Today's deals per region: the cheapest in-stock independent store, 10%+ under the median of 3+ stores (lib/deals.ts). */
export async function familyItems(): Promise<FamilyItem[]> {
  const out: FamilyItem[] = [];
  for (const r of Object.values(REGIONS)) {
    for (const d of await dealsInMarket(r.market, { take: 8 })) {
      if (!d.medianOpenCents) continue;
      const page = await productPage(d.slug, r.market);
      const best = page?.offers.filter((o) => o.inStock && !o.marketplace).sort((a, b) => a.priceCents - b.priceCents)[0];
      if (!best) continue;
      out.push({
        kind: "deal",
        cluster: "cards",
        region: toFamilyRegion(r.region),
        title: d.name,
        url: `${SITE_URL}/${r.region}/p/${d.slug}`,
        image: d.imageUrl,
        cents: best.priceCents,
        currency: r.currency,
        store: best.storeName,
        refCents: d.medianOpenCents,
        refLabel: "median store price",
      });
    }
  }
  return out;
}

export function familyLinks(): FamilyFeed["links"] {
  const links: FamilyFeed["links"] = {};
  for (const r of Object.values(REGIONS)) links[toFamilyRegion(r.region)] = { deals: `${SITE_URL}/${r.region}/deals` };
  return links;
}
