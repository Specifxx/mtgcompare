// The light, browser-side half of search & browse: the index's shape, its loader, and the few helpers every page's search box needs
// before anyone types. Nothing here imports the set or product-type catalogues: the ranking (lib/search-index.ts) and the tuple
// expander (lib/compact.ts) are loaded on demand, so the header's search box costs every page almost nothing until it is used.
//
// loadIndex(region): the region's browse index (/api/browse/<region>), loaded at most once per page session and region (a
// module-level Map of promises, shared by the header typeahead, the browse grid and the recently-viewed rail, and kept across
// client-side navigations), and only when something needs it: a focus in a search box, a filter, a recently-viewed list. The CDN
// serves it; the database never sees a keystroke. A failed load is forgotten, so the next caller tries again; until then each caller
// keeps what it already has (the browse grid its 48 server rows, the typeahead its "See all results" row).
import type { CompactCard } from "./compact";
import type { ProductCardData } from "./data";
import type { Region } from "./regions";

// ─── The index's shape ────────────────────────────────────────────────────────

export const INDEX_VERSION = 1;

export interface BrowseIndex {
  v: typeof INDEX_VERSION;
  region: Region;
  /** When the region's stores were last read (lib/data.ts lastCheckedAt), ISO; null before the first import. */
  checkedAt: string | null;
  /** Every comparable product in the region, in the browse page's relevance order (lib/search-index.ts buildIndex). */
  rows: CompactCard[];
}

/** A response body the browser can trust to be an index of this region (a stale deploy or a proxy page is not). */
export function isBrowseIndex(x: unknown, region: Region): x is BrowseIndex {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<BrowseIndex>;
  return o.v === INDEX_VERSION && o.region === region && Array.isArray(o.rows) && o.rows.every((r) => Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "string");
}

// ─── Loading it ───────────────────────────────────────────────────────────────

export interface LoadedIndex {
  region: Region;
  checkedAt: string | null;
  /** Every comparable product in the region, in the browse page's relevance order. */
  cards: ProductCardData[];
  bySlug: Map<string, ProductCardData>;
}

const pending = new Map<Region, Promise<LoadedIndex>>();
const ready = new Map<Region, LoadedIndex>();

export function indexUrl(region: Region): string {
  return `/api/browse/${region}`;
}

export function loadIndex(region: Region): Promise<LoadedIndex> {
  let p = pending.get(region);
  if (!p) {
    const body = fetch(indexUrl(region), { headers: { accept: "application/json" } }).then((res) => {
      if (!res.ok) throw new Error(`browse index: HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    });
    p = Promise.all([body, import("./compact")]).then(([json, { expandCard }]) => {
      if (!isBrowseIndex(json, region)) throw new Error("browse index: unexpected body");
      const cards = json.rows.map(expandCard);
      const loaded: LoadedIndex = { region, checkedAt: json.checkedAt, cards, bySlug: new Map(cards.map((c) => [c.slug, c])) };
      ready.set(region, loaded);
      return loaded;
    });
    p.catch(() => {
      if (pending.get(region) === p) pending.delete(region);
    });
    pending.set(region, p);
  }
  return p;
}

/** The index if it has already arrived in this page session (no request), else null. */
export function peekIndex(region: Region): LoadedIndex | null {
  return ready.get(region) ?? null;
}

// ─── Where a search goes ──────────────────────────────────────────────────────

/**
 * The window event a search box sends when its query should go to the browse grid already on screen (the visitor is on
 * /<region>/sealed or one of its pages): BrowseGrid reads ?q= only once, after hydration, so a navigation to the same page would
 * not reach it. `detail` is the query.
 */
export const BROWSE_QUERY_EVENT = "dex:browse-query";

/** Is this pathname the region's browse page (or one of its numbered pages)? */
export function isBrowsePath(pathname: string | null | undefined, region: Region): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "");
  return p === `/${region}/sealed` || p.startsWith(`/${region}/sealed/page/`);
}

/** Where a search for `q` lists every match: the browse page, filtered (BrowseGrid reads ?q= after hydration). */
export function searchHref(region: Region, q: string): string {
  const term = q.trim();
  return term ? `/${region}/sealed?q=${encodeURIComponent(term)}` : `/${region}/sealed`;
}

export type SearchOption =
  | { kind: "product"; key: string; href: string; card: ProductCardData }
  | { kind: "all"; key: string; href: string; label: string; total: number };

/**
 * The typeahead's options: the ranked products (lib/search-index.ts rankSearch; none yet while it loads), then always "See all
 * results for “q”" (the browse page, filtered). Empty for an empty query.
 */
export function searchOptions(region: Region, q: string, ranked: { products: ProductCardData[]; total: number }): SearchOption[] {
  const term = q.trim();
  if (!term) return [];
  return [
    ...ranked.products.map((card): SearchOption => ({ kind: "product", key: card.slug, href: `/${region}/p/${card.slug}`, card })),
    { kind: "all", key: "all", href: searchHref(region, term), label: `See all results for “${term}”`, total: ranked.total },
  ];
}
