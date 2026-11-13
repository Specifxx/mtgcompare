// The region home's "Hot right now" (desktop hero): pure, so tests/stock.test.ts checks the featuring rule without a render.
// No page draws it since 2026-11-13 (the minimal look: no products on the hero); the rule and its test stay for the next shelf that
// wants a featured order.
import { cardOpen } from "./compact";
import type { ProductCardData } from "./data";
import { featureRank } from "./popular";
import { featureSort } from "./release";
import { featureWorthy, priciestFirst } from "./feature-floor";

const HEADLINE = ["Play Booster Box", "Collector Booster Box", "Bundle"];

/**
 * "Hot right now" (desktop hero): three products from the rails already loaded, no extra read. The newest RELEASED set's in-stock box
 * first, then the next set's headline pre-order, then the in-stock booster boxes of the owner's hot sets (lib/popular.ts, featuring
 * order), then anything else the rails hold.
 */
export function hotPicks(preorders: ProductCardData[], boxes: ProductCardData[], today: string = new Date().toISOString().slice(0, 10), market = "US"): ProductCardData[] {
  const rank = (p: ProductCardData) => featureRank(p.setCode, today);
  const pre = preorders.filter((p) => HEADLINE.includes(p.productType)).sort((a, b) => HEADLINE.indexOf(a.productType) - HEADLINE.indexOf(b.productType))[0];
  // the newest released set's box leads (release.ts featureSort), then the other hot sets' in-stock boxes
  const hotBoxes = featureSort([...boxes].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1)), today);
  const out: ProductCardData[] = [];
  // the pre-order is second, never first (owner, 2026-10-25: "Reality Fracture just came out but Star Trek is popping up")
  // The top-up after the three leads is the dearest first and only products worth featuring (lib/feature-floor.ts, owner 2026-11-12).
  const rest = priciestFirst([...hotBoxes.slice(1), ...preorders], market, (x) => x.lowestPriceCents).filter((x) => featureWorthy(x.lowestPriceCents, market));
  for (const p of [hotBoxes[0], pre, ...rest]) if (p && cardOpen(p) && !out.some((x) => x.slug === p.slug) && out.length < 3) out.push(p);
  return out;
}

