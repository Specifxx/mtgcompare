// The monthly price report (DECISIONS.md, "Self-updating price report", 2026-11-02):
// one page a writer, a creator or a store can quote, rebuilt from the same committed
// files as every other page, so nobody writes it. Pure: the page passes the rows in.
import type { Market, Offer, Product } from "./site-types";

export interface ReportRow {
  p: Product;
  /** TCGplayer market price, USD cents. */
  ref: number | null;
  /** Cheapest in-stock offer per market, as on the product's own tile. */
  best: Offer[];
  change30d: number | null;
}

const isStore = (o: Offer) => o.source !== "tcgplayer" && o.source !== "ebay" && o.source !== "amazon";

/** The cheapest in-stock store (not TCGplayer, eBay or Amazon) in a market. */
export function cheapestStore(best: readonly Offer[], market: Market): Offer | null {
  let out: Offer | null = null;
  for (const o of best) if (o.market === market && o.inStock && !o.preorder && isStore(o) && (!out || o.cents < out.cents)) out = o;
  return out;
}

export interface BeatStats {
  /** Products with both a TCGplayer market price and an in-stock US store price. */
  compared: number;
  /** Of those, how many a store sells below TCGplayer's market price. */
  storeCheaper: number;
  /** Median saving, in percent, where a store is cheaper. */
  medianSaving: number | null;
}

/** How often a US store undercuts TCGplayer's market price (USD against USD, never converted). */
export function storesVsTcgplayer(rows: readonly ReportRow[], minRef = 500): BeatStats {
  const savings: number[] = [];
  let compared = 0;
  for (const r of rows) {
    if (!r.ref || r.ref < minRef) continue;
    const s = cheapestStore(r.best, "US");
    if (!s || s.currency !== "USD") continue;
    compared++;
    if (s.cents < r.ref) savings.push((1 - s.cents / r.ref) * 100);
  }
  savings.sort((a, b) => a - b);
  const mid = savings.length ? (savings.length % 2 ? savings[(savings.length - 1) / 2] : (savings[savings.length / 2 - 1] + savings[savings.length / 2]) / 2) : null;
  return { compared, storeCheaper: savings.length, medianSaving: mid == null ? null : Math.round(mid * 10) / 10 };
}

/** Products with at least one in-stock store offer, per market. */
export function storeCoverage(rows: readonly ReportRow[], markets: readonly Market[]): Record<Market, number> {
  const out = Object.fromEntries(markets.map((m) => [m, 0])) as Record<Market, number>;
  for (const r of rows) for (const m of markets) if (cheapestStore(r.best, m)) out[m]++;
  return out;
}

export interface SealedLine {
  p: Product;
  ref: number | null;
  us: Offer | null;
  /** Percent below (+) or above (−) TCGplayer's market price, US only. */
  vsRef: number | null;
  marketsInStock: number;
}

/** The most valuable sealed products a US store has in stock, and how far under or over TCGplayer it is.
 *  Cases are left out: almost no store lists one, so they would fill the table with dashes. */
export function sealedLines(rows: readonly ReportRow[], markets: readonly Market[], limit = 12): SealedLine[] {
  return rows
    .filter((r) => r.p.kind === "sealed" && r.ref && !/\bcase\b/i.test(r.p.name) && cheapestStore(r.best, "US"))
    .sort((a, b) => (b.ref ?? 0) - (a.ref ?? 0))
    .slice(0, limit)
    .map((r) => {
      const us = cheapestStore(r.best, "US");
      const vsRef = us && r.ref && us.currency === "USD" ? Math.round((1 - us.cents / r.ref) * 100) : null;
      return { p: r.p, ref: r.ref, us, vsRef, marketsInStock: markets.filter((m) => cheapestStore(r.best, m)).length };
    });
}

/** "November 2026" for the month a report's data is from. */
export function reportMonth(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
