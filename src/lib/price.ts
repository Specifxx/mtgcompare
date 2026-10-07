// What a tile or row shows as "the price" in a market, in one place:
//   listing   — the cheapest open listing we track there (a real, buyable price:
//               a store, TCGplayer or eBay); `stores` counts the real stores
//               among them only, so it can be 0 beside a TCGplayer/eBay low
//   reference — TCGplayer's market price converted to the market's currency (≈)
//   none      — neither
import type { Country } from "./country";
import { usdCentsToCountry } from "./fx";

export interface Priced {
  low: Record<Country, number | null>;
  stores: Record<Country, number>;
  marketUsd: number | null;
}

export type Headline =
  | { kind: "listing"; cents: number; stores: number }
  | { kind: "reference"; cents: number; stores: 0 }
  | { kind: "none"; cents: null; stores: 0 };

export function headline(p: Priced, country: Country): Headline {
  const low = p.low[country];
  if (low != null) return { kind: "listing", cents: low, stores: p.stores[country] };
  if (p.marketUsd != null) return { kind: "reference", cents: usdCentsToCountry(p.marketUsd, country), stores: 0 };
  return { kind: "none", cents: null, stores: 0 };
}

/** A sortable price for "price" sorts: the listing, else the reference. */
export function sortPrice(p: Priced, country: Country): number | null {
  return p.low[country] ?? (p.marketUsd != null ? usdCentsToCountry(p.marketUsd, country) : null);
}

