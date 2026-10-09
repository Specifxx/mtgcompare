// Deal Finder's three lists, assembled for a page (server only): the pure
// rankings in lib/deals.ts over the loaders of lib/data/deals.ts, plus the
// live listings for the <= 25 units on the page being shown.
//
// The paid lists are cut ONCE, in the loader (getDealList / getVsEbayList take the
// caller's Entitlement); nothing here compares a tier or hides a row. NO CACHE
// HERE, deliberately: never wrap these functions in unstable_cache and never call
// them from inside one (tests/nested-cache.test.ts).
//
// Every price shown beside a link is THAT listing's own live price: the ranking
// comes from the published columns, the row from the live listing, re-scored with
// the same predicate and dropped if it no longer qualifies, never a cached price
// beside another store's link.
import { affiliateUrl } from "./affiliate";
import { ebayRetailer, retailerSubId } from "./board";
import type { Finish } from "./constants";
import type { Country } from "./country";
import { getCardLookup, getCardsByIds, getDealList, getDealOffers, getEbayDealInputs, getVsEbayList, type CardLite, type DealOfferDetail } from "./data";
import type { DealQuery, Entitlement } from "./data/plane/entitlement";
import { DEAL_FINDER_PATH } from "./deal-finder-href";
import {
  cheapestEbayByCard,
  cheapestListing,
  ebayBuyLabel,
  ebaySourceFor,
  hasEbayComparison,
  pageRanked,
  rankCheapestOnEbay,
  scoreVsEbay,
  scoreVsTcg,
  type DealSort,
} from "./deals";
import { sourceLabel } from "./stores";

/** What a deal row shows about its unit, and all the client needs (QuickView link, thumb). `id` is the product id; `finish` the unit's finish. */
export interface DealCard {
  id: number;
  slug: string;
  name: string;
  variant: string | null;
  number: string | null;
  setCode: string;
  hasImage: boolean;
  finish: Finish;
}

export interface TcgDealRow {
  card: DealCard;
  buyCents: number;
  buyLabel: string; // the store's name
  buyRetailer: string; // data-retailer
  buyUrl: string; // affiliate-tagged, the listing itself
  isEbay: boolean;
  condition: string | null;
  marketCents: number; // TCGplayer market, converted
  marketUrl: string; // affiliate-tagged TCGplayer product page
  tcgLowCents: number | null; // US only: TCGplayer's own lowest listing, USD
  belowCents: number;
  belowPct: number;
}

export interface EbayDealRow {
  card: DealCard;
  ebayCents: number;
  postageKnown: boolean;
  ebayUrl: string;
  ebayRetailer: string;
  storeCents: number;
  gapCents: number;
}

export interface VsEbayDealRow {
  card: DealCard;
  storeCents: number;
  storeName: string;
  storeRetailer: string;
  storeUrl: string;
  condition: string | null;
  ebayCents: number;
  postageKnown: boolean;
  ebayUrl: string;
  ebayRetailer: string;
  belowCents: number;
  belowPct: number;
}

export interface DealList<T> {
  rows: T[];
  /** the true length of the list the viewer is looking at (a count, not a row) */
  total: number;
  page: number;
  pageCount: number;
  /** false where the view cannot exist (no eBay comparison in this market). */
  available: boolean;
  /** true below full access: the rows are the preview slice of the default view */
  locked?: boolean;
  /** true when a refinement was replaced by the default view (the API answers 402) */
  coerced?: boolean;
}

const unitOf = (uid: number): { id: number; finish: Finish } => ({ id: uid >> 1, finish: uid & 1 ? "F" : "N" });
export const unitUids = (ids: ReadonlySet<number> | null | undefined): Set<number> | undefined => (ids?.size ? new Set([...ids].flatMap((id) => [id * 2, id * 2 + 1])) : undefined);

export function dealCard(c: CardLite, finish: Finish): DealCard {
  return { id: c.id, slug: c.slug, name: c.name, variant: c.label ?? c.variant, number: c.number, setCode: c.setCode, hasImage: c.hasImage, finish };
}

/** The cards of some units, each in the unit's own finish. */
async function cardsOf(uids: readonly number[]): Promise<Map<number, CardLite>> {
  const byFinish = (f: Finish) => [...new Set(uids.filter((u) => (u & 1 ? "F" : "N") === f).map((u) => u >> 1))];
  const [n, f] = await Promise.all([byFinish("N"), byFinish("F")].map((ids, i) => (ids.length ? getCardsByIds(ids, { unit: i === 0 ? "N" : "F" }) : Promise.resolve(new Map<number, CardLite>()))));
  const out = new Map<number, CardLite>();
  for (const [id, c] of n!) out.set(id * 2, c);
  for (const [id, c] of f!) out.set(id * 2 + 1, c);
  return out;
}

const byUid = (rows: DealOfferDetail[]) => new Map(rows.map((r) => [r.uid, r]));
const ebayUrlOf = (url: string, country: Country) => affiliateUrl(url, ebaySourceFor(country) ?? "ebay", DEAL_FINDER_PATH);
const pageCountOf = (total: number, size: number) => Math.max(1, Math.ceil(total / Math.max(1, size)));

/**
 * "Underpriced vs TCGplayer": one page, cut by the loader for `who`. `buy` is the
 * store keys the reader picked (undefined = every store); `onlyIds` ("only my
 * cards", product ids) filters before paging. Below full access the loader serves
 * the default slice and sets `coerced` when the request named anything else.
 */
export async function getTcgDeals(
  country: Country,
  opts: { buy?: string[]; sort: DealSort; page: number; pageSize: number; onlyIds?: ReadonlySet<number> | null },
  who: Entitlement,
): Promise<DealList<TcgDealRow>> {
  const q: Partial<DealQuery> = { sort: opts.sort, page: opts.page, pageSize: opts.pageSize, buyKeys: opts.buy, onlyUids: unitUids(opts.onlyIds) };
  const s = await getDealList(country, q, who);
  const meta = { total: s.total, page: s.page, pageCount: pageCountOf(s.total, s.locked ? s.limit || 1 : opts.pageSize), available: true, locked: s.locked, coerced: s.coerced };
  if (!s.rows.length) return { rows: [], ...meta };
  const [cards, detail] = await Promise.all([cardsOf(s.rows.map((r) => r.uid)), getDealOffers(country, s.rows.map((r) => r.uid)).then(byUid)]);
  const keySet = opts.buy?.length && !s.coerced ? new Set(opts.buy.map((k) => k.replace(/^store:/, ""))) : null;
  const rows = s.rows.flatMap((r): TcgDealRow[] => {
    const c = cards.get(r.uid), d = detail.get(r.uid);
    if (!c || !d) return [];
    const l = cheapestListing(d.stores, keySet);
    if (!l) return [];
    const live = scoreVsTcg(country, l.priceCents, r.marketCents, null);
    if (!live) return [];
    const u = unitOf(r.uid);
    return [{
      card: dealCard(c, u.finish), buyCents: l.priceCents, buyLabel: sourceLabel(l.source, country), buyRetailer: retailerSubId(l.source),
      buyUrl: affiliateUrl(l.url, retailerSubId(l.source), DEAL_FINDER_PATH), isEbay: false, condition: l.condition,
      marketCents: r.marketCents, marketUrl: affiliateUrl(d.tcgplayerUrl, "tcgplayer", DEAL_FINDER_PATH), tcgLowCents: null,
      belowCents: live.belowCents, belowPct: live.belowPct,
    }];
  });
  return { rows, ...meta };
}

/** "Cheapest on eBay": free for everyone, one ranking, paged. eBay rows are Neon rows (display-only), never a file. */
export async function getCheapestOnEbayDeals(country: Country, opts: { page: number; pageSize: number }): Promise<DealList<EbayDealRow>> {
  if (!hasEbayComparison(country)) return { rows: [], total: 0, page: 1, pageCount: 1, available: false };
  const inp = await getEbayDealInputs(country);
  const ranked = rankCheapestOnEbay(country, inp);
  const { slice, total, page, pageCount } = pageRanked(ranked.map((r) => ({ ...r, below: r.gapCents })), { page: opts.page, pageSize: opts.pageSize });
  if (!slice.length) return { rows: [], total, page, pageCount, available: true };
  const uids = slice.map((r) => r.id);
  const [cards, detail] = await Promise.all([cardsOf(uids), getDealOffers(country, uids).then(byUid)]);
  const src = ebaySourceFor(country) ?? "ebay";
  const rows = slice.flatMap((r): EbayDealRow[] => {
    const c = cards.get(r.id), d = detail.get(r.id);
    if (!c || !d) return [];
    const e = [...cheapestEbayByCard(country, d.ebay.map((x) => ({ id: r.id, ...x }))).values()][0];
    const l = cheapestListing(d.stores, null);
    if (!e || !l) return [];
    const live = rankCheapestOnEbay(country, [{ id: r.id, storeMin: l.priceCents, tcgLow: null, ebay: { cents: e.cents, postageKnown: e.postageKnown } }])[0];
    if (!live) return [];
    return [{ card: dealCard(c, unitOf(r.id).finish), ebayCents: live.ebayCents, postageKnown: live.postageKnown, ebayUrl: ebayUrlOf(e.url, country), ebayRetailer: ebayRetailer(src, country), storeCents: live.storeCents, gapCents: live.gapCents }];
  });
  return { rows, total, page, pageCount, available: true };
}

/** "Underpriced vs eBay": a store we track sells for less than the cheapest eBay listing. Gated like the main list; the loader cuts it for `who`. */
export async function getVsEbayDeals(
  country: Country,
  opts: { sort: DealSort; page: number; pageSize: number; onlyIds?: ReadonlySet<number> | null },
  who: Entitlement,
): Promise<DealList<VsEbayDealRow>> {
  if (!hasEbayComparison(country)) return { rows: [], total: 0, page: 1, pageCount: 1, available: false };
  const s = await getVsEbayList(country, { sort: opts.sort, page: opts.page, pageSize: opts.pageSize, onlyUids: unitUids(opts.onlyIds) }, who);
  const meta = { total: s.total, page: s.page, pageCount: pageCountOf(s.total, s.locked ? s.limit || 1 : opts.pageSize), available: true, locked: s.locked, coerced: s.coerced };
  if (!s.rows.length) return { rows: [], ...meta };
  const uids = s.rows.map((r) => r.id);
  const [cards, detail] = await Promise.all([cardsOf(uids), getDealOffers(country, uids).then(byUid)]);
  const src = ebaySourceFor(country) ?? "ebay";
  const rows = s.rows.flatMap((r): VsEbayDealRow[] => {
    const c = cards.get(r.id), d = detail.get(r.id);
    if (!c || !d) return [];
    const e = [...cheapestEbayByCard(country, d.ebay.map((x) => ({ id: r.id, ...x }))).values()][0];
    const l = cheapestListing(d.stores, null);
    if (!e || !l) return [];
    const live = scoreVsEbay(l.priceCents, e.cents);
    if (!live) return [];
    return [{
      card: dealCard(c, unitOf(r.id).finish), storeCents: l.priceCents, storeName: sourceLabel(l.source, country), storeRetailer: retailerSubId(l.source),
      storeUrl: affiliateUrl(l.url, retailerSubId(l.source), DEAL_FINDER_PATH), condition: l.condition, ebayCents: e.cents,
      postageKnown: e.postageKnown, ebayUrl: ebayUrlOf(e.url, country), ebayRetailer: ebayRetailer(src, country),
      belowCents: live.below, belowPct: live.pct,
    }];
  });
  return { rows, ...meta };
}

/** Watched slugs (this browser's list) to product ids; unknown slugs are dropped. */
export async function idsForSlugs(slugs: readonly string[]): Promise<Set<number>> {
  if (!slugs.length) return new Set();
  const found = await getCardLookup({ slugs: slugs.slice(0, 500) });
  return new Set([...found.bySlug.values()].map((c) => c.id));
}
