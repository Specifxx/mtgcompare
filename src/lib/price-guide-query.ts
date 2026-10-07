// /price-guide's query layer: URL → filter → sort → page, in memory over the one
// cached catalogue (RiftCompare's lib/price-guide-query.ts). Pure and client-safe:
// no Prisma, no next/*. The filters ARE /browse's (parseBrowse / runBrowse), so a
// visitor who sets the same filters on both pages gets the same cards; what the
// guide adds is its own sort list (including a 30-day column and "most stores"),
// a page size of 50/100/200 and a market override for shared links.
import { MARKETS, isCountry, type Country } from "./country";
import type { CardLite, SetLite } from "./data";
import { parseBrowse, runBrowse, type BrowseQuery, type SearchParams } from "./browse";
import { sortPrice } from "./price";

export const GUIDE_SORTS = [
  { value: "price-desc", label: "Price: High to Low" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "rising", label: "7-day change: rising first" },
  { value: "falling", label: "7-day change: falling first" },
  { value: "rising30", label: "30-day change: rising first" },
  { value: "falling30", label: "30-day change: falling first" },
  { value: "stores", label: "Most stores in stock" },
  { value: "name", label: "Name: A–Z" },
  { value: "number", label: "Set & card number" },
] as const;
export type GuideSort = (typeof GUIDE_SORTS)[number]["value"];
export const GUIDE_DEFAULT_SORT: GuideSort = "price-desc";
export const GUIDE_SIZES = [50, 100, 200] as const;
export const GUIDE_DEFAULT_SIZE = 100;
/** The 30-day column renders only once at least half the priced rows have a value. */
export const THIRTY_DAY_MIN_COVERAGE = 0.5;

const SORT_VALUES = new Set<string>(GUIDE_SORTS.map((s) => s.value));
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

export interface GuideQuery {
  browse: BrowseQuery;
  sort: GuideSort;
  size: number;
  page: number;
  /** A market the link asked for (?market=AU); null = the visitor's own. */
  market: Country | null;
}

export function parseGuide(sp: SearchParams): GuideQuery {
  const b = parseBrowse(sp);
  const sort = one(sp.sort);
  const size = Number.parseInt(one(sp.per), 10);
  const mk = one(sp.market).toUpperCase();
  return {
    browse: b,
    sort: SORT_VALUES.has(sort) ? (sort as GuideSort) : GUIDE_DEFAULT_SORT,
    size: (GUIDE_SIZES as readonly number[]).includes(size) ? size : GUIDE_DEFAULT_SIZE,
    page: b.page,
    market: isCountry(mk) ? mk : null,
  };
}

/** Any filter, search, non-default sort/size, market override or page after the first. */
export function isGuideDefault(q: GuideQuery): boolean {
  const b = q.browse;
  return !(
    b.q || b.sets.length || b.colors.length || b.rarities.length || b.types.length || b.printings.length || b.priced || b.min != null || b.max != null ||
    q.sort !== GUIDE_DEFAULT_SORT || q.size !== GUIDE_DEFAULT_SIZE || q.market || q.page > 1
  );
}

/** A filtered or sorted guide is a thin slice of the same list: noindex, follow. */
export const guideRobots = (q: GuideQuery): { index: boolean; follow: boolean } => ({ index: isGuideDefault(q) || (q.page === 1 && onlySet(q)), follow: true });
function onlySet(q: GuideQuery): boolean {
  const b = q.browse;
  return b.sets.length === 1 && !(b.q || b.colors.length || b.rarities.length || b.types.length || b.printings.length || b.priced || b.min != null || b.max != null) && q.sort === GUIDE_DEFAULT_SORT && q.size === GUIDE_DEFAULT_SIZE && !q.market;
}

const nullsLast = (a: number | null | undefined, b: number | null | undefined, dir: 1 | -1) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
};
const byNumber = (a: CardLite, b: CardLite) => (a.number ?? "~").localeCompare(b.number ?? "~", "en", { numeric: true }) || a.id - b.id;

/** Sort a copy. Every order ends in name, number, id so a page boundary never moves between requests. */
export function sortGuide(rows: CardLite[], sort: GuideSort, country: Country, setOrder: (c: CardLite) => string = () => ""): CardLite[] {
  const price = (c: CardLite) => sortPrice(c, country);
  const priceDesc = (a: CardLite, b: CardLite) => nullsLast(price(a), price(b), -1) || a.name.localeCompare(b.name) || byNumber(a, b);
  const tie = (a: CardLite, b: CardLite) => priceDesc(a, b);
  const cmp: Record<GuideSort, (a: CardLite, b: CardLite) => number> = {
    "price-desc": priceDesc,
    "price-asc": (a, b) => nullsLast(price(a), price(b), 1) || a.name.localeCompare(b.name) || byNumber(a, b),
    rising: (a, b) => nullsLast(a.change7d, b.change7d, -1) || tie(a, b),
    falling: (a, b) => nullsLast(a.change7d, b.change7d, 1) || tie(a, b),
    rising30: (a, b) => nullsLast(a.change30d, b.change30d, -1) || tie(a, b),
    falling30: (a, b) => nullsLast(a.change30d, b.change30d, 1) || tie(a, b),
    stores: (a, b) => b.stores[country] - a.stores[country] || tie(a, b),
    name: (a, b) => a.name.localeCompare(b.name) || byNumber(a, b),
    number: (a, b) => setOrder(a).localeCompare(setOrder(b)) || byNumber(a, b),
  };
  return [...rows].sort(cmp[sort]);
}

/** Share of the priced rows (this market) that have a 30-day figure. */
export function thirtyDayCoverage(rows: readonly CardLite[], country: Country): number {
  let priced = 0;
  let covered = 0;
  for (const r of rows) {
    if (r.low[country] == null) continue;
    priced++;
    if (r.change30d != null) covered++;
  }
  return priced ? covered / priced : 0;
}

export interface GuideResult {
  total: number;
  pages: number;
  page: number;
  items: CardLite[];
  show30d: boolean;
}

export function runGuide(cards: CardLite[], sets: SetLite[], setById: Map<number, SetLite>, q: GuideQuery, country: Country): GuideResult {
  // runBrowse with an unbounded page is "every card that passes the filters".
  const all = runBrowse(cards, sets, setById, { ...q.browse, per: Number.MAX_SAFE_INTEGER, page: 1 }, country).items;
  const sorted = sortGuide(all, q.sort, country, (c) => String(setById.get(c.setId)?.releasedOn ?? "9999").padStart(10, "0") + (setById.get(c.setId)?.code ?? ""));
  const pages = Math.max(1, Math.ceil(sorted.length / q.size));
  const page = Math.min(q.page, pages);
  return {
    total: sorted.length,
    pages,
    page,
    items: sorted.slice((page - 1) * q.size, page * q.size),
    show30d: thirtyDayCoverage(all, country) >= THIRTY_DAY_MIN_COVERAGE,
  };
}

export interface GuideStats {
  listed: number;
  priced: number;
  medianCents: number | null;
  underOneShare: number | null;
  dearest: CardLite | null;
}

/** The summary strip: priced count, median and the dearest card TCGplayer can value. */
export function guideStats(cards: readonly CardLite[], country: Country): GuideStats {
  const priced = cards.filter((c) => c.low[country] != null);
  const lows = priced.map((c) => c.low[country]!).sort((a, b) => a - b);
  const mid = Math.floor(lows.length / 2);
  const medianCents = lows.length ? (lows.length % 2 ? lows[mid] : Math.round((lows[mid - 1] + lows[mid]) / 2)) : null;
  const dearest = [...priced].filter((c) => c.marketUsd != null).sort((a, b) => b.low[country]! - a.low[country]!)[0] ?? null;
  return {
    listed: cards.length,
    priced: priced.length,
    medianCents,
    underOneShare: lows.length ? lows.filter((v) => v < 100).length / lows.length : null,
    dearest,
  };
}

/** The six markets, for the region toggle. */
export const GUIDE_MARKETS = MARKETS;

/** A /price-guide href with params changed (null removes), page always reset unless given. */
export function guideHref(base: SearchParams, change: Record<string, string | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (k in change || k === "page") continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) p.append(k, x);
  }
  for (const [k, v] of Object.entries(change)) if (v != null) p.set(k, v);
  const s = p.toString();
  return s ? `/price-guide?${s}` : "/price-guide";
}
