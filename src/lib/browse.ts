// /browse filtering and sorting — pure, over the cached catalogue.
import type { Country } from "./country";
import type { CardLite, SetLite } from "./data";
import { sortPrice } from "./price";
import { searchCards } from "./search";
import { RARITIES } from "./constants";

export type SearchParams = Record<string, string | string[] | undefined>;

export const SORTS = {
  value: "Most valuable",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  newest: "Newest set first",
  number: "Set & card number",
  name: "Name A–Z",
  rising: "Rising this week",
  falling: "Falling this week",
} as const;
export type SortKey = keyof typeof SORTS;

export interface BrowseQuery {
  q: string;
  sets: string[];
  colors: string[];
  rarities: string[];
  types: string[];
  printings: string[];
  min: number | null; // market currency cents
  max: number | null;
  priced: boolean;
  sort: SortKey;
  page: number;
  per: number;
}

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
const dollars = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export function parseBrowse(sp: SearchParams): BrowseQuery {
  const sort = one(sp.sort) as SortKey;
  const per = parseInt(one(sp.per), 10);
  const page = parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).slice(0, 80),
    sets: list(sp.set),
    colors: list(sp.color).map((c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()),
    rarities: list(sp.rarity),
    types: list(sp.type),
    printings: list(sp.printing),
    min: dollars(one(sp.min)),
    max: dollars(one(sp.max)),
    priced: one(sp.priced) === "1",
    sort: sort in SORTS ? sort : "value",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
    per: per === 100 || per === 24 ? per : 48,
  };
}

export function runBrowse(
  cards: CardLite[],
  sets: SetLite[],
  setById: Map<number, SetLite>,
  q: BrowseQuery,
  country: Country,
): { total: number; pages: number; items: CardLite[] } {
  let rows = q.q ? searchCards(cards, setById, q.q) : cards;
  if (q.sets.length) {
    const ids = new Set(sets.filter((s) => q.sets.includes(s.slug) || q.sets.includes(s.code)).map((s) => s.id));
    rows = rows.filter((c) => ids.has(c.setId));
  }
  if (q.colors.length) rows = rows.filter((c) => c.colors.some((x) => q.colors.includes(x)));
  if (q.rarities.length) rows = rows.filter((c) => c.rarity && q.rarities.includes(c.rarity));
  if (q.types.length) rows = rows.filter((c) => c.cardType && q.types.includes(c.cardType));
  if (q.printings.length) rows = rows.filter((c) => q.printings.includes(c.printing));
  if (q.priced) rows = rows.filter((c) => c.low[country] != null);
  if (q.min != null || q.max != null) {
    rows = rows.filter((c) => {
      const p = sortPrice(c, country);
      if (p == null) return false;
      return (q.min == null || p >= q.min) && (q.max == null || p <= q.max);
    });
  }
  const price = (c: CardLite) => sortPrice(c, country);
  const rel = (c: CardLite) => setById.get(c.setId)?.releasedOn ?? "";
  const byNumber = (a: CardLite, b: CardLite) => (a.number ?? "~").localeCompare(b.number ?? "~") || a.id - b.id;
  const sorted = [...rows];
  switch (q.sort) {
    case "price-asc":
      sorted.sort((a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity));
      break;
    case "price-desc":
      sorted.sort((a, b) => (price(b) ?? -1) - (price(a) ?? -1));
      break;
    case "newest":
      sorted.sort((a, b) => rel(b).localeCompare(rel(a)) || byNumber(a, b));
      break;
    case "number":
      sorted.sort(byNumber);
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name) || byNumber(a, b));
      break;
    case "rising":
      sorted.sort((a, b) => (b.change7d ?? -Infinity) - (a.change7d ?? -Infinity));
      break;
    case "falling":
      sorted.sort((a, b) => (a.change7d ?? Infinity) - (b.change7d ?? Infinity));
      break;
    default:
      // A search keeps its relevance order; everything else opens on value.
      if (!q.q) sorted.sort((a, b) => (b.marketUsd ?? -1) - (a.marketUsd ?? -1));
  }
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / q.per));
  const page = Math.min(q.page, pages);
  return { total, pages, items: sorted.slice((page - 1) * q.per, page * q.per) };
}

/** A /browse href with some params changed (null removes). */
export function browseHref(base: SearchParams, change: Record<string, string | null>, path = "/browse"): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (k in change) continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) p.append(k, x);
  }
  for (const [k, v] of Object.entries(change)) if (v != null) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export const RARITY_FILTER = Object.keys(RARITIES);
