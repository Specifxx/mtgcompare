// owner: WP13
// src/lib/data/deals.ts: the section "deals.ts" of api.ts (contract 7.12): Deal Finder, the offers behind a page of it, and the listings Best Basket prices. The names, arguments, result types, cache kinds and tags are FROZEN; this module only adds exports.
// PAID LOADERS: getDealList reads `who` through accessOf(feature, who) / viewerOf(who) (plane/entitlement.ts), computes the ranking tier-neutral and cuts it with sliceRanking(feature, who, ranking, q); nothing here compares a tier (premium-gates.ts).
// The one unstable_cache is the ranking itself (R, key [deal-rank-v1, ref, country, sort, buyKeysHash], tag RANK_TAG): its callback is pure CPU over data resolved BEFORE the closure. eBay is never in that list; the two eBay views read the Neon table EbayBest
// through a short process memo (display-only rows, never a file, never ranked into a price).
import { unstable_cache } from "next/cache";
import { MARKETS, type Country } from "../country";
import { CONDITIONS, tcgplayerUrl, type Condition, type Finish } from "../constants";
import { EBAY_FEED, rankUnderpricedVsEbay, scoreVsTcg, sortRanked, type DealInput, type VsEbayRanked } from "../deals";
import { usdCentsToCountry } from "../fx";
import { itemUrl } from "../listing-panel";
import { readLiveOffers } from "../offer-read";
import { STORE_BY_KEY, sourceOfStoreId, storesIn } from "../stores";
import { RANK_TAG, TTL, getDataRef } from "./core";
import { getBrowseIndex } from "./catalog";
import { accessOf, buyKeysHash, coerceDealQuery, rankKey, sliceRanking, DEAL_RANK_MAX_ROWS, type DealQuery, type Entitlement, type Sliced } from "./plane/entitlement";
import type { HomeFile, IxF } from "./plane/formats";
import { memoByRef, memoKey, planeJson, planeSource } from "./plane/runtime";
import { ixPath } from "./plane/shards";
import { PlaneError } from "./plane/source";
import type { BrowseIndex } from "./plane/browse-index";

export const BASKET_ID_CHUNK: 40 = 40;
export interface DealRow { uid: number; buyCents: number; marketCents: number; belowCents: number; belowPct: number; storeId: number; source: string; market: Country }
/** [uid, buyCents, marketCents, belowCents, belowPct, storeId]: a ranking is held as tuples (about 35 bytes a row, at most DEAL_RANK_MAX_ROWS). storeId is 0 when the buy side is "every store" (the index holds the cheapest price, not whose it is; the page's live offers name the store). */
export type RankTuple = [uid: number, buy: number, market: number, below: number, pct: number, storeId: number];

const marketIndex = (c: Country): number => Math.max(0, MARKETS.indexOf(c));

/** ix/f of the ref, by market then unit: [store, price][]. null when the family does not exist yet (before the first store stage). Built once per ref (M). */
type FlatOffers = Map<number, Map<number, [store: number, price: number][]>>;
function flatOffersOf(ref: string, src: { json<T>(rel: string): Promise<T> }): Promise<FlatOffers | null> {
  return memoByRef("deal-flat", ref, async () => {
    const out: FlatOffers = new Map(); let any = false;
    for (let n = 0; n < 64; n++) {
      let f: IxF;
      try { f = await src.json<IxF>(ixPath("f", n)); } catch (e) { if (e instanceof PlaneError && e.reason === "missing") break; throw e; }
      any = true;
      for (let r = 0; r < f.n; r++) {
        const m = f.mk.charCodeAt(r) - 48; let byUid = out.get(m); if (!byUid) out.set(m, (byUid = new Map()));
        const arr = byUid.get(f.uid[r]!); if (arr) arr.push([f.st[r]!, f.pr[r]!]); else byUid.set(f.uid[r]!, [[f.st[r]!, f.pr[r]!]]);
      }
    }
    return any ? out : null;
  });
}

/** Pure: the FULL ranking of one market from the index columns. `storeIds` null = every store (the index's cheapest store price); a set = the cheapest price among those stores, from the flat offers. */
export function rankFromIndex(ix: BrowseIndex, country: Country, sort: DealQuery["sort"], storeIds: ReadonlySet<number> | null, flat: Map<number, [number, number][]> | null): RankTuple[] {
  const m = marketIndex(country), rows: { t: RankTuple; id: number; below: number; pct: number }[] = [];
  for (let i = 0; i < ix.n; i++) {
    if (ix.cls[i] !== 0) continue;
    for (let fi = 0 as 0 | 1; fi < 2; fi++) {
      const usd = ix.market(i, fi); if (usd <= 0) continue;
      const uid = ix.id[i]! * 2 + fi; let buy = -1, store = 0;
      if (!storeIds) buy = ix.smin[(i * 2 + fi) * 6 + m]!;
      else for (const [st, pr] of flat?.get(uid) ?? []) if (storeIds.has(st) && (buy < 0 || pr < buy)) { buy = pr; store = st; }
      if (buy < 0) continue;
      const low = fi === 0 ? ix.ln[i]! : ix.lf[i]!, market = usdCentsToCountry(usd, country);
      const s = scoreVsTcg(country, buy, market, low >= 0 ? low : null); if (!s) continue;
      rows.push({ t: [uid, buy, market, s.belowCents, s.belowPct, store], id: uid, below: s.belowCents, pct: s.belowPct });
    }
  }
  return sortRanked(rows, sort).slice(0, DEAL_RANK_MAX_ROWS).map((r) => r.t);
}

/** The store ids a buy side names, or null for "every store of the market". Keys that are not stores (eBay, junk) are dropped: eBay is never on this list. */
function storeIdsOf(country: Country, keys: readonly string[] | undefined): Set<number> | null {
  if (!keys?.length) return null;
  const ids = new Set<number>(); for (const k of keys) { const s = STORE_BY_KEY[k.replace(/^store:/, "")]; if (s) ids.add(s.id); }
  const all = storesIn(country); if (all.length && all.every((s) => ids.has(s.id))) return null;
  return ids;
}

async function rankingOf(country: Country, sort: DealQuery["sort"], buyKeys: readonly string[] | undefined): Promise<RankTuple[]> {
  const ptr = await getDataRef(); if (!ptr) throw new PlaneError("latest.json", "http", "no pointer");
  const ix = await getBrowseIndex({ withStores: true, withOracle: false }), ids = storeIdsOf(country, buyKeys);
  const flat = ids ? ((await flatOffersOf(memoKey(ptr), (await planeSource()).src))?.get(marketIndex(country)) ?? null) : null;
  const keys = ids ? [...ids].map((n) => `s${n}`) : undefined;
  return unstable_cache(async () => rankFromIndex(ix, country, sort, ids, flat), rankKey("deal-rank-v1", ptr.ref, country, sort, buyKeysHash(keys)), { tags: [RANK_TAG], revalidate: TTL.day })();
}

const rowOf = (country: Country) => (t: RankTuple): DealRow => ({ uid: t[0], buyCents: t[1], marketCents: t[2], belowCents: t[3], belowPct: t[4], storeId: t[5], source: sourceOfStoreId(t[5]) ?? "", market: country });

/** Pure: the cut of a FULL ranking for `who` (tests drive it with a ranking built by rankFromIndex). The query is coerced first, "only my cards" filters BEFORE paging, then sliceRanking applies the gate once. */
export function cutDealList(country: Country, ranking: readonly RankTuple[], q: Partial<DealQuery>, who: Entitlement): Sliced<DealRow> {
  const { q: nq } = coerceDealQuery(accessOf("deal-finder", who), q);
  let list = ranking;
  if (nq.onlyUids) { const only = nq.onlyUids; list = list.filter((t) => only.has(t[0])); }
  const s = sliceRanking("deal-finder", who, list, q);
  return { ...s, rows: s.rows.map(rowOf(country)) };
}

/** The Deal Finder list. Signed out: no row (the real total only); a free account: the first rows of the DEFAULT ranking; Plus and Premium: the page asked for, with the store picker, sort and "only my cards" (onlyUids). Below full access every refinement is coerced to the default BEFORE the ranking is read. */
export async function getDealList(country: Country, q: Partial<DealQuery>, who: Entitlement): Promise<Sliced<DealRow>> {
  const access = accessOf("deal-finder", who), { q: nq } = coerceDealQuery(access, q);
  if (access === "none") { const s = sliceRanking<RankTuple>("deal-finder", who, [], q); return { ...s, rows: [], total: await getDealCount(country).catch(() => 0) }; }
  return cutDealList(country, await rankingOf(country, nq.sort, nq.buyKeys), q, who);
}

/** The 1-based position of each given unit in the DEFAULT ranking (default store set, sort "saving"); a unit that is not on the list is absent. Returns positions of the caller's own ids, never a row, a price or a gap
 *  (REQ-WP18-1): premium-nudge.ts folds them into counts. Tier-neutral, so it takes no `who`. At most WATCH_LIST_CAP * 2 uids. */
export async function getDealRanksOf(country: Country, uids: readonly number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>(); if (!uids.length) return out;
  const want = new Set(uids), ranking = await rankingOf(country, "saving", undefined);
  for (let i = 0; i < ranking.length && out.size < want.size; i++) if (want.has(ranking[i]![0])) out.set(ranking[i]![0], i + 1);
  return out;
}

/** Free: the number only (the home page, the upsell line), from hm/home.json. */
export async function getDealCount(country: Country): Promise<number> {
  const h = await planeJson<HomeFile>("hm/home.json"); return h.dealCounts[marketIndex(country)] ?? 0;
}

export interface DealOfferDetail { uid: number; stores: { storeId: number; source: string; priceCents: number; url: string; condition: Condition | null }[]; ebay: { priceCents: number; shippingCents: number | null; url: string; checkedAt: string }[]; tcgplayerUrl: string }

// eBay rows of one market from EbayBest (Neon), memoised for five minutes per process: a display-only block, never a file. A failed read is "no rows", not an error.
export interface EbayBestRow { uid: number; priceCents: number; shippingCents: number | null; url: string; checkedAt: string }
const EBAY_MEMO_MS = 300_000, ebayMemo = new Map<string, { at: number; rows: EbayBestRow[] }>();
export async function getEbayBestRows(country: Country): Promise<EbayBestRow[]> {
  const hit = ebayMemo.get(country); if (hit && Date.now() - hit.at < EBAY_MEMO_MS) return hit.rows;
  let rows: EbayBestRow[] = [];
  try {
    const { prisma } = await import("../db");
    const found = await prisma.ebayBest.findMany({ where: { market: marketIndex(country), checkedAt: { gt: new Date(Date.now() - 72 * 3_600_000) } }, select: { productId: true, finish: true, priceCents: true, shipCents: true, itemId: true, checkedAt: true } });
    rows = found.map((r) => ({ uid: r.productId * 2 + r.finish, priceCents: r.priceCents, shippingCents: r.shipCents, url: itemUrl(country, r.itemId), checkedAt: r.checkedAt.toISOString() }));
  } catch { rows = []; }
  ebayMemo.set(country, { at: Date.now(), rows }); return rows;
}

/** The live store offers (and eBay, when Neon answers) of at most 25 units: the rows a page of the list shows. */
export async function getDealOffers(country: Country, uids: readonly number[]): Promise<DealOfferDetail[]> {
  const want = [...new Set(uids)].slice(0, 25); if (!want.length) return [];
  const { src } = await planeSource();
  const live = await readLiveOffers(src, { units: want.map((u) => ({ id: u >> 1, finish: (u & 1 ? "F" : "N") as Finish })), market: country });
  const ebay = await getEbayBestRows(country);
  return want.map((uid) => ({
    uid,
    stores: live.filter((o) => o.productId * 2 + (o.finish === "F" ? 1 : 0) === uid && o.inStock && o.source !== "tcgplayer").sort((a, b) => a.priceCents - b.priceCents).map((o) => ({ storeId: o.storeId, source: o.source, priceCents: o.priceCents, url: o.url, condition: o.condition })),
    ebay: ebay.filter((e) => e.uid === uid).map(({ priceCents, shippingCents, url, checkedAt }) => ({ priceCents, shippingCents, url, checkedAt })),
    tcgplayerUrl: tcgplayerUrl(uid >> 1, uid & 1 ? "F" : "N"),
  }));
}

export type BasketListingTuple = [uid: number, source: string, priceCents: number, condition: number | null, url: string];
/** The cheapest 60 live listings per unit for at most 40 units: the stores plus, in the US, TCGplayer's own lowest listing (a buyable price); never eBay. In the market's currency. */
export async function getBasketListings(country: Country, uids: readonly number[]): Promise<BasketListingTuple[]> {
  const want = [...new Set(uids)].slice(0, BASKET_ID_CHUNK); if (!want.length) return [];
  const { src } = await planeSource();
  const live = await readLiveOffers(src, { units: want.map((u) => ({ id: u >> 1, finish: (u & 1 ? "F" : "N") as Finish })), market: country, includeTcgplayer: true });
  const by = new Map<number, BasketListingTuple[]>();
  for (const o of live) {
    if (!o.inStock) continue;
    const uid = o.productId * 2 + (o.finish === "F" ? 1 : 0), ci = o.condition ? CONDITIONS.indexOf(o.condition) : -1;
    const arr = by.get(uid) ?? []; arr.push([uid, o.source, o.priceCents, ci < 0 ? null : ci, o.url]); by.set(uid, arr);
  }
  return [...by.values()].flatMap((arr) => arr.sort((a, b) => a[2] - b[2]).slice(0, 60));
}

/** The inputs of the two eBay views: every unit with a fresh EbayBest row, joined to the index's cheapest STORE price (market currency) and, in the US, TCGplayer's own low. `id` is the UNIT (productId * 2 + finish). Canada's rows are US listings with unquoted postage: never "known". */
export async function getEbayDealInputs(country: Country): Promise<DealInput[]> {
  const rows = await getEbayBestRows(country); if (!rows.length) return [];
  const ix = await getBrowseIndex({ withStores: true, withOracle: false }), m = marketIndex(country), cross = EBAY_FEED[country] === "cross-border";
  return rows.flatMap((r): DealInput[] => {
    const i = ix.rowOf(r.uid >> 1); if (i < 0) return [];
    const fi = r.uid & 1, smin = ix.smin[(i * 2 + fi) * 6 + m]!, low = fi === 0 ? ix.ln[i]! : ix.lf[i]!, known = !cross && r.shippingCents != null;
    return [{ id: r.uid, storeMin: smin >= 0 ? smin : null, tcgLow: country === "US" && low >= 0 ? low : null, ebay: { cents: r.priceCents + (known ? r.shippingCents! : 0), postageKnown: known } }];
  });
}

/** "Underpriced vs eBay": a store sells a unit for less than its cheapest eBay listing. Gated like the main list (Plus and Premium; a free account the top rows of the default view); the ranking is computed per request from EbayBest and the index, never published. */
export async function getVsEbayList(country: Country, q: Partial<DealQuery>, who: Entitlement): Promise<Sliced<VsEbayRanked>> {
  const access = accessOf("deal-finder", who), { q: nq } = coerceDealQuery(access, q);
  let ranked = rankUnderpricedVsEbay(country, await getEbayDealInputs(country), nq.sort);
  if (nq.onlyUids) { const only = nq.onlyUids; ranked = ranked.filter((r) => only.has(r.id)); }
  return sliceRanking("deal-finder", who, ranked, q);
}
