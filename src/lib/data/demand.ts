// owner: WP07
// src/lib/data/demand.ts: the section "demand.ts" of api.ts (contract 7.12 and 14). The two PAID analytics of MTG Compare that are built from the private demand counters: Demand Finder and Rising Cards (Premium), plus the clear preview slices a free viewer sees.
// PAID LOADERS: the body reads `who` through accessOf(feature, who) / viewerOf(who) (plane/entitlement.ts), computes the ranking tier-neutral and cuts it with sliceRanking(feature, who, ranking, q); it never compares a tier itself (premium-gates.ts). tests/plane-no-premium.test.ts scans this file for those names.
// The names, arguments, result types, cache kinds and tags are FROZEN (contract 7.12): this module only adds exports.
//
// NOTHING PAID IS A FILE. The counters (CardStat) and their daily snapshots (DemandDay) stay in Neon. The full lists are computed per request from them and from PUBLISHED columns (the browse index, hist/w), cached TIER-NEUTRAL under keys that carry the data commit
// (`demand-v1`, `rise-v1`; the cache never sees who is asking) and cut here, in the loader, once, AFTER the viewer is looked at: below full access the ranking is not even read, the free viewer gets the clear preview slice (pv/demand.json: the top 10 searched over 7 days;
// pv/rising.json: the top 3 picks per scope) and never a row more. A cache callback only queries Neon or computes over data resolved before the closure (tests/nested-cache.test.ts).
import { unstable_cache } from "next/cache";
import type { Access } from "../premium-gates";
import { gate } from "../premium-gates";
import { FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "../tier-limits";
import { imageFor } from "../images";
import { finishPrice } from "../price";
import { DEMAND_WINDOWS, type DemandWindowDays } from "../demand-view";
import { DEMAND_DAY_CARDS, buildDemandDay, dayMinus, demandAsOf, demandWindowOrThrow, utcDayKey, type DemandDayFile, type DemandWindowResult } from "../demand-snapshot";
import { chartMovement, compareDemand, type Movement } from "../demand-movement";
import { VELOCITY_DAYS, WEEK_AGO_DAYS, assembleRisingCards, emptyAnalysis, riseInputsFor, weekAgoRanks, weeklyPoints, type DemandWeekAgo, type RiseAnalysis, type RiseHistory, type RiseScope, type UniverseCard, type WeekAgoRanking } from "../rise-predictor";
import type { RisingSnapshotData } from "../rising-snapshot";
import { prismaDemandStore, type DemandStore } from "../tools-history";
import { getBrowseIndex, getCardsByIds } from "./catalog";
import { RANK_TAG, TTL, getDataRef } from "./core";
import type { BrowseIndex } from "./plane/browse-index";
import { DEMAND_RANK_MAX_ROWS, RISE_RANK_MAX_ROWS, accessOf, rankKey, sliceRanking, viewerOf, type Entitlement } from "./plane/entitlement";
import type { DemandPreviewFile, RisingPreviewFile, WeeklyFile } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { weeklyPath } from "./plane/shards";
import type { CardLite } from "./types";

export interface DemandPick { card: CardLite & { setCode: string }; searches: number; views: number; move: Movement | null }
export interface DemandResult {
  bySearch: DemandPick[]; byView: DemandPick[]; windowUsable: boolean; coveredDays: number | null; totalDays: number; failed?: boolean; previous: { startDay: string; endDay: string; coveredDays: number } | null;
  access: Access; locked: boolean; limit: number;                            // below full: the 7-day top-10-by-search preview (pv/demand.json) for everyone, byView empty, other windows empty
}
export interface RisePreviewRow { id: number; slug: string; name: string; reason: string }
export type RiseResult =
  | { access: "full"; locked: false; limit: number; failed: boolean; analysis: RiseAnalysis }
  | { access: "preview" | "none"; locked: true; limit: number; failed: boolean; preview: RisePreviewRow[] };            // below full there is no `analysis` property to read: the type itself is the gate (pv/rising.json, <= 3 rows per scope)

const DEEP = Math.min(100, DEMAND_RANK_MAX_ROWS);                            // rows a cached demand list keeps (the full list shows 25; the ceiling is DEMAND_RANK_MAX_ROWS)
const CANDIDATES = 1500;                                                     // the most searched cards Rising Cards ranks from (a scope keeps the SCAN of them that are priced there)
const emptyDemand = (access: Access, locked: boolean, limit: number, failed = false): DemandResult => ({ bySearch: [], byView: [], windowUsable: false, coveredDays: null, totalDays: 0, ...(failed ? { failed: true } : {}), previous: null, access, locked, limit });

// ── Demand Finder ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One card of a demand list before it is hydrated: its totals inside the window and its chart movement against the period before. */
export interface DemandRankRow { cardId: number; searches: number; views: number; move: Movement | null }
/** The tier-neutral ranking of one window: both lists, deepest first, and the coverage the numbers really have. This is what the `demand-v1` cache holds. */
export interface DemandRanking { bySearch: DemandRankRow[]; byView: DemandRankRow[]; windowUsable: boolean; coveredDays: number | null; totalDays: number; previous: DemandResult["previous"] }

/** PURE: the lists of a window result, ranked (ties by the other metric, then id) with movement against the equal period before it. Rows with no activity on a metric are not on that chart. */
export function rankDemandWindow(w: DemandWindowResult): DemandRanking {
  const lists = (metric: "searches" | "views"): DemandRankRow[] => {
    const top = w.rows.filter((r) => r[metric] > 0).sort(compareDemand(metric)).slice(0, DEEP), moves = w.previous ? chartMovement(top.map((r) => r.cardId), w.previous.rows, metric) : null;
    return top.map((r) => ({ cardId: r.cardId, searches: r.searches, views: r.views, move: moves?.get(r.cardId) ?? null }));
  };
  const usable = w.baselineDay != null && w.rows.length > 0;
  return {
    bySearch: lists("searches"), byView: lists("views"), windowUsable: usable, coveredDays: w.coveredDays, totalDays: w.totalDays,
    previous: w.previous ? { startDay: w.previous.startDay, endDay: w.previous.endDay, coveredDays: w.previous.coveredDays } : null,
  };
}

/**
 * PURE: what a viewer may have of a demand ranking. Full access (Premium and admins): both lists to PREMIUM_DEMAND_ROWS. Below it (signed out, a free account, Plus): the most-searched list to the strip's size and NEVER the most-viewed list or a view count.
 * Every cut goes through sliceRanking, so premium-gates.ts is the only place a row count is decided. `limit` can only lower the count.
 */
export function cutDemandRanking(who: Entitlement, ranking: DemandRanking, limit?: number): { bySearch: DemandRankRow[]; byView: DemandRankRow[]; access: Access; locked: boolean; limit: number } {
  const access = accessOf("demand", who), search = sliceRanking("demand", who, ranking.bySearch), view = access === "full" ? sliceRanking("demand", who, ranking.byView) : null;
  const cap = limit != null && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity;
  const strip = (rows: DemandRankRow[]): DemandRankRow[] => rows.slice(0, cap).map((r) => (access === "full" ? r : { ...r, views: 0, move: null }));
  return { bySearch: strip(search.rows), byView: view ? view.rows.slice(0, cap) : [], access, locked: access !== "full", limit: search.limit };
}

/** Today's running totals (the busiest cards) diffed against the snapshot a window ago, and the period before it: Neon only, uncached, THROWS on a failed read (a failure is never stored as "no demand"). */
export async function readDemandWindow(days: number, previous: boolean, store: DemandStore = prismaDemandStore(), today: string = utcDayKey()): Promise<DemandWindowResult> {
  const [stored, counters] = await Promise.all([store.days(), store.counters(DEMAND_DAY_CARDS)]);
  return demandWindowOrThrow(days, { days: stored, live: buildDemandDay(today, counters).p, readDay: (d) => store.readDay(d), today }, { previous });
}

async function pinnedRef(): Promise<string> {
  const ptr = await getDataRef();
  if (!ptr) throw new Error("no data pointer");
  return ptr.ref;
}

async function hydrate(ids: readonly number[]): Promise<Map<number, CardLite>> {
  return ids.length ? getCardsByIds([...new Set(ids)]) : new Map();
}
const pickOf = (r: DemandRankRow, cards: Map<number, CardLite>): DemandPick[] => { const card = cards.get(r.cardId); return card ? [{ card, searches: r.searches, views: r.views, move: r.move }] : []; };

/** The free preview slice of the Demand Finder: at most the strip's rows, searches only. null when the overlay job has not written one yet. */
async function readDemandPreview(): Promise<DemandPreviewFile | null> {
  const { src } = await planeSource();
  return optionalOf<DemandPreviewFile>(src, "pv/demand.json");
}
const rankingOfPreview = (f: DemandPreviewFile | null): DemandRanking => ({
  bySearch: (f?.r ?? []).map(([cardId, searches]) => ({ cardId, searches, views: 0, move: null })), byView: [], windowUsable: (f?.r.length ?? 0) > 0, coveredDays: f ? f.days : null, totalDays: 0, previous: null,
});

/** N (Neon CardStat + DemandDay) behind a tier-neutral R entry [demand-v1, ref, days]; the preview is P pv/demand.json. Never throws: a failure is an empty result with `failed`. */
export async function getTopDemand(days: DemandWindowDays, who: Entitlement, limit?: number): Promise<DemandResult> {
  const access = accessOf("demand", who);
  try {
    if (access !== "full") {                                              // the clear slice, for everyone: no Neon, no window other than 7 days, no views
      const cut = cutDemandRanking(who, rankingOfPreview(await readDemandPreview()), limit), cards = await hydrate(cut.bySearch.map((r) => r.cardId));
      return { bySearch: cut.bySearch.flatMap((r) => pickOf(r, cards)), byView: [], windowUsable: cut.bySearch.length > 0, coveredDays: cut.bySearch.length ? 7 : null, totalDays: 0, previous: null, access: cut.access, locked: true, limit: cut.limit };
    }
    const window: DemandWindowDays = (DEMAND_WINDOWS as readonly number[]).includes(days) ? days : 7, ref = await pinnedRef();
    const ranking = await unstable_cache(async () => rankDemandWindow(await readDemandWindow(window, true)), rankKey("demand-v1", ref, window), { tags: [RANK_TAG], revalidate: TTL.hours6 })();
    const cut = cutDemandRanking(who, ranking, limit), cards = await hydrate([...cut.bySearch, ...cut.byView].map((r) => r.cardId));
    return {
      bySearch: cut.bySearch.flatMap((r) => pickOf(r, cards)), byView: cut.byView.flatMap((r) => pickOf(r, cards)), windowUsable: ranking.windowUsable, coveredDays: ranking.coveredDays, totalDays: ranking.totalDays, previous: ranking.previous,
      access: cut.access, locked: false, limit: cut.limit,
    };
  } catch {
    return emptyDemand(access, access !== "full", access === "full" ? PREMIUM_DEMAND_ROWS : 0, true);
  }
}

/** PURE: pv/demand.json from a 7-day window: the busiest cards by searches, only cards `listed` knows (an unlisted product has no page to link), at most the free strip's rows (FREE_DEMAND_ROWS, 10) and SEARCHES ONLY (no view count, no movement, no second window). */
export function demandPreviewFile(w: DemandWindowResult, at: string, listed: (id: number) => boolean = () => true): DemandPreviewFile {
  const rows = [...w.rows].filter((r) => r.searches > 0 && listed(r.cardId)).sort(compareDemand("searches")).slice(0, FREE_DEMAND_ROWS);
  return { v: 1, at, days: 7, r: rows.map((r) => [r.cardId, r.searches] as [number, number]) };
}
/** PURE: pv/rising.json from the analysis of each scope: the first FREE_RISING_ROWS (3) picks with the reason of each, nothing else of them. A failed or empty scope keeps its key with no picks. */
export function risingPreviewFile(byScope: Readonly<Partial<Record<RiseScope, RiseAnalysis>>>, at: string): RisingPreviewFile {
  const scopes: RisingPreviewFile["scopes"] = {};
  for (const [scope, a] of Object.entries(byScope) as [RiseScope, RiseAnalysis][]) scopes[scope] = a.failed ? [] : a.picks.slice(0, FREE_RISING_ROWS).map((p) => ({ id: p.id, slug: p.slug, name: p.displayName, reason: p.reason }));
  return { v: 1, at, scopes };
}

/** The free strip of /movers and the tools hub: the top 10 most searched cards over 7 days, identical for every viewer (a cached public page), read from the CLEAR preview slice pv/demand.json and hydrated with getCardsByIds. Never Neon, never a views column. P. */
export async function getDemandStrip(): Promise<{ at: string; rows: { card: CardLite & { setCode: string }; searches: number }[] }> {
  const f = await readDemandPreview();
  if (!f?.r.length) return { at: f?.at ?? "", rows: [] };
  const cards = await hydrate(f.r.map((r) => r[0]));
  return { at: f.at, rows: f.r.slice(0, 10).flatMap(([id, searches]) => { const card = cards.get(id); return card ? [{ card, searches }] : []; }) };
}

/** The Rising Cards teaser of a cached public page (home, tools hub): at most 3 picks per scope from the clear slice pv/rising.json. Never Neon. P. */
export async function getRisingTeaser(scope: RiseScope): Promise<RisePreviewRow[]> {
  return previewRows(await readRisingPreview(), scope).slice(0, 3);
}

/** ADMIN and the demand job only (Neon DemandDay). Throws when the window cannot be read (a failed read is never an empty window). `ref` is the data commit. */
export async function demandWindowAtOrThrow(ref: string, days: number, opts: { previous?: boolean } = {}): Promise<DemandWindowResult> {
  void ref;
  return readDemandWindow(days, !!opts.previous);
}

// ── Rising Cards ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function readRisingPreview(): Promise<RisingPreviewFile | null> {
  const { src } = await planeSource();
  return optionalOf<RisingPreviewFile>(src, "pv/rising.json");
}
const previewRows = (f: RisingPreviewFile | null, scope: RiseScope): RisePreviewRow[] => (f?.scopes[scope] ?? []).map((r) => ({ id: r.id, slug: r.slug, name: r.name, reason: r.reason }));

/** The weekly closes of every tracked unit (hist/w, the public input of Rising Cards), parsed once per data commit: uid -> 18 closes, oldest first, and the Sunday they end on. */
export interface WeeklyCloses { end: string; closes: Map<number, number[]> }
export function weeklyClosesOf(files: readonly (WeeklyFile | null)[]): WeeklyCloses {
  const closes = new Map<number, number[]>(); let end = "";
  for (const f of files) { if (!f) continue; if (f.end > end) end = f.end; f.k.forEach((uid, i) => closes.set(uid, f.c[i]!)); }
  return { end, closes };
}
function readWeekly(): Promise<WeeklyCloses> {
  return planeSource().then(({ src, ptr }) => memoByRef("hist:w", memoKey(ptr), async () => weeklyClosesOf(await Promise.all(Array.from({ length: 8 }, (_, i) => optionalOf<WeeklyFile>(src, weeklyPath(i)))))));
}

/** Demand as the Rising Cards ranking needs it: for the most searched cards, their totals now, their velocity, and the same a week ago. Neon only; the plane is not touched (so this may be cached on its own). */
export interface RiseDemand { day: string; snapshotDays: number; now: Record<number, { searchCount: number; viewCount: number; velocity: DemandWeekAgo["cards"][number]["velocity"] }>; weekAgo: DemandWeekAgo | null }
/** PURE over the day files read (oldest first, today's live totals last). */
export function riseDemandFrom(files: readonly DemandDayFile[], today: string, snapshotDays: number, keep: number = CANDIDATES): RiseDemand {
  const now = demandAsOf(files, today, VELOCITY_DAYS), asOf = dayMinus(today, WEEK_AGO_DAYS);
  const top = Object.entries(now).sort((a, b) => b[1].searchCount - a[1].searchCount || b[1].viewCount - a[1].viewCount || Number(a[0]) - Number(b[0])).slice(0, keep), ids = new Set(top.map(([id]) => Number(id)));
  const then = files.some((f) => f.day <= asOf) ? demandAsOf(files, asOf, VELOCITY_DAYS) : null;
  return {
    day: today, snapshotDays,
    now: Object.fromEntries(top.map(([id, c]) => [Number(id), { searchCount: c.searchCount, viewCount: c.viewCount, velocity: c.velocity }])),
    weekAgo: then ? { asOf, cards: Object.fromEntries(Object.entries(then).filter(([id]) => ids.has(Number(id)))) } : null,
  };
}
/** Neon only, uncached, THROWS on a failed read: the snapshots of the last VELOCITY_DAYS + WEEK_AGO_DAYS days and today's live totals. */
export async function readRiseDemand(store: DemandStore = prismaDemandStore(), today: string = utcDayKey()): Promise<RiseDemand> {
  const [stored, counters] = await Promise.all([store.days(), store.counters(DEMAND_DAY_CARDS)]), from = dayMinus(today, VELOCITY_DAYS + WEEK_AGO_DAYS + 1);
  const rows = await Promise.all(stored.filter((d) => d >= from && d < today).map((d) => store.readDay(d)));
  const files = [...rows.filter((f): f is DemandDayFile => !!f), buildDemandDay(today, counters)];
  return riseDemandFrom(files, today, new Set([...stored, today]).size);
}

/** The universe of one scope and everything the pure assembly needs, from data resolved BEFORE any cache closure: the browse index (headline unit, per-market lows and store counts), the weekly closes, and the demand of the most searched cards. */
export function riseEntryFrom(scope: RiseScope, d: RiseDemand, ix: BrowseIndex, weekly: WeeklyCloses, now: number): RiseEntry {
  const ids = Object.keys(d.now).map(Number), lite = ix.lookup(ids), universe: UniverseCard[] = [];
  for (const id of ids) {
    const c = lite.get(id), n = d.now[id]!; if (!c) continue;
    universe.push({
      id, slug: c.slug, name: c.name, setCode: c.setCode, number: c.number, variant: c.variant, hasImage: c.hasImage, imageThumbUrl: imageFor({ id, scryId: c.scryId, flags: c.flags }, "thumb"),
      searchCount: n.searchCount, viewCount: n.viewCount, marketUsd: c.marketUsd, low: { ...c.low, US: c.low.US ?? finishPrice(c)?.low ?? null }, stores: c.stores,   // before the first store stage the US price is TCGplayer's own low
    });
  }
  universe.sort((a, b) => b.searchCount - a.searchCount || b.viewCount - a.viewCount || a.id - b.id);
  const velocity = Object.fromEntries(Object.entries(d.now).flatMap(([id, c]) => (c.velocity ? [[Number(id), c.velocity]] : [])));
  const inputs = riseInputsFor(scope, universe, velocity, d.snapshotDays), series: RiseHistory["series"] = {};
  for (const c of inputs.universe) {
    const head = lite.get(c.id)!, closes = weekly.closes.get(c.id * 2 + (head.headFinish === "F" ? 1 : 0));
    if (closes) { const pts = weeklyPoints(closes, weekly.end); if (pts.length) series[c.id] = pts; }
  }
  const history: RiseHistory = { series };
  const analysis = assembleRisingCards(scope, inputs, history, now), weekAgo = d.weekAgo ? weekAgoRanks(scope, inputs, history, d.weekAgo, now) : null;
  return { analysis, weekAgo: weekAgo ? { ...weekAgo, ranks: weekAgo.ranks.slice(0, RISE_RANK_MAX_ROWS) } : null };
}
/** What the `rise-v1` cache holds for a scope and day: the analysis (at most the Premium rows, 40) and the ranking a week ago (every ranked card, at most SCAN). Tier-neutral. */
export interface RiseEntry { analysis: RiseAnalysis; weekAgo: WeekAgoRanking | null }

/** Both caches are keyed on the data commit and the day, never on a viewer: first the demand inputs (a Neon read), then the scope's entry (CPU over data resolved before the closure). */
async function riseEntry(scope: RiseScope): Promise<RiseEntry> {
  const ref = await pinnedRef(), day = utcDayKey();
  const demand = await unstable_cache(async () => readRiseDemand(), rankKey("rise-v1", ref, day, "demand"), { tags: [RANK_TAG], revalidate: TTL.hours6 })();
  const [ix, weekly] = await Promise.all([getBrowseIndex({ withOracle: false }), readWeekly()]);
  return unstable_cache(async () => riseEntryFrom(scope, demand, ix, weekly, Date.now()), rankKey("rise-v1", ref, day, scope), { tags: [RANK_TAG], revalidate: TTL.hours6 })();
}

/**
 * PURE: what a viewer may have of the Rising Cards ranking. Full access (Premium and admins): the analysis with every pick (the Premium ceiling, 40). Below it there is NO `analysis` property: signed out gets the ask for an account (no pick), a free account or Plus the clear preview slice of the
 * scope (at most the free rows). The cut is premium-gates.ts's (sliceRanking, gate). `entry` is null when it was not computed (it is not, below full) or could not be.
 */
export function riseResultFor(who: Entitlement, scope: RiseScope, entry: RiseEntry | null, preview: readonly RisePreviewRow[]): RiseResult {
  const access = accessOf("rising", who), viewer = viewerOf(who);
  if (access === "full") {
    if (!entry) return { access: "full", locked: false, limit: sliceRanking("rising", who, []).limit, failed: true, analysis: emptyAnalysis(scope, true) };
    const cut = sliceRanking("rising", who, entry.analysis.picks);
    return { access: "full", locked: false, limit: cut.limit, failed: entry.analysis.failed, analysis: { ...entry.analysis, picks: cut.rows } };
  }
  const g = gate("rising", access, preview, viewer);
  return { access, locked: true, limit: sliceRanking("rising", who, []).limit, failed: false, preview: g.rows };
}

/** R [rise-v1, ref, day, scope]: assembleRisingCards over hist/w (public weekly closes) + the Neon counters, cached tier-neutral and cut after `who`. THE one Rising Cards entry point (never wrap it, never call it inside an unstable_cache callback). */
export async function getCachedRisingCards(scope: RiseScope, who: Entitlement): Promise<RiseResult> {
  const access = accessOf("rising", who);
  try {
    if (access !== "full") return riseResultFor(who, scope, null, access === "preview" ? previewRows(await readRisingPreview(), scope) : []);
    return riseResultFor(who, scope, await riseEntry(scope), []);
  } catch {
    return access === "full" ? riseResultFor(who, scope, null, []) : { ...riseResultFor(who, scope, null, []), failed: true } as RiseResult;
  }
}
export async function getRisingWeekAgo(scope: RiseScope, who: Entitlement): Promise<WeekAgoRanking | null> {   // full access only; null otherwise or when it cannot be rebuilt
  if (accessOf("rising", who) !== "full") return null;
  try { return (await riseEntry(scope)).weekAgo; } catch { return null; }
}

const SNAPSHOT_MEMO_MS = 60_000, SNAPSHOT_MEMO_MAX = 200;
const snapshotMemo = new Map<string, { at: number; v: Awaited<ReturnType<typeof getRisingSnapshot>> }>();
/** N: the frozen JSON of a minted Hot 40 (/rising/[token]); whoever has the link sees it (a snapshot is a shared page, not a paid read). Neon (RisingSnapshot) through a one-minute instance memo: a module that reads the plane may not hold another unstable_cache
 *  (tests/nested-cache.test.ts rule 5), and a deleted link must stop working within the minute. A failed read is `null` and is not remembered. */
export async function getRisingSnapshot(token: string): Promise<{ title: string; data: RisingSnapshotData; createdAt: string } | null> {
  const t = String(token ?? "").trim(); if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
  const hit = snapshotMemo.get(t); if (hit && Date.now() - hit.at < SNAPSHOT_MEMO_MS) return hit.v;
  try {
    const { prisma } = await import("../db");
    const row = await prisma.risingSnapshot.findUnique({ where: { token: t }, select: { title: true, data: true, createdAt: true } });
    const v = row ? { title: row.title, data: row.data as unknown as RisingSnapshotData, createdAt: row.createdAt.toISOString() } : null;
    if (snapshotMemo.size >= SNAPSHOT_MEMO_MAX) snapshotMemo.delete(snapshotMemo.keys().next().value as string);
    snapshotMemo.set(t, { at: Date.now(), v });
    return v;
  } catch { return null; }
}
