// This site's price feed for RiftCompare's shared alert service (DECISIONS.md,
// "Price alerts through RiftCompare's shared service", 2026-11-02): served as
// the static file /alert-feed.json (src/app/alert-feed.json/route.ts), built
// once per deploy from the same files the pages read. The service fetches it
// once a day; its format is pinned at the top of RiftCompare's
// src/lib/sister-alerts/feed.ts and by tests/alert-feed.test.ts.
//
// The price is the lowest IN-STOCK offer per market from a store or TCGplayer,
// in that market's own currency: never eBay, never a conversion.
import { SITE } from "@/site.config";
import { deals, priceOf, products } from "./data";
import type { Market, Offer } from "./site-types";

export function lowestByMarket(offers: Offer[]): Partial<Record<Market, number>> {
  const out: Partial<Record<Market, number>> = {};
  for (const o of offers) {
    if (!o.inStock || o.source === "ebay" || !(o.cents > 0)) continue;
    const cur = out[o.market];
    if (cur == null || o.cents < cur) out[o.market] = o.cents;
  }
  return out;
}

export interface AlertFeed {
  v: 1;
  site: string;
  generatedAt: string;
  items: Record<string, { n: string; u: string; p: Partial<Record<Market, number>> }>;
  deals: { n: string; u: string; r: Market; p: number; ref?: number; refLabel?: string }[];
}

export function buildAlertFeed(now = new Date()): AlertFeed {
  const items: AlertFeed["items"] = {};
  for (const p of products()) {
    const prices = lowestByMarket(priceOf(p.id).offers);
    if (!Object.keys(prices).length) continue;
    items[p.id] = { n: p.number ? `${p.name} ${p.number}` : p.name, u: `/card/${p.slug}`, p: prices };
  }
  const top = deals(40)
    .filter((d) => d.offer.source !== "ebay" && d.offer.source !== "tcgplayer")
    .slice(0, 5)
    .map((d) => ({ n: d.p.number ? `${d.p.name} ${d.p.number}` : d.p.name, u: `/card/${d.p.slug}`, r: d.offer.market, p: d.offer.cents, ref: d.market, refLabel: "TCGplayer market" }));
  return { v: 1, site: SITE.key, generatedAt: now.toISOString(), items, deals: top };
}
