// This site's side of the Compare Empire network (lib/family-network.ts, DECISIONS.md "Sites that grow
// each other", 2026-11-02): the feed the daily data job publishes, and the cluster file it copies from
// the sisters, both under data/public/family/ (traced into every function, like the rest of data/public).
// Pages read the committed cluster file and nothing else: no fetch at request time.
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/site.config";
import { deals, priceOf } from "./data";
import { preorderSetList, sealedInSet } from "./hubs";
import { isPreorder, preorderPath } from "./preorders";
import { splitDeals } from "./black-friday";
import { kitOffers, kitStoreNames, kits, kitsOn } from "./kits";
import { sourceNameServer } from "./sources";
import { shortName } from "./names";
import { imageAt } from "./image";
import { abs } from "./site";
import {
  CLUSTER_FILE,
  FEED_FILE,
  pickTiles,
  validCluster,
  type ClusterId,
  type FamilyFeed,
  type FamilyItem,
  type FamilyRegion,
  type FamilyTile,
} from "./family-network";
import type { Market } from "./site-types";

export const FAMILY_DIR = path.join(process.cwd(), "data", "public", "family");

let cluster: FamilyFeed[] | null = null;
/** The cluster's feeds as the last data job copied them, re-validated (an old file ages out by itself). */
export function familyFeeds(now = Date.now()): FamilyFeed[] {
  if (cluster) return cluster;
  try {
    cluster = validCluster(JSON.parse(fs.readFileSync(path.join(FAMILY_DIR, CLUSTER_FILE), "utf8")), SITE.family.id, now);
  } catch {
    cluster = [];
  }
  return cluster;
}

/** The tiles for one block: one per sister in `cluster`. Empty when no sister has anything real to show. */
export function familyTiles(clusterId: ClusterId, kind: "deal" | "preorder", region: FamilyRegion = "US"): FamilyTile[] {
  return pickTiles(familyFeeds(), { self: SITE.family.id, cluster: clusterId, kind, region, max: 6 });
}

const notMarketplace = (source: string) => source !== "tcgplayer" && source !== "ebay" && source !== "amazon";

/** Today's card-game items: sealed deals first (what a sister's buyer recognises), then cards; and each upcoming release's box. */
function cardItems(): FamilyItem[] {
  const { sealed, cards } = splitDeals(deals(400).filter((d) => notMarketplace(d.offer.source)), 6);
  const dealItems: FamilyItem[] = [...sealed, ...cards].slice(0, 6).map((d) => ({
    kind: "deal",
    cluster: "cards",
    region: "US",
    title: shortName(d.p.name),
    url: abs(`/card/${d.p.slug}`),
    image: d.p.image ? imageAt(d.p.image, "200w") : null,
    cents: d.offer.cents,
    currency: d.offer.currency,
    store: sourceNameServer(d.offer),
    refCents: d.market,
    refLabel: "TCGplayer market price",
  }));
  const pre: FamilyItem[] = [];
  for (const s of preorderSetList()) {
    if (!isPreorder(s)) continue;
    const box = sealedInSet(s.id).find((p) => p.sealedType === "Booster Box") ?? sealedInSet(s.id)[0];
    if (!box) continue;
    const best = priceOf(box.id)
      .offers.filter((o) => notMarketplace(o.source) && o.currency === "USD" && (o.inStock || o.preorder))
      .sort((a, b) => a.cents - b.cents)[0];
    if (!best) continue;
    pre.push({
      kind: "preorder",
      cluster: "cards",
      region: "US",
      title: `${s.name} ${box.sealedType ?? "pre-order"}`.replace(/\s+/g, " "),
      url: abs(preorderPath(s)),
      image: box.image ? imageAt(box.image, "200w") : null,
      cents: best.cents,
      currency: best.currency,
      store: sourceNameServer(best),
      releaseDate: s.releasedOn ?? null,
    });
  }
  return [...dealItems, ...pre];
}

const MARKET_CURRENCY: Record<Market, string> = { US: "USD", UK: "GBP", CA: "CAD", AU: "AUD", EU: "EUR", SG: "SGD" };

/** Model kits (SITE.kits): per market, the cheapest in-stock shop at least 10% under the median of 3+ shops. */
function kitItems(): FamilyItem[] {
  if (!kitsOn()) return [];
  const names = kitStoreNames();
  const out: FamilyItem[] = [];
  for (const k of kits()) {
    const byMarket = new Map<Market, number[]>();
    const offers = kitOffers(k.jan).filter((o) => o.inStock);
    for (const o of offers) byMarket.set(o.market, [...(byMarket.get(o.market) ?? []), o.cents]);
    for (const [market, prices] of byMarket) {
      if (new Set(offers.filter((o) => o.market === market).map((o) => o.source)).size < 3) continue;
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      const best = offers.find((o) => o.market === market && o.cents === sorted[0])!;
      const saving = 1 - best.cents / median;
      if (saving < 0.1 || saving > 0.5) continue;
      out.push({
        kind: "deal",
        cluster: "hobby",
        region: market as FamilyRegion,
        title: k.name,
        url: abs(`/kit/${k.slug}`),
        image: k.image,
        cents: best.cents,
        currency: MARKET_CURRENCY[market],
        store: names[best.source] ?? best.source,
        refCents: median,
        refLabel: "median store price",
      });
    }
  }
  return out;
}

/** Everything this site offers its sisters today (buildFeed caps and ranks it). */
export function familyItems(): FamilyItem[] {
  const hobby = SITE.kits ? kitItems() : [];
  return [...cardItems(), ...hobby];
}

export function familyLinks(): FamilyFeed["links"] {
  const links: FamilyFeed["links"] = { US: { deals: abs("/black-friday"), preorders: abs("/preorders") } };
  return links;
}

export { FEED_FILE, CLUSTER_FILE };
