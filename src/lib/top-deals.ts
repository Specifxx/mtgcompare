// The homepage's "Today's Top Deals" (RiftCompare's lib/top-deals.ts), for the
// visitor's market:
//   • Biggest savings (Plus) — Deal Finder's default "Underpriced vs TCGplayer"
//     ranking, sorted by % (a chase card's modest % would otherwise outrank an
//     everyday card's big one on money alone), 4 rows + the REAL total.
//   • Price drops (free) — biggest 7-day falls in TCGplayer's market price.
//   • Biggest 7-day climbs (free) — RiftCompare's column here is its Rising
//     Cards screener (demand + price timing). OP Compare has no demand signal,
//     so this is honestly what it is: the biggest 7-day rises, and free.
//
// The Plus gate is limited in the QUERY, not hidden in the browser: the page
// (cached, the same HTML for everyone) carries ONE savings row plus the real
// total, and a member's browser fetches the other rows from
// /api/top-deals/savings, which checks the session and the tier on the server
// (getMemberSavings). Price drops and climbs are free: 4 rows each.
//
// NO CACHE IN THIS FILE: it is an assembly over getDealInputs + getCatalog,
// which cache themselves (tests/nested-cache.test.ts).
import type { Country } from "./country";
import { rankDefaultVsTcg } from "./deal-pages";
import type { TcgRanked } from "./deals";
import type { CardLite, Catalog } from "./data";
import { headline } from "./price";
import { movers } from "./selectors";

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

const subtitle = (cat: Catalog, c: CardLite) => `${cat.setById.get(c.setId)?.code ?? ""} · ${c.number ?? "DON!!"}`;

function moverDeal(cat: Catalog, c: CardLite, country: Country): HomeDeal | null {
  const h = headline(c, country);
  if (h.cents == null || c.change7d == null) return null;
  return {
    id: c.id, slug: c.slug, title: c.name, variant: c.variant, subtitle: subtitle(cat, c), hasImage: c.hasImage,
    priceCents: h.cents, approx: h.kind === "reference",
    badge: `${c.change7d > 0 ? "+" : "−"}${Math.abs(c.change7d).toFixed(1)}%`,
  };
}

/** Rows per column the homepage shows, and the savings rows anyone can see. */
export const TOP_DEALS_ROWS = 4;
export const FREE_SAVINGS_ROWS = 1;

function savingsRows(cat: Catalog, ranked: TcgRanked[], n: number): HomeDeal[] {
  return ranked.slice(0, n).flatMap((r): HomeDeal[] => {
    const c = cat.byId.get(r.id);
    return c
      ? [{ id: c.id, slug: c.slug, title: c.name, variant: c.variant, subtitle: subtitle(cat, c), hasImage: c.hasImage, priceCents: r.buy, approx: false, badge: `Save ${r.pct}%` }]
      : [];
  });
}

/** The homepage's public payload: FREE_SAVINGS_ROWS savings rows (+ the real total), 4 drops, 4 climbs. */
export async function getTopDeals(country: Country): Promise<TopDeals> {
  try {
    const { cat, ranked } = await rankDefaultVsTcg(country, "pct");
    const pick = (dir: "up" | "down") =>
      movers(cat.cards, dir, TOP_DEALS_ROWS)
        .map((c) => moverDeal(cat, c, country))
        .filter((d): d is HomeDeal => d != null);
    return { country, savings: savingsRows(cat, ranked, FREE_SAVINGS_ROWS), savingsTotal: ranked.length, drops: pick("down"), rising: pick("up") };
  } catch {
    return { country, savings: [], savingsTotal: 0, drops: [], rising: [] };
  }
}

/** The member's full "Biggest savings" column. Callers check the tier first (/api/top-deals/savings). */
export async function getMemberSavings(country: Country): Promise<HomeDeal[]> {
  try {
    const { cat, ranked } = await rankDefaultVsTcg(country, "pct");
    return savingsRows(cat, ranked, TOP_DEALS_ROWS);
  } catch {
    return [];
  }
}

/** How many cards are on today's default Deal Finder list in a market — the Premium proof line. */
export async function dealCount(country: Country): Promise<number> {
  try {
    return (await rankDefaultVsTcg(country)).ranked.length;
  } catch {
    return 0;
  }
}
