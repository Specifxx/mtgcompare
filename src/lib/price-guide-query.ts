// /price-guide's query layer: URL -> CardQuery (RiftCompare's lib/price-guide-query.ts). Pure and client-safe: no Prisma, no next/*, and no catalogue in memory — the rows come from the
// browse engine (data/lists.ts getCardPage), which sorts and pages 99,000 printings in a few milliseconds. The filters ARE /browse's (parseBrowse), so a visitor who sets the same
// filters on both pages gets the same cards; what the guide adds is its own sort list, a page size of 24/48/100 and a market override for shared links.
//
// MARKET ONLY: price sorts and ranges read the TCGplayer MARKET price of the card's headline unit (Normal first), never a thin single listing, so a US$203,067 "low only" row can never
// top the guide. The price a row SHOWS is the cheapest in-stock listing in the market (or the TCGplayer reference, marked "≈").
import { MARKETS, isCountry, type Country } from "./country";
import type { CardLite, CardQuery, SetLite } from "./data";
import { isFiltered, parseBrowse, toCardQuery, type BrowseQuery, type SearchParams } from "./browse";

export const GUIDE_SORTS = [
  { value: "price-desc", label: "Price: High to Low" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "rising", label: "7-day change: rising first" },
  { value: "falling", label: "7-day change: falling first" },
  { value: "newest", label: "Newest set first" },
  { value: "name", label: "Name: A–Z" },
  { value: "number", label: "Set & card number" },
] as const;
export type GuideSort = (typeof GUIDE_SORTS)[number]["value"];
export const GUIDE_DEFAULT_SORT: GuideSort = "price-desc";
export const GUIDE_SIZES = [24, 48, 100] as const;
export const GUIDE_DEFAULT_SIZE = 100;
/** The 30-day column renders only once at least half the priced rows have a value. */
export const THIRTY_DAY_MIN_COVERAGE = 0.5;

const SORT_VALUES = new Set<string>(GUIDE_SORTS.map((s) => s.value));
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

export interface GuideQuery {
  browse: BrowseQuery;
  sort: GuideSort;
  size: 24 | 48 | 100;
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
    size: (GUIDE_SIZES as readonly number[]).includes(size) ? (size as GuideQuery["size"]) : GUIDE_DEFAULT_SIZE,
    page: b.page,
    market: isCountry(mk) ? mk : null,
  };
}

/** Any filter, search, non-default sort/size, market override or page after the first. */
export function isGuideDefault(q: GuideQuery): boolean {
  return !(isFiltered(q.browse) || q.sort !== GUIDE_DEFAULT_SORT || q.size !== GUIDE_DEFAULT_SIZE || q.market || q.page > 1);
}

/** A filtered or sorted guide is a thin slice of the same list: noindex, follow. */
export const guideRobots = (q: GuideQuery): { index: boolean; follow: boolean } => ({ index: isGuideDefault(q) || (q.page === 1 && onlySet(q)), follow: true });
function onlySet(q: GuideQuery): boolean {
  const b = q.browse;
  return b.sets.length === 1 && !isFiltered({ ...b, sets: [] }) && q.sort === GUIDE_DEFAULT_SORT && q.size === GUIDE_DEFAULT_SIZE && !q.market;
}

/** The CardQuery the guide asks the engine: /browse's filters, the guide's sort and page size, and the default floor (THIN rows are out of the plain guide; a search, a set or a named minimum lifts it). */
export function guideCardQuery(q: GuideQuery, sets: readonly SetLite[], country: Country): Partial<CardQuery> {
  return { ...toCardQuery(q.browse, sets, country, { per: q.size }), sort: q.sort, page: q.page };
}

/** Share of the priced rows (this market) that have a 30-day figure. */
export function thirtyDayCoverage(rows: readonly CardLite[], country: Country): number {
  let priced = 0;
  let covered = 0;
  for (const r of rows) {
    if (r.low[country] == null && r.marketUsd == null) continue;
    priced++;
    if (r.change30d != null) covered++;
  }
  return priced ? covered / priced : 0;
}

/** True when the 30-day column should render for these rows. */
export const show30d = (rows: readonly CardLite[], country: Country): boolean => thirtyDayCoverage(rows, country) >= THIRTY_DAY_MIN_COVERAGE;

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
