// /sealed's query: parse, filter and sort, as one pure module (RiftCompare's
// sealed filters and sort, on OP's param names: q, min, max, stock, promo, kind,
// set, sort). Pure so tests/sealed-query.test.ts pins every rule, and the client
// SealedFilters/SealedSort build URLs that this parses back.
import { COUNTRIES, type Country } from "./country";
import type { SealedLite } from "./data";
import { sortPrice } from "./price";

export const SEALED_SORTS = {
  featured: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  newest: "Recently added",
  name: "Name A–Z",
} as const;
export type SealedSort = keyof typeof SEALED_SORTS;

export interface SealedQuery {
  q: string;
  /** Major currency units in the visitor's market currency. */
  min: number | null;
  max: number | null;
  stock: boolean;
  promo: boolean;
  kinds: string[];
  /** Set slugs. */
  sets: string[];
  sort: SealedSort;
}

type SP = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string | string[] | undefined): number | null => {
  const n = Number.parseFloat(first(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseSealedQuery(sp: SP): SealedQuery {
  const sort = first(sp.sort) as SealedSort;
  const min = num(sp.min);
  const max = num(sp.max);
  return {
    q: first(sp.q).trim().slice(0, 80),
    min,
    max: max != null && min != null && max < min ? null : max,
    stock: first(sp.stock) === "1",
    promo: first(sp.promo) === "1",
    kinds: [...new Set(list(sp.kind))],
    sets: [...new Set(list(sp.set))],
    sort: sort in SEALED_SORTS ? sort : "featured",
  };
}

/** A filter that narrows the grid (the page is noindex,follow then; sort alone is not a filter). */
export function isSealedFiltered(q: SealedQuery): boolean {
  return Boolean(q.q || q.min != null || q.max != null || q.stock || q.promo || q.kinds.length || q.sets.length);
}

/** How many filters are active, for "Clear (N)". */
export function sealedFilterCount(q: SealedQuery): number {
  return (q.q ? 1 : 0) + (q.min != null || q.max != null ? 1 : 0) + (q.stock ? 1 : 0) + (q.promo ? 1 : 0) + q.kinds.length + q.sets.length;
}

/** The query back into URL params (repeated `kind`, csv `set`), omitting defaults. */
export function sealedParams(q: SealedQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.min != null) p.set("min", String(q.min));
  if (q.max != null) p.set("max", String(q.max));
  if (q.stock) p.set("stock", "1");
  if (q.promo) p.set("promo", "1");
  for (const k of q.kinds) p.append("kind", k);
  if (q.sets.length) p.set("set", q.sets.join(","));
  if (q.sort !== "featured") p.set("sort", q.sort);
  return p;
}

const RETAIL_ORDER = [
  "Booster Box", "Booster Case", "Booster Pack", "Sleeved Booster Pack", "Double Pack Set", "Starter Deck", "Display", "Display Case",
  "Premium Collection", "Gift Collection", "Illustration Box", "Tin Pack Set", "Devil Fruits Collection", "DON!! Pack", "Collection",
];
const rank = (k: string) => (RETAIL_ORDER.indexOf(k) === -1 ? 99 : RETAIL_ORDER.indexOf(k));

export interface SealedCtx {
  country: Country;
  /** Set slug of a set id; undefined when the product has no set. */
  setSlugOf: (setId: number | null) => string | undefined;
  /** Set release date (YYYY-MM-DD) of a set id. */
  setReleased: (setId: number | null) => string | undefined;
}

/** In stock here: a listing in the visitor's market. */
export const inStockHere = (s: SealedLite, country: Country): boolean => s.low[country] != null;

export function filterSealed(rows: SealedLite[], q: SealedQuery, ctx: SealedCtx): SealedLite[] {
  const needle = q.q.toLowerCase();
  const kinds = new Set(q.kinds);
  const sets = new Set(q.sets);
  return rows.filter((s) => {
    // Tournament promo packs are hidden unless asked for, or their kind is picked.
    if (s.kind === "Promo Pack" && !q.promo && !kinds.has("Promo Pack")) return false;
    if (kinds.size && !kinds.has(s.kind)) return false;
    if (sets.size) {
      const slug = ctx.setSlugOf(s.setId);
      if (!slug || !sets.has(slug)) return false;
    }
    if (q.stock && !inStockHere(s, ctx.country)) return false;
    if (needle && !s.name.toLowerCase().includes(needle)) return false;
    if (q.min != null || q.max != null) {
      const cents = sortPrice(s, ctx.country);
      if (cents == null) return false;
      if (q.min != null && cents < q.min * 100) return false;
      if (q.max != null && cents > q.max * 100) return false;
    }
    return true;
  });
}

export function sortSealed(rows: SealedLite[], sort: SealedSort, ctx: SealedCtx): SealedLite[] {
  const rel = (s: SealedLite) => s.releasedOn ?? ctx.setReleased(s.setId) ?? "";
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return (sortPrice(a, ctx.country) ?? Infinity) - (sortPrice(b, ctx.country) ?? Infinity) || a.id - b.id;
      case "price-desc":
        return (sortPrice(b, ctx.country) ?? -1) - (sortPrice(a, ctx.country) ?? -1) || a.id - b.id;
      case "newest":
        return rel(b).localeCompare(rel(a)) || a.id - b.id;
      case "name":
        return a.name.localeCompare(b.name) || a.id - b.id;
      default:
        return rank(a.kind) - rank(b.kind) || rel(b).localeCompare(rel(a)) || a.id - b.id;
    }
  });
  return out;
}

/** The market's currency code, for the price filter's label. */
export const sealedCurrency = (country: Country): string => COUNTRIES[country].currency;
