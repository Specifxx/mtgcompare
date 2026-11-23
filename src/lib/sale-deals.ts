// The Black Friday / Cyber Monday pages' ONE deal list (owner's review of the Black Friday page, 2026-11-24: deals above the fold,
// one list with a toggle, a discount badge on every row, filters and sort, per-row freshness, delivered price, a sparkline).
// It merges the two lists the page had: "furthest under their own 30-day price" (lib/real-drops.ts) and "furthest under the
// median of the stores today" (lib/deals.ts). Each row carries ONE offer (the cheapest a shopper can order now), and both of its
// discounts are measured against that same price, so a product never shows two prices; the toggle picks which basis ranks and
// badges the list. Pure and browser-safe: the loader is lib/sale-deals-data.ts, the list components/SaleDeals.tsx.

export type SaleBasis = "typical" | "median";

export interface SaleDealRow {
  slug: string;
  name: string;
  productType: string;
  imageUrl: string | null;
  japanese: boolean;
  preorder: boolean;
  priceCents: number;
  storeName: string;
  buyHref: string;
  buyRel: string;
  retailer: string;
  ebayHref: string;
  /** When we last read this offer (ISO). */
  checkedAt: string;
  /** Cheapest measured shipping for this item at this price, cents, or null when we have no measurement. */
  shipMinCents: number | null;
  /** The shipping line ("+ $9.95 shipping", "Free shipping"), or null. */
  shipText: string | null;
  packs: number | null;
  /** Under the median of the stores that have it in stock today (3+ stores, 10%+ under). */
  median: { pct: number; cents: number } | null;
  /** Under its own 30-day typical price (lib/real-drops.ts rules). */
  typical: { pct: number; cents: number; lowest: boolean; sinceDay: string } | null;
  /** The last 30 recorded days' cheapest in-stock price, oldest first (null: nothing in stock that day). */
  spark: (number | null)[];
}

export const PRICE_BANDS = [
  { key: "u50", label: "Under 50", min: 0, max: 5000 },
  { key: "50-150", label: "50–150", min: 5000, max: 15000 },
  { key: "150-500", label: "150–500", min: 15000, max: 50000 },
  { key: "500+", label: "500+", min: 50000, max: Infinity },
] as const;
export type PriceBand = (typeof PRICE_BANDS)[number]["key"];

export type SaleSort = "pct" | "price" | "pack";
export type SaleLang = "all" | "en" | "ja";
export type SaleStock = "all" | "now" | "pre";

export interface SaleFilters {
  basis: SaleBasis;
  type: string; // "" = every type
  band: PriceBand | "";
  lang: SaleLang;
  stock: SaleStock;
  sort: SaleSort;
}

export const DEFAULT_FILTERS: SaleFilters = { basis: "typical", type: "", band: "", lang: "all", stock: "all", sort: "pct" };

/** A row's discount on the chosen basis, or null when it has none there. */
export function pctOn(row: SaleDealRow, basis: SaleBasis): number | null {
  return row[basis]?.pct ?? null;
}

/** The reference price on the chosen basis (struck through beside today's price), or null. */
export function refCents(row: SaleDealRow, basis: SaleBasis): number | null {
  return row[basis]?.cents ?? null;
}

export function perPack(row: SaleDealRow): number | null {
  return row.packs && row.packs > 0 ? Math.round(row.priceCents / row.packs) : null;
}

/** Price plus the cheapest measured shipping, or null when shipping was never measured for this store. */
export function deliveredCents(row: SaleDealRow): number | null {
  return row.shipMinCents == null ? null : row.priceCents + row.shipMinCents;
}

/** The rows the filters keep, in the chosen order. A row without a discount on the chosen basis is left out. */
export function applyFilters(rows: readonly SaleDealRow[], f: SaleFilters): SaleDealRow[] {
  const band = PRICE_BANDS.find((b) => b.key === f.band);
  const kept = rows.filter((r) => {
    if (pctOn(r, f.basis) == null) return false;
    if (f.type && r.productType !== f.type) return false;
    if (band && (r.priceCents < band.min || r.priceCents >= band.max)) return false;
    if (f.lang === "en" && r.japanese) return false;
    if (f.lang === "ja" && !r.japanese) return false;
    if (f.stock === "now" && r.preorder) return false;
    if (f.stock === "pre" && !r.preorder) return false;
    return true;
  });
  const byPct = (a: SaleDealRow, b: SaleDealRow) => (pctOn(b, f.basis) ?? 0) - (pctOn(a, f.basis) ?? 0) || a.priceCents - b.priceCents || a.name.localeCompare(b.name);
  if (f.sort === "price") return kept.sort((a, b) => a.priceCents - b.priceCents || byPct(a, b));
  if (f.sort === "pack") return kept.sort((a, b) => (perPack(a) ?? Infinity) - (perPack(b) ?? Infinity) || byPct(a, b));
  return kept.sort(byPct);
}

/** Product types present among the rows with a discount on `basis`, most common first. */
export function typesOf(rows: readonly SaleDealRow[], basis: SaleBasis): string[] {
  const n = new Map<string, number>();
  for (const r of rows) if (pctOn(r, basis) != null) n.set(r.productType, (n.get(r.productType) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** An offer read longer ago than this is flagged on its row (owner: "flag anything older than about 12 hours"). */
export const STALE_HOURS = 12;

export function isStale(checkedAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(checkedAt);
  return Number.isFinite(t) && now - t > STALE_HOURS * 3_600_000;
}

/** The sparkline's SVG path for a row's recorded days (width w, height h), or "" when fewer than two days carry a price. */
export function sparkPath(spark: readonly (number | null)[], w: number, h: number): string {
  const pts = spark.map((c, i) => (c == null ? null : { i, c })).filter((p): p is { i: number; c: number } => p != null);
  if (pts.length < 2) return "";
  const lo = Math.min(...pts.map((p) => p.c));
  const hi = Math.max(...pts.map((p) => p.c));
  const span = hi - lo || 1;
  const step = spark.length > 1 ? w / (spark.length - 1) : w;
  return pts.map((p, k) => `${k ? "L" : "M"}${(p.i * step).toFixed(1)},${(h - 1 - ((p.c - lo) / span) * (h - 2)).toFixed(1)}`).join(" ");
}
