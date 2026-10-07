// Deal Finder's three lists, assembled for a page (server only): the pure
// rankings in lib/deals.ts over the self-cached loaders in lib/data.ts, plus
// the live listings for the ≤ 25 cards on the page being shown.
//
// NO CACHE HERE, deliberately — every input caches itself (getDealInputs,
// getStoreMins, getDealOffers, getCatalog), and Next bypasses an inner
// unstable_cache called from inside an outer one. Never wrap these functions
// in a cache, and never call them from inside one (tests/nested-cache.test.ts).
//
// Every price shown beside a link is THAT listing's own live price: the ranking
// comes from the cached aggregate, the row from the live listing, re-scored with
// the same predicate and dropped if it no longer qualifies — never a cached
// price beside another store's link (RiftCompare's rule).
import { affiliateUrl } from "./affiliate";
import { ebayRetailer, retailerSubId } from "./board";
import type { Country } from "./country";
import { getCatalog, getDealInputs, getDealOffers, getStoreMins, type Catalog, type CardLite, type DealOfferDetail } from "./data";
import { DEAL_FINDER_PATH } from "./deal-finder-href";
import {
  cheapestEbayByCard,
  cheapestListing,
  decodeDealInputs,
  ebayBuyLabel,
  ebaySourceFor,
  hasEbayComparison,
  pageRanked,
  rankCheapestOnEbay,
  rankUnderpricedVsEbay,
  rankVsTcgplayer,
  scoreVsEbay,
  scoreVsTcg,
  splitBuyKeys,
  defaultBuyKeys,
  type DealInput,
  type DealSort,
  type TcgRanked,
} from "./deals";
import { sourceLabel } from "./stores";

/** What a deal row shows about its card — and all the client needs (QuickView link, thumb). */
export interface DealCard {
  id: number;
  slug: string;
  name: string;
  variant: string | null;
  number: string | null;
  setCode: string;
  hasImage: boolean;
}

export interface TcgDealRow {
  card: DealCard;
  buyCents: number;
  buyLabel: string; // the store's name, or "eBay (delivered)" / "eBay + postage"
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
  total: number;
  page: number;
  pageCount: number;
  /** false where the view cannot exist (no eBay comparison in this market). */
  available: boolean;
}

export function dealCard(cat: Catalog, c: CardLite): DealCard {
  return { id: c.id, slug: c.slug, name: c.name, variant: c.variant, number: c.number, setCode: cat.setById.get(c.setId)?.code ?? "", hasImage: c.hasImage };
}

async function inputs(country: Country): Promise<{ cat: Catalog; inputs: DealInput[] }> {
  const [cat, tuples] = await Promise.all([getCatalog(), getDealInputs(country)]);
  return { cat, inputs: decodeDealInputs(tuples) };
}

const marketOf = (cat: Catalog) => (id: number) => cat.byId.get(id)?.marketUsd ?? null;

/** The default "Underpriced vs TCGplayer" ranking (every store + eBay), whole. Homepage, proof line, counts. */
export async function rankDefaultVsTcg(country: Country, sort: DealSort = "saving"): Promise<{ cat: Catalog; ranked: TcgRanked[] }> {
  const { cat, inputs: inp } = await inputs(country);
  const { ebay } = splitBuyKeys(country, defaultBuyKeys(country));
  return { cat, ranked: rankVsTcgplayer(country, inp, marketOf(cat), { sort, ebay }) };
}

const byIdMap = (rows: DealOfferDetail[]) => new Map(rows.map((r) => [r.id, r]));
const ebayUrlOf = (url: string, country: Country) => affiliateUrl(url, ebaySourceFor(country) ?? "ebay", DEAL_FINDER_PATH);

/**
 * "Underpriced vs TCGplayer": one page. `buy` is already resolved
 * (resolveBuyKeys); `onlyIds` ("only my cards") filters before paging.
 */
export async function getTcgDeals(
  country: Country,
  opts: { buy: string[]; sort: DealSort; page: number; pageSize: number; onlyIds?: ReadonlySet<number> | null },
): Promise<DealList<TcgDealRow>> {
  const empty = { rows: [], total: 0, page: 1, pageCount: 1, available: true };
  if (!opts.buy.length) return empty;
  const { storeKeys, ebay, allStores } = splitBuyKeys(country, opts.buy);
  const [{ cat, inputs: inp }, mins] = await Promise.all([
    inputs(country),
    allStores ? Promise.resolve(null) : getStoreMins(country, storeKeys),
  ]);
  const storeMin = mins ? new Map(mins) : null;
  const ranked = rankVsTcgplayer(country, inp, marketOf(cat), { sort: opts.sort, ebay, storeMin });
  const { slice, total, page, pageCount } = pageRanked(ranked, { page: opts.page, pageSize: opts.pageSize, onlyIds: opts.onlyIds });
  if (!slice.length) return { rows: [], total, page, pageCount, available: true };
  const detail = byIdMap(await getDealOffers(country, slice.map((r) => r.id)));
  const keySet = allStores ? null : new Set(storeKeys);
  const rows = slice.flatMap((r): TcgDealRow[] => {
    const c = cat.byId.get(r.id);
    const d = detail.get(r.id);
    if (!c || !d) return [];
    const marketUrl = affiliateUrl(d.tcgplayerUrl, "tcgplayer", DEAL_FINDER_PATH);
    const tcgLowCents = country === "US" ? r.low : null;
    if (r.buyIsEbay) {
      const e = cheapestEbayByCard(country, d.ebay).get(r.id);
      if (!e) return [];
      const live = scoreVsTcg(country, e.cents, r.market, r.low);
      if (!live) return [];
      const src = ebaySourceFor(country) ?? "ebay";
      return [{
        card: dealCard(cat, c), buyCents: e.cents, buyLabel: ebayBuyLabel(country, e.postageKnown), buyRetailer: ebayRetailer(src, country),
        buyUrl: ebayUrlOf(e.url, country), isEbay: true, condition: null, marketCents: r.market, marketUrl, tcgLowCents,
        belowCents: live.belowCents, belowPct: live.belowPct,
      }];
    }
    const l = cheapestListing(d.stores, keySet);
    if (!l) return [];
    const live = scoreVsTcg(country, l.priceCents, r.market, r.low);
    if (!live) return [];
    return [{
      card: dealCard(cat, c), buyCents: l.priceCents, buyLabel: sourceLabel(l.source, country), buyRetailer: retailerSubId(l.source),
      buyUrl: affiliateUrl(l.url, retailerSubId(l.source), DEAL_FINDER_PATH), isEbay: false, condition: l.condition,
      marketCents: r.market, marketUrl, tcgLowCents, belowCents: live.belowCents, belowPct: live.belowPct,
    }];
  });
  return { rows, total, page, pageCount, available: true };
}

/** "Cheapest on eBay": free, one ranking, paged. */
export async function getCheapestOnEbayDeals(country: Country, opts: { page: number; pageSize: number }): Promise<DealList<EbayDealRow>> {
  if (!hasEbayComparison(country)) return { rows: [], total: 0, page: 1, pageCount: 1, available: false };
  const { cat, inputs: inp } = await inputs(country);
  const ranked = rankCheapestOnEbay(country, inp);
  const lowById = new Map(inp.map((i) => [i.id, i.tcgLow]));
  const { slice, total, page, pageCount } = pageRanked(
    ranked.map((r) => ({ ...r, below: r.gapCents })),
    { page: opts.page, pageSize: opts.pageSize },
  );
  if (!slice.length) return { rows: [], total, page, pageCount, available: true };
  const detail = byIdMap(await getDealOffers(country, slice.map((r) => r.id)));
  const src = ebaySourceFor(country) ?? "ebay";
  const rows = slice.flatMap((r): EbayDealRow[] => {
    const c = cat.byId.get(r.id);
    const d = detail.get(r.id);
    if (!c || !d) return [];
    const e = cheapestEbayByCard(country, d.ebay).get(r.id);
    const l = cheapestListing(d.stores, null);
    if (!e || !l) return [];
    // Re-scored on the live figures with the same rule.
    const live = rankCheapestOnEbay(country, [{ id: r.id, storeMin: l.priceCents, tcgLow: lowById.get(r.id) ?? null, ebay: { cents: e.cents, postageKnown: e.postageKnown } }])[0];
    if (!live) return [];
    return [{
      card: dealCard(cat, c), ebayCents: live.ebayCents, postageKnown: live.postageKnown, ebayUrl: ebayUrlOf(e.url, country),
      ebayRetailer: ebayRetailer(src, country), storeCents: live.storeCents, gapCents: live.gapCents,
    }];
  });
  return { rows, total, page, pageCount, available: true };
}

/** "Underpriced vs eBay": a store we track sells for less than the cheapest eBay listing. */
export async function getVsEbayDeals(
  country: Country,
  opts: { sort: DealSort; page: number; pageSize: number; onlyIds?: ReadonlySet<number> | null },
): Promise<DealList<VsEbayDealRow>> {
  if (!hasEbayComparison(country)) return { rows: [], total: 0, page: 1, pageCount: 1, available: false };
  const { cat, inputs: inp } = await inputs(country);
  const ranked = rankUnderpricedVsEbay(country, inp, opts.sort);
  const { slice, total, page, pageCount } = pageRanked(ranked, { page: opts.page, pageSize: opts.pageSize, onlyIds: opts.onlyIds });
  if (!slice.length) return { rows: [], total, page, pageCount, available: true };
  const detail = byIdMap(await getDealOffers(country, slice.map((r) => r.id)));
  const src = ebaySourceFor(country) ?? "ebay";
  const rows = slice.flatMap((r): VsEbayDealRow[] => {
    const c = cat.byId.get(r.id);
    const d = detail.get(r.id);
    if (!c || !d) return [];
    const e = cheapestEbayByCard(country, d.ebay).get(r.id);
    const l = cheapestListing(d.stores, null);
    if (!e || !l) return [];
    const live = scoreVsEbay(l.priceCents, e.cents);
    if (!live) return [];
    return [{
      card: dealCard(cat, c), storeCents: l.priceCents, storeName: sourceLabel(l.source, country), storeRetailer: retailerSubId(l.source),
      storeUrl: affiliateUrl(l.url, retailerSubId(l.source), DEAL_FINDER_PATH), condition: l.condition, ebayCents: e.cents,
      postageKnown: e.postageKnown, ebayUrl: ebayUrlOf(e.url, country), ebayRetailer: ebayRetailer(src, country),
      belowCents: live.below, belowPct: live.pct,
    }];
  });
  return { rows, total, page, pageCount, available: true };
}

/** Watched slugs → card ids (cards only; unknown slugs dropped). */
export async function idsForSlugs(slugs: readonly string[]): Promise<Set<number>> {
  const cat = await getCatalog();
  const out = new Set<number>();
  for (const s of slugs) {
    const c = cat.bySlug.get(s);
    if (c) out.add(c.id);
  }
  return out;
}
