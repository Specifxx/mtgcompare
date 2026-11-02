// This site's price feed for RiftCompare's shared alert service (DECISIONS.md,
// "Price alerts through RiftCompare's shared service", 2026-11-02): served as
// the static file /alert-feed.json (src/app/alert-feed.json/route.ts), built
// once per deploy from the same public files the pages read (data/public/
// products.json and product-stats.json). The service fetches it once a day; its
// format is pinned at the top of RiftCompare's src/lib/sister-alerts/feed.ts.
//
// The price is each product's ProductStat.lowestPriceCents per market: the
// cheapest OPEN offer (stores, and TCGplayer in the US), in that market's own
// currency, never eBay, never converted. `u` carries "{r}", which the service
// replaces with the alert's region ("/us/p/<slug>"). Deals are the site's own
// (the bar of deals.ts isDeal: 3+ stores, 10–50% under their median, above
// the type's floor). Not imported from deals.ts: that module reaches the
// database layer, and this file is prerendered at build
// (tests/vercel-ignore-build.test.ts); tests/alert-feed.test.ts pins the two equal.
import fs from "node:fs";
import path from "node:path";
import { floorCents, TYPE_BY_LABEL } from "./sealed-title";

export const ALERT_SITE_KEY = "mtg";

interface ProductRow { id: string; slug: string; name: string; productType: string; setCode: string | null }
interface StatRow { productId: string; market: string; lowestPriceCents: number | null; inStockStores: number; listedStores: number; marketplaceOpen: boolean; medianOpenCents: number | null }

export interface AlertFeed {
  v: 1;
  site: string;
  generatedAt: string;
  items: Record<string, { n: string; u: string; p: Record<string, number> }>;
  deals: { n: string; u: string; r: string; p: number; ref?: number; refLabel?: string }[];
}

/** deals.ts isDeal, on the stat row (pinned equal by tests/alert-feed.test.ts). */
export function feedIsDeal(s: Pick<StatRow, "lowestPriceCents" | "medianOpenCents" | "inStockStores" | "market">, productType: string): boolean {
  const lo = s.lowestPriceCents;
  const med = s.medianOpenCents;
  if (!lo || !med || s.inStockStores < 3) return false;
  if (lo > med * 0.9 || lo < med * 0.5) return false;
  const t = TYPE_BY_LABEL.get(productType);
  return lo >= (t ? floorCents(t.key, s.market) : 0);
}

const read = <T,>(dir: string, file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as T;

export function buildAlertFeed(dir = path.join(process.cwd(), "data", "public"), now = new Date()): AlertFeed {
  const products = new Map(read<ProductRow[]>(dir, "products.json").map((p) => [p.id, p]));
  const stats = read<StatRow[]>(dir, "product-stats.json");
  const items: AlertFeed["items"] = {};
  const dealsByMarket = new Map<string, { n: string; u: string; r: string; p: number; ref: number; ratio: number }[]>();
  for (const s of stats) {
    const p = products.get(s.productId);
    if (!p || !s.lowestPriceCents || s.lowestPriceCents <= 0) continue;
    const u = `/{r}/p/${p.slug}`;
    (items[p.id] ??= { n: p.name, u, p: {} }).p[s.market] = s.lowestPriceCents;
    if (s.medianOpenCents && feedIsDeal(s, p.productType)) {
      const list = dealsByMarket.get(s.market) ?? [];
      list.push({ n: p.name, u: `/${s.market.toLowerCase()}/p/${p.slug}`, r: s.market, p: s.lowestPriceCents, ref: s.medianOpenCents, ratio: s.lowestPriceCents / s.medianOpenCents });
      dealsByMarket.set(s.market, list);
    }
  }
  const deals: AlertFeed["deals"] = [];
  for (const list of dealsByMarket.values()) {
    for (const d of list.sort((a, b) => a.ratio - b.ratio).slice(0, 3)) deals.push({ n: d.n, u: d.u, r: d.r, p: d.p, ref: d.ref, refLabel: "store median" });
  }
  return { v: 1, site: ALERT_SITE_KEY, generatedAt: now.toISOString(), items, deals };
}
