// The stores' measured shipping (src/data/shipping-rates.json, bundled at build time: no database, no runtime fetch), written weekly by
// .github/workflows/shipping-rates.yml (scripts/probe-shipping-rates.ts, then scripts/build-shipping-rates.ts). A store not in it, or
// TCGplayer, has no figure: its row says "Shipping at checkout". Never a guessed rate.
import raw from "@/data/shipping-rates.json";
import { regionOfMarket } from "./regions";
import { PROBE_ADDRESSES, validSnapshot, type ProbeMarket } from "./shipping-probe";
import { quoteAt, shipCell, type ShipCell, type ShipQuote } from "./shipping-quote";

export const SHIPPING = validSnapshot(raw);

/** The addresses each market's stores are quoted to (the copy's "N addresses"). */
export function addressCount(market: string): number {
  return PROBE_ADDRESSES[market as ProbeMarket]?.length ?? 0;
}

/** Stores of a market with a measurement in the snapshot. */
export function measuredStores(market: string): number {
  return Object.values(SHIPPING.stores).filter((s) => s.market === market).length;
}

export function shippingQuote(storeKey: string, market: string, priceCents: number): ShipQuote | null {
  const s = SHIPPING.stores[storeKey];
  const r = regionOfMarket(market);
  if (!s || !r || s.market !== market || s.currency !== r.currency) return null;
  const ids = (SHIPPING.addresses[market as ProbeMarket] ?? PROBE_ADDRESSES[market as ProbeMarket] ?? []).map((a) => a.id);
  return quoteAt(s, ids, priceCents);
}

export function shippingCell(storeKey: string, market: string, priceCents: number, fmt: (cents: number) => string): ShipCell | null {
  const r = regionOfMarket(market);
  return shipCell(shippingQuote(storeKey, market, priceCents), fmt, r?.inName ?? market);
}
