// The Compare Empire network's daily step (lib/family-network.ts, DECISIONS.md "Sites that grow each
// other", 2026-11-02), run by sealed-import.yml after the export and before the publish:
//
//   1. data/public/family/family-feed.json: this site's best store deals today, per region, from the
//      files just exported (PUBLIC_DATA_MODE=files). Sister sites read it from GitHub.
//   2. data/public/family/family-cluster.json: the sister card sites' feeds, read from GitHub now, for
//      the "Other card games on sale" block (lib/family.ts).
//
// Never fails the run: a missing or stale sister feed is left out, and the old cluster file is kept when
// every read fails (it ages out by itself).
import fs from "node:fs";
import path from "node:path";
import { FAMILY_DIR, FAMILY_ID, familyItems, familyLinks } from "../src/lib/family";
import { CLUSTER_FILE, FEED_FILE, buildFeed, clusterIds, fetchFamilyFeeds, type FamilyCluster } from "../src/lib/family-network";

async function main() {
  fs.mkdirSync(FAMILY_DIR, { recursive: true });
  const feed = buildFeed(FAMILY_ID, await familyItems(), familyLinks());
  fs.writeFileSync(path.join(FAMILY_DIR, FEED_FILE), JSON.stringify(feed, null, 1) + "\n");
  console.log(`[family] ${FEED_FILE}: ${feed.items.length} items`);
  const ids = clusterIds(FAMILY_ID);
  const feeds = await fetchFamilyFeeds(ids);
  console.log(`[family] read ${feeds.length}/${ids.length} sister feeds: ${feeds.map((f) => f.site).join(", ") || "none"}`);
  if (!feeds.length && fs.existsSync(path.join(FAMILY_DIR, CLUSTER_FILE))) return console.log("[family] kept the previous cluster file");
  const out: FamilyCluster = { v: 1, site: FAMILY_ID, fetchedAt: new Date().toISOString(), feeds };
  fs.writeFileSync(path.join(FAMILY_DIR, CLUSTER_FILE), JSON.stringify(out) + "\n");
}

main()
  .catch((e) => console.warn("[family] skipped:", e instanceof Error ? e.message : e))
  .finally(() => process.exit(0));
