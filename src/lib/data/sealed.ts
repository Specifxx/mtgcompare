// owner: WP09
// src/lib/data/sealed.ts: the section "sealed.ts" of api.ts (contract 7.12). Sealed products are PUBLISHED FILES (sl/list-<k>, sl/d/<h>, slug/<h>) read through the PlaneSource of the request, pinned to one data commit; no database,
// no unstable_cache (kind P and M of contract 7.5). The names, arguments, result types, cache kinds and tags of api.ts are FROZEN: this module only adds exports.
import { SEALED_KINDS, fold, tcgplayerUrl, type SealedKind } from "../constants";
import { MARKETS, type Country } from "../country";
import { liveOffersFrom } from "../offer-read";
import type { OfferTuple, SealedDetailFile, SealedListFile, SealedRow, SlugShard, StoreRunsFile } from "./plane/formats";
import { SEALED_FLAGS } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { sealedDetailPath, sealedListPath, slugPath } from "./plane/shards";
import type { OfferRow } from "./types";

export interface SealedLite { id: number; slug: string; name: string; setId: number | null; kind: SealedKind; packCount: number | null; releasedOn: string | null; presale: boolean; marketUsd: number | null; lowTcg: number | null; low: Record<Country, number | null>; stores: Record<Country, number>; change7d: number | null }   // imageUrl and tcgplayerUrl are DERIVED from id (images.ts, constants.ts)
export interface SealedDetail extends SealedLite { contents: string | null; offers: OfferRow[] }   // finish is always "N"; offers = store/feed rows + the synthesised TCGplayer row
export interface SealedQuery { kind?: SealedKind; setId?: number; presale?: boolean; q?: string; sort: "value" | "price-asc" | "price-desc" | "newest" | "name"; page: number; per: 24 | 48 | 100 }

const CHUNK_MAX = 16;                                                                                  // sl/list has at most 12 files (FILE_BUDGETS)
const OFFER_CAP = 200;
const KIND_SET = new Set<string>(SEALED_KINDS);
const noneByMarket = <T,>(v: T): Record<Country, T> => Object.fromEntries(MARKETS.map((m) => [m, v])) as Record<Country, T>;

function liteOfRow(r: SealedRow): SealedLite {
  const low = noneByMarket<number | null>(null), stores = noneByMarket(0);
  MARKETS.forEach((m, i) => { low[m] = Array.isArray(r[10]) ? (r[10][i] ?? null) : null; stores[m] = Array.isArray(r[11]) ? (r[11][i] ?? 0) : 0; });
  return { id: r[0], slug: r[1], name: r[2], setId: r[3] || null, kind: (KIND_SET.has(r[4]) ? r[4] : "Other") as SealedKind, packCount: r[5] || null, releasedOn: r[6] || null, presale: (r[7] & SEALED_FLAGS.PRESALE) !== 0, marketUsd: r[8], lowTcg: r[9], low, stores, change7d: r[12] };
}

interface SealedView { rows: SealedLite[]; gone: Set<number>; byId: Map<number, SealedLite> }
/** Every chunk of sl/list, memoised per data commit (M). A GONE row stays in byId (a watch on a retired product keeps resolving) and out of rows. */
function view(): Promise<SealedView> {
  return planeSource().then(({ src, ptr }) => memoByRef("sealed:list", memoKey(ptr), async () => {
    const first = await optionalOf<SealedListFile>(src, sealedListPath(0));
    const rest = first ? await Promise.all(Array.from({ length: Math.max(0, Math.min(first.chunks, CHUNK_MAX) - 1) }, (_, k) => optionalOf<SealedListFile>(src, sealedListPath(k + 1)))) : [];
    const rows: SealedLite[] = [], gone = new Set<number>(), byId = new Map<number, SealedLite>();
    for (const f of [first, ...rest]) for (const r of f?.s ?? []) {
      const lite = liteOfRow(r); byId.set(lite.id, lite);
      if ((r[7] & SEALED_FLAGS.GONE) !== 0) gone.add(lite.id); else rows.push(lite);
    }
    return { rows, gone, byId };
  }));
}

const cmpName = (a: SealedLite, b: SealedLite): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id);
const valueOf = (s: SealedLite): number => s.marketUsd ?? s.lowTcg ?? -1;
export function sortRows(rows: SealedLite[], sort: SealedQuery["sort"]): SealedLite[] {
  const out = [...rows];
  switch (sort) {
    case "price-asc": return out.sort((a, b) => (a.marketUsd == null ? 1 : 0) - (b.marketUsd == null ? 1 : 0) || (a.marketUsd ?? 0) - (b.marketUsd ?? 0) || cmpName(a, b));
    case "price-desc": case "value": return out.sort((a, b) => valueOf(b) - valueOf(a) || cmpName(a, b));
    case "newest": return out.sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || cmpName(a, b));
    default: return out.sort(cmpName);
  }
}

/** P sl/list-<k> (2 chunks, 330 KB each) filtered in memory (M). Sealed rows never carry a price-less sort surprise: unpriced products sort last. */
export async function getSealedPage(q: Partial<SealedQuery>): Promise<{ total: number; pages: number; page: number; items: SealedLite[] }> {
  const { rows } = await view(), needle = fold(q.q).slice(0, 60);
  const per = ([24, 48, 100] as const).find((p) => p >= Number(q.per)) ?? (Number.isFinite(Number(q.per)) && q.per ? 100 : 48);
  const hit = rows.filter((s) => (!q.kind || s.kind === q.kind) && (q.setId == null || s.setId === q.setId) && (q.presale == null || s.presale === q.presale) && (!needle || fold(s.name).includes(needle)));
  const sorted = sortRows(hit, q.sort ?? "value"), pages = Math.max(1, Math.ceil(sorted.length / per)), page = Math.min(pages, Math.max(1, Math.floor(Number(q.page)) || 1));
  return { total: sorted.length, pages, page, items: sorted.slice((page - 1) * per, page * per) };
}

const kindRank = (k: SealedKind): number => (k === "Booster Box" ? 0 : k === "Booster Pack" ? 1 : k === "Case" ? 99 : 2 + SEALED_KINDS.indexOf(k));
/** <= 200 rows, the booster box first and cases last (Secret Lair Drop has 1,077 products: 200 and the page's total comes from getSealedPage). */
export async function getSealedBySet(setId: number): Promise<SealedLite[]> {
  const { rows } = await view();
  return rows.filter((s) => s.setId === setId).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || valueOf(b) - valueOf(a) || cmpName(a, b)).slice(0, 200);
}

export async function getSealedByIds(ids: readonly number[]): Promise<Map<number, SealedLite>> {
  const { byId } = await view(), out = new Map<number, SealedLite>();
  for (const id of ids) { const s = byId.get(id); if (s) out.set(id, s); }
  return out;
}

const RUNS = "ss/runs.json";
/** P slug/<h> (sealed part) -> sl/d/<fnv1a32(slug) % 64>.json (+ the list row, M, and ss/runs.json). Offers: the live-offer rule of offer-read.ts, one implementation, and the synthesised TCGplayer row. null for an unknown slug; a GONE product still opens. */
export async function getSealedDetail(slug: string): Promise<SealedDetail | null> {
  const s = String(slug ?? "").trim(); if (!s || s.length > 200) return null;
  const { src, ptr } = await planeSource();
  const shard = await optionalOf<SlugShard>(src, slugPath(s)), id = shard?.z.find((e) => e[0] === s)?.[1]; if (id === undefined) return null;
  const [v, det, runs] = await Promise.all([view(), optionalOf<SealedDetailFile>(src, sealedDetailPath(s)), optionalOf<StoreRunsFile>(src, RUNS)]);
  const lite = v.byId.get(id); if (!lite) return null;
  const p = det?.p.find((e) => e[1] === s);
  const tuples: OfferTuple[] = (p?.[2] ?? []).map((t) => [id * 2, t[0], t[1], t[2], t[3], t[4], t[5]]);
  const live = liveOffersFrom([{ id, finish: "N" }], tuples, new Map(), runs, {});
  const offers: OfferRow[] = live.map((l) => ({ finish: "N", storeId: l.storeId, source: l.source, market: l.market, priceCents: l.priceCents, currency: l.currency, url: l.url, inStock: l.inStock, condition: l.condition, shippingCents: null, updatedAt: l.refreshedAt.toISOString() }));
  if (lite.lowTcg != null) offers.push({ finish: "N", storeId: 0, source: "tcgplayer", market: "US", priceCents: lite.lowTcg, currency: "USD", url: tcgplayerUrl(id, "N"), inStock: true, condition: null, shippingCents: null, updatedAt: ptr.publishedAt });
  const contents = p && typeof p[3] === "string" && p[3] ? p[3] : null;
  return { ...lite, contents, offers: offers.slice(0, OFFER_CAP) };
}

/** P sl/list: GONE and no in-stock offer, per market. */
export async function getSealedSoldOut(): Promise<Record<Country, number[]>> {
  const { byId, gone } = await view(), out = noneByMarket<number[]>([]);
  for (const m of MARKETS) out[m] = [];
  for (const id of gone) { const s = byId.get(id); if (!s) continue; for (const m of MARKETS) if (s.low[m] == null) out[m].push(id); }
  return out;
}

/** Every sealed product that is not GONE, from the memoised list (M): the page filters it in memory by the visitor's market (lib/sealed-query.ts). About 3,700 rows. */
export async function getSealedAll(): Promise<SealedLite[]> { return [...(await view()).rows]; }
