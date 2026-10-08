// src/lib/price.ts (owner WP02, FROZEN; MERGED text). OP's Priced, Headline, headline() and sortPrice() byte for byte (18 and 4 importers), plus the finish helpers. sortPrice ranks by the listing, else the MARKET-derived reference; a low-only unit has no market, so it has no reference.
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

// ── ADDED for Magic (finish helpers): the draft claimed the OP block above was kept and then omitted it (critique 2) ──
import type { Finish } from "./constants";
import type { CardLite, Quote } from "./data/types";
/** A quote of one finish (default: the headline finish). */
export const finishPrice = (c: Pick<CardLite, "n" | "f" | "headFinish">, f: Finish = c.headFinish): Quote | null => (f === "N" ? c.n : c.f);
/** The finish that is NOT the headline, when it has a quote: drives the muted "Foil $X" / "Non-foil $X" chip. */
export function otherFinish(c: Pick<CardLite, "n" | "f" | "headFinish">): { finish: Finish; quote: Quote } | null {
  const finish: Finish = c.headFinish === "N" ? "F" : "N"; const quote = finishPrice(c, finish);
  return quote ? { finish, quote } : null;
}
/** The finish to preselect on a card page / QuickView / alert button: the first TRACKED unit in the order N, F; else the headline. */
export function defaultFinish(c: Pick<CardLite, "tracked" | "headFinish">): Finish { return c.tracked & 1 ? "N" : c.tracked & 2 ? "F" : c.headFinish; }
