/**
 * What MTG Compare lists (the low-traction cull, owner 2026-11-07: "any products that are not trendy, or very low traction or
 * conversion, we probably want to get rid of", as Compare Empire's focus cull did). DECISIONS.md, 2026-11-07.
 *
 * PURE, so the exporter (scripts/export-public-data.ts), which decides what reaches data/public/, and tests/focus.test.ts read
 * the same rule. The database keeps every product and the price history keeps every series, so a product that qualifies again
 * comes back by itself at the same URL, with its chart.
 *
 * A product is listed when any of these holds:
 *   - Search Console shows people finding its page (a click, or DEMAND_MIN_IMPRESSIONS in 56 days, any region);
 *   - its set is upcoming or released in the last NEW_SET_DAYS (pre-orders and launch weeks are when people buy);
 *   - two or more sources have it in stock in one market (it is a comparison);
 *   - it is a core product (booster boxes, bundles, booster packs, cases, starter kits…) with at least one listing anywhere,
 *     in stock or not (an out-of-print box is still what collectors look up).
 * LOW_VALUE_TYPES (Secret Lairs, precon decks, prerelease packs, special bundles, scene boxes, collections: 4,200 of 4,798 products
 * on 2026-11-07, almost no search impressions) need the comparison: two in-stock sources in one market. Everything else is culled; its URL 301s to its type page (culled.json).
 */
import { SET_BY_CODE } from "./sets";
import { TYPE_BY_LABEL } from "./sealed-title";

export const LOW_VALUE_TYPES = new Set(["Secret Lair Drop", "Commander Deck", "Deck", "Prerelease Pack", "Special Bundle", "Scene Box", "Collection"]);
export const DEMAND_MIN_IMPRESSIONS = 10;
export const NEW_SET_DAYS = 120;

export interface FocusProduct {
  id: string;
  slug: string;
  productType: string;
  setCode: string | null;
}
export interface FocusOffer {
  productId: string;
  store: string;
  market: string;
  inStock: boolean;
}

/** Product slugs with real search demand, from the `demand` branch's gsc-pages.json (paths like /au/p/<slug>). */
export function demandSlugs(pages: Record<string, number[]>): Set<string> {
  const out = new Set<string>();
  for (const [path, [clicks = 0, impressions = 0]] of Object.entries(pages)) {
    const m = /^\/[a-z]{2}\/p\/([^/]+)$/.exec(path);
    if (m && (clicks > 0 || impressions >= DEMAND_MIN_IMPRESSIONS)) out.add(decodeURIComponent(m[1]));
  }
  return out;
}

function freshSet(code: string | null, now: Date): boolean {
  const s = code ? SET_BY_CODE.get(code) : undefined;
  if (!s) return false;
  return (now.getTime() - new Date(`${s.releaseDate}T00:00:00Z`).getTime()) / 86_400_000 < NEW_SET_DAYS;
}

/** The ids of the products to list, and every culled product's slug → where its URL goes (a type page's slug, or "" for home). */
export function focusCatalog(products: readonly FocusProduct[], offers: readonly FocusOffer[], demand: ReadonlySet<string>, now = new Date()) {
  const listed = new Map<string, number>();
  const inStock = new Map<string, Map<string, Set<string>>>();
  for (const o of offers) {
    listed.set(o.productId, (listed.get(o.productId) ?? 0) + 1);
    if (!o.inStock) continue;
    let m = inStock.get(o.productId);
    if (!m) inStock.set(o.productId, (m = new Map()));
    let s = m.get(o.market);
    if (!s) m.set(o.market, (s = new Set()));
    s.add(o.store);
  }
  const keep = new Set<string>();
  const culled: Record<string, string> = {};
  for (const p of products) {
    const most = Math.max(0, ...[...(inStock.get(p.id)?.values() ?? [])].map((s) => s.size));
    const ok =
      demand.has(p.slug) ||
      freshSet(p.setCode, now) ||
      most >= 2 ||
      (!LOW_VALUE_TYPES.has(p.productType) && (listed.get(p.id) ?? 0) > 0);
    if (ok) keep.add(p.id);
    else culled[p.slug] = TYPE_BY_LABEL.get(p.productType)?.slug ?? "";
  }
  return { keep, culled };
}
