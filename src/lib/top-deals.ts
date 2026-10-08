// The homepage's "Today's Top Deals" (RiftCompare's lib/top-deals.ts), for the
// visitor's market. The public page is assembled from the published hm/home.json
// (components/home/home-data.ts: the ONE free savings row, the real count, the
// four drops and four climbs); this module keeps the row types it shares with
// TodaysTopDeals and the member door for the rest of the savings column.
//
// The Plus gate is limited in the QUERY, not hidden in the browser: the cached
// page carries one savings row plus the real total, and a member's browser
// fetches the other rows from /api/top-deals/savings, which asks getDealList with
// the session's Entitlement and answers 402 below full access.
//
// NO CACHE IN THIS FILE: getDealList caches its own ranking (tests/nested-cache.test.ts).
import type { Country } from "./country";
import { getCardsByIds, getDealList } from "./data";
import type { Entitlement } from "./data/plane/entitlement";

export interface HomeDeal {
  id: number;
  slug: string;
  title: string;
  variant: string | null;
  subtitle: string; // "OP05 · OP05-119"
  hasImage: boolean;
  priceCents: number; // in the market's currency
  approx: boolean; // true when the price is TCGplayer's converted reference (no listing here)
  badge: string; // "Save 31.4%", "−12.0%", "+8.5%"
}

export interface TopDeals {
  country: Country;
  savings: HomeDeal[];
  savingsTotal: number; // every card on the default Deal Finder list today
  drops: HomeDeal[];
  rising: HomeDeal[];
}

/** Rows per column the homepage shows, and the savings rows anyone can see. */
export const TOP_DEALS_ROWS = 4;
export const FREE_SAVINGS_ROWS = 1;

/** The member's "Biggest savings" column (by percentage). Only a viewer with full access gets rows: the loader serves a free account its three default rows, and this door answers none of them. */
export async function getMemberSavings(country: Country, who: Entitlement): Promise<HomeDeal[]> {
  try {
    const list = await getDealList(country, { sort: "pct", page: 1, pageSize: 25 }, who);
    if (list.locked) return [];
    const rows = list.rows.slice(0, TOP_DEALS_ROWS);
    const cards = await getCardsByIds(rows.map((r) => r.uid >> 1));
    return rows.flatMap((r): HomeDeal[] => {
      const c = cards.get(r.uid >> 1);
      return c ? [{ id: c.id, slug: c.slug, title: c.name, variant: c.label, subtitle: `${c.setCode} · ${c.number ?? ""}`.trim(), hasImage: c.hasImage, priceCents: r.buyCents, approx: false, badge: `Save ${r.belowPct}%` }] : [];
    });
  } catch {
    return [];
  }
}
