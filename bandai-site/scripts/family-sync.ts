// The Compare Empire network's daily step (lib/family-network.ts, DECISIONS.md "Sites that grow each
// other", 2026-11-02), run by refresh-prices.yml after the imports and before the data commit:
//
//   1. data/public/family/family-feed.json: this site's best deals and pre-orders today, real store
//      prices from the files just written. Sister sites read it from GitHub.
//   2. data/public/family/family-cluster.json: the feeds of every sister in this site's clusters, read
//      from GitHub now, for the "Also in this cluster" blocks (lib/family.ts).
//
// Never fails the run: a sister whose feed is missing or stale is simply left out, and the old cluster
// file is kept when every read fails (it ages out by itself at FEED_MAX_AGE_DAYS).
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import { FAMILY_DIR, familyItems, familyLinks } from "@/lib/family";
import { CLUSTER_FILE, FEED_FILE, buildFeed, clusterIds, fetchFamilyFeeds, type FamilyCluster } from "@/lib/family-network";

async function main() {
  fs.mkdirSync(FAMILY_DIR, { recursive: true });
  const feed = buildFeed(SITE.family.id, familyItems(), familyLinks());
  fs.writeFileSync(path.join(FAMILY_DIR, FEED_FILE), JSON.stringify(feed, null, 1) + "\n");
  console.log(`[family] ${FEED_FILE}: ${feed.items.length} items`);

  const ids = clusterIds(SITE.family.id);
  const feeds = await fetchFamilyFeeds(ids);
  console.log(`[family] read ${feeds.length}/${ids.length} sister feeds: ${feeds.map((f) => f.site).join(", ") || "none"}`);
  if (!feeds.length && fs.existsSync(path.join(FAMILY_DIR, CLUSTER_FILE))) {
    console.log("[family] kept the previous cluster file");
    return;
  }
  const out: FamilyCluster = { v: 1, site: SITE.family.id, fetchedAt: new Date().toISOString(), feeds };
  fs.writeFileSync(path.join(FAMILY_DIR, CLUSTER_FILE), JSON.stringify(out) + "\n");
}

main().catch((e) => {
  console.warn("[family] skipped:", e instanceof Error ? e.message : e);
});
