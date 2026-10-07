// Rows for a set page's "#price-guide" table (RiftCompare's lib/set-price-guide.ts):
// every card of the set, dearest first, each with its cheapest in-stock price in
// the page's market. Pure: the page hands in the cards it already read.
import type { Country } from "./country";
import type { CardLite } from "./data";

export interface SetPriceGuideRow {
  id: number;
  slug: string;
  /** Name with the printing, so two printings of one card can be told apart. */
  name: string;
  rarity: string | null;
  number: string | null;
  /** Cheapest in-stock listing in the market, cents; null = no live listing. */
  priceCents: number | null;
  /** In-stock stores in that market (never eBay). */
  stores: number;
}

/** Every card, dearest first; cards with no live price last, by card number. */
export function setPriceGuideRows(cards: readonly CardLite[], country: Country): SetPriceGuideRow[] {
  const rows = cards.map(
    (c): SetPriceGuideRow => ({
      id: c.id,
      slug: c.slug,
      name: `${c.name}${c.variant ? ` (${c.variant})` : ""}`,
      rarity: c.rarity,
      number: c.number,
      priceCents: c.low[country],
      stores: c.stores[country],
    }),
  );
  return rows.sort((a, b) => {
    if (a.priceCents != null && b.priceCents != null) return b.priceCents - a.priceCents || a.name.localeCompare(b.name) || a.id - b.id;
    if (a.priceCents != null) return -1;
    if (b.priceCents != null) return 1;
    return (a.number ?? "~").localeCompare(b.number ?? "~", "en", { numeric: true }) || a.id - b.id;
  });
}
