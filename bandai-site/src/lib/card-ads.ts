// The card ad strips (owner, 2026-10-28: "more TCGplayer ads and more eBay
// ads", like the eBay banner of real cards that earns on Rift Compare). Each
// tile is a real product with its own photo and a real price from today's
// import: the cheapest live eBay Buy It Now in a market, or TCGplayer's market
// price. No extra eBay calls (the listings are the import's own results, kept
// in summary.json's `e`), no hosted creatives, nothing that can expire.
//
// Ads, not price claims: a tile never feeds a "cheapest" line, a sort or
// structured data, and the strips sit below the price comparison, never
// between a visitor and the price rows.
import { ebayQueryOf, tcgplayerSlugOf } from "@/lib/lines";
import { SITE } from "@/site.config";
import type { Market, Offer, Product, SetInfo } from "./site-types";
import { products, refCents, sets, summaryOf } from "./data";
import { imageAt } from "./image";
import { shortName } from "./names";

export interface AdTile {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  cents: number;
  currency: string;
  url: string;
  /** TCGplayer's market price (USD cents), the tile's "Market" line. */
  ref: number | null;
}

export interface CardAds {
  /** Per eBay market; the strip falls back to eBay US where a market is thin. */
  ebay: Partial<Record<Market, AdTile[]>>;
  tcgplayer: AdTile[];
}

export interface AdScope {
  setId?: number;
  kind?: "card" | "sealed";
  /** The product the page is about (its own listings are above already). */
  exclude?: number;
  limit?: number;
  /** Top a thin set up with the newest sets' cards, so a small set still gets a full strip. */
  fill?: boolean;
  /** Multi-game sites (SITE.lines): only this game's products; a set's top-up stays in its game. */
  line?: string;
  /** Only these sets (filled from `line` by cardAds). */
  setIds?: number[];
}

export interface AdRow {
  p: Product;
  ref: number | null;
  ebay: Offer[];
  tcgplayer: Offer | null;
  /** Position among released sets, newest first (0–2 lead the site-wide strips). */
  setRank: number;
}

/** eBay item links keep only the item path; /go re-tags them (customid, campid). */
export function cleanEbayUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d+)/);
    return m ? `${u.origin}/itm/${m[1]}` : url;
  } catch {
    return url;
  }
}

const tile = (p: Product, o: Offer, ref: number | null, url = o.url): AdTile => ({
  id: p.id,
  slug: p.slug,
  name: shortName(p.name),
  image: imageAt(p.image, "200w"),
  cents: o.cents,
  currency: o.currency,
  url,
  ref,
});

/** Pure selection (tests/card-ads.test.ts): newest sets first, then value. */
export function selectCardAds(rows: AdRow[], scope: AdScope = {}): CardAds {
  const limit = scope.limit ?? 10;
  const pool = rows
    .filter((r) => r.p.image && r.p.id !== scope.exclude && (!scope.kind || r.p.kind === scope.kind) && (scope.setId == null || r.p.setId === scope.setId) && (scope.setIds == null || scope.setIds.includes(r.p.setId)))
    .filter((r) => r.p.sealedType !== "Insert")
    .sort((a, b) => (scope.setId == null ? Number(a.setRank > 2) - Number(b.setRank > 2) : 0) || (b.ref ?? 0) - (a.ref ?? 0));
  const ebay: Partial<Record<Market, AdTile[]>> = {};
  for (const r of pool) {
    for (const o of r.ebay) {
      const list = (ebay[o.market] ??= []);
      if (list.length < limit) list.push(tile(r.p, o, r.ref, cleanEbayUrl(o.url)));
    }
  }
  const tcgplayer = pool
    .filter((r) => r.tcgplayer && (r.ref ?? 0) >= 100)
    .slice(0, limit)
    .map((r) => tile(r.p, { ...r.tcgplayer!, cents: r.ref ?? r.tcgplayer!.cents }, r.ref));
  return { ebay, tcgplayer };
}

/** Each list of `a`, filled to `limit` from `b` (no product twice). */
export function topUp(a: CardAds, b: CardAds, limit: number): CardAds {
  const fill = (x: AdTile[] = [], y: AdTile[] = []) => [...x, ...y.filter((t) => !x.some((s) => s.id === t.id))].slice(0, limit);
  const ebay: Partial<Record<Market, AdTile[]>> = {};
  for (const m of new Set([...Object.keys(a.ebay), ...Object.keys(b.ebay)]) as Set<Market>) ebay[m] = fill(a.ebay[m], b.ebay[m]);
  return { ebay, tcgplayer: fill(a.tcgplayer, b.tcgplayer) };
}

let rowsMemo: AdRow[] | null = null;
function rows(): AdRow[] {
  if (rowsMemo) return rowsMemo;
  const withProducts = new Set(products().map((p) => p.setId));
  const rank = new Map(sets().filter((s) => !s.upcoming && withProducts.has(s.id)).map((s, i) => [s.id, i]));
  rowsMemo = products().map((p) => {
    const s = summaryOf(p.id);
    return {
      p,
      ref: refCents(p.id),
      ebay: s.ebay.filter((o) => o.inStock),
      tcgplayer: s.best.find((o) => o.source === "tcgplayer" && o.inStock) ?? null,
      setRank: rank.get(p.setId) ?? 99,
    };
  });
  return rowsMemo;
}

const memo = new Map<string, CardAds>();
/** The strips' tiles for a page (memoised per scope for the server instance). */
export function cardAds(scope: AdScope = {}): CardAds {
  const key = JSON.stringify(scope);
  const hit = memo.get(key);
  if (hit) return hit;
  // A set's strip on a multi-game site tops up from its own game only.
  const line = scope.line ?? (scope.setId != null ? sets().find((s) => s.id === scope.setId)?.line : undefined);
  if (line && !scope.setIds) scope = { ...scope, line, setIds: sets().filter((s) => s.line === line).map((s) => s.id) };
  let ads = selectCardAds(rows(), scope);
  if (scope.fill && scope.setId != null) ads = topUp(ads, selectCardAds(rows(), { kind: scope.kind, exclude: scope.exclude, limit: scope.limit, setIds: scope.setIds }), scope.limit ?? 10);
  memo.set(key, ads);
  return ads;
}

/** "See all" destinations: the game (or one set) on eBay and on TCGplayer.
 *  On a multi-game site, a set's own game ("set" given) or one game ("line"). */
export function adSearch(setName?: string | null, set?: Pick<SetInfo, "line"> | null): { ebayQuery: string; tcgplayerUrl: string } {
  const slug = tcgplayerSlugOf(set);
  return {
    ebayQuery: `${ebayQueryOf(set)} ${setName ?? "card"}`.trim(),
    tcgplayerUrl: setName
      ? `https://www.tcgplayer.com/search/${slug}/product?productLineName=${slug}&q=${encodeURIComponent(setName)}&view=grid`
      : `https://www.tcgplayer.com/search/${slug}/product?productLineName=${slug}&view=grid`,
  };
}
