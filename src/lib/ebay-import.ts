// The eBay pass: search eBay for the (unit, market) pairs that are due and write each pair's result as soon as its search completes. Script-side only: run by scripts/ebay.ts from
// .github/workflows/ebay-prices.yml (04:37, 10:37, 16:37 and 23:37 UTC), never from a page, a route or the import. It READS a checkout of the pointed data commit (scripts/plane-checkout.sh)
// and WRITES NEON ONLY: EbayTrack, EbayBest, EbayPanel, EbayBanner, EbayLedger (and the ImportRun row scripts/ebay.ts keeps). eBay data is never written to GitHub (licence).
//
// The order of a run (ebay-brief 8.3b), every step failing CLOSED (zero Browse calls, a green run with a visible annotation):
//   kill switch / credentials -> token -> live quota (+ the window's ledger row) -> observe-only? -> tiers and tracks from the catalogue -> allowance = min(ledger, remaining - reserve, run
//   share, dispatch cap) -> quiet check (is Rift mid-run?) -> pairs in priority order, claimed from the ledger in chunks of 25, the quota re-read every chunk -> write COMPLETED searches only ->
//   banner payload -> sweep at 72 h -> settle the ledger -> purge the Neon tags.
// A COMPLETED search upserts the unit rows it found and deletes the ones it did not; a failed, 429'd or budget-refused search touches nothing, so the pair stays due and a run cut short never
// removes a live listing. A 429 blocks the window in the ledger and ends the run (never retried).
import type { PrismaClient } from "@prisma/client";
import { MARKET_INDEX, marketFromIndex, type Country } from "./country";
import { CARD_FLAGS, FINISH_INDEX, ORACLE_FLAGS, PRICE_MASK, SEALED_KINDS, fold, isChasePrinting, nkey, type Finish, type TreatmentKey } from "./constants";
import type { CatRow, PxRow, SealedListFile, SetsFile } from "./data/plane/formats";
import { bucketPath } from "./data/plane/shards";
import type { TreeView } from "./data/plane/tree";
import { convertUsdCents } from "./fx";
import { BANNER_KEY, mergeBanner, parsePayload, tileOf, type BannerUpdate } from "./ebay-banner";
import { selectChasePool, type ChaseCandidate } from "./ebay-chase-pool";
import { EBAY_MARKETPLACE, ebaySpentThisRun, isEbayRateLimited, openEbayClient, searchBrowse, setCallGate, setEbayBudget, trustedQuota, fetchRemaining, MTG_SINGLES_CATEGORY, type BrowseItem } from "./ebay";
import { CLAIM_CHUNK, Claimer, windowKeyOf, type LedgerStore, type RunRecord } from "./ebay-ledger";
import {
  CARD_LIMIT, SEALED_LIMIT, cardFilter, cardQuery, nameTarget, pickListing, panelListings, screenGraded, screenName, screenSealed, sealedFilter, sealedQuery, selfMatches, unitKeyOf,
  type EbayListing, type GradedListing, type NameUnit, type SealedTarget,
} from "./ebay-match";
import {
  FailureBreaker, SEALED_MARKETS, SINGLES_MARKETS, TIER, allocate, allowanceFor, classAllowance, combineQueries, duePairs, ebayConfigFromEnv, effectiveCap, foreignObserved,
  pairKey, pairWrite, parseOnlyMarket, planRun, popularityOf, purposeOfSchedule, recordedConfig, reserveFor, scoreOf, sealedPop,
  type EbayConfig, type EbayMarket, type Pair, type QueryStatus, type QuotaReading, type RunPurpose, type StopReason, type TierCode, type Unit,
} from "./ebay-plan";
import type { BannerPayloadV1, BannerTile } from "./data/ebay";
import type { MatchRow, SealedRef } from "./match";

type Log = (...a: unknown[]) => void;
const annotate = (level: "warning" | "error", title: string, msg: string) => console.log(`::${level} title=${title}::${msg}`);
const DAY = 86_400_000;

// ── 1. reading the published tree ────────────────────────────────────────────

export interface Printing {
  id: number; setId: number; setCode: string | null; setName: string | null; kind: string; releasedOn: string | null; label: string | null; treat: TreatmentKey[]; flags: number; cls: number;
  rarity: string; oracleNo: number; marketN: number | null; marketF: number | null; lowN: number | null; lowF: number | null; mask: number; c7: number | null; rowNames: string[]; setNames: string[]; nkey: string | null; abbr: string | null;
  trackedN: boolean; trackedF: boolean; listed: boolean;
}
export interface OracleInfo { no: number; name: string; edhrecRank: number | null; reserved: boolean; layout: string }
export interface SealedInfo { id: number; name: string; kind: string; setCode: string | null; setName: string | null; releasedOn: string | null; presale: boolean; marketCents: number | null }
export interface CatalogueView { day: string; printings: Printing[]; oracles: Map<number, OracleInfo>; sealed: SealedInfo[] }

const rd = <T,>(t: TreeView, rel: string): T | null => { if (!t.has(rel)) return null; try { return JSON.parse(t.read(rel)) as T; } catch { return null; } };

/** The catalogue of a published tree (cat, px, or, meta/sets, sl/list): everything the pass needs, read once. */
export function readCatalogue(t: TreeView, day: string): CatalogueView {
  const sets = new Map<number, { code: string | null; name: string; tcgName: string; kind: string; releasedOn: string | null; abbr: string | null }>();
  for (const r of rd<SetsFile>(t, "meta/sets.json")?.sets ?? []) sets.set(r[0], { code: (r[9] as string | 0) || null, name: r[4], tcgName: (r[5] as string | 0) || r[4], kind: r[6], releasedOn: (r[7] as string | 0) || null, abbr: r[3] ? r[3].toLowerCase() : null });
  const scry = new Map<string, string>();
  for (const s of rd<{ sets: [string, string][] }>(t, "meta/scrysets.json")?.sets ?? []) scry.set(s[0], s[1]);
  const oracles = new Map<number, OracleInfo>();
  for (const f of t.files()) {
    if (!f.startsWith("or/")) continue;
    for (const r of rd<{ o: (string | number)[][] }>(t, f)?.o ?? []) oracles.set(Number(r[0]), { no: Number(r[0]), name: String(r[3]), edhrecRank: r[10] ? Number(r[10]) : null, reserved: (Number(r[11]) & ORACLE_FLAGS.RESERVED) !== 0, layout: r[12] ? String(r[12]) : "normal" });
  }
  const buckets = rd<{ cat: number[] }>(t, "meta/buckets.json")?.cat ?? [];
  const printings: Printing[] = [];
  for (const b of buckets) {
    const px = new Map<number, PxRow>((rd<{ p: PxRow[] }>(t, bucketPath("px", b))?.p ?? []).map((r) => [r[0], r]));
    for (const c of (rd<{ c: CatRow[] }>(t, bucketPath("cat", b))?.c ?? [])) {
      const p = px.get(c[0]);
      if (!p) continue;
      const s = sets.get(c[4]);
      const sc = (c[5] as string | 0) || s?.code || null;
      const o = c[14] ? oracles.get(c[14]) : undefined;
      const names = new Set<string>();
      const add = (v: string | number | null | undefined): void => { const q = fold(v == null || v === 0 ? "" : String(v)); if (q) names.add(q); };
      add(c[2]); add(c[3]); add(c[17]); add(o?.name); for (const part of (o?.name ?? String(c[2])).split(" // ")) add(part);
      const setNames = new Set<string>();
      const sn = (v: string | null | undefined): void => { const q = fold(v); if (q) setNames.add(q); };
      if (c[5]) sn(scry.get(String(c[5])));
      if (s) { sn(s.tcgName); for (const pre of ["Commander: ", "Universes Beyond: ", "Art Series: ", "Promo Pack: "]) if (s.tcgName.startsWith(pre)) sn(s.tcgName.slice(pre.length)); }
      const mask = p[5];
      const c7a = p[6] ?? null, c7b = p[9] ?? null;
      printings.push({
        id: c[0], setId: c[4], setCode: sc, setName: s?.name ?? null, kind: s?.kind ?? "expansion", releasedOn: s?.releasedOn ?? null, label: (c[11] as string | 0) || null, treat: c[10] ? (c[10].split(" ") as TreatmentKey[]) : [], flags: c[12],
        cls: c[9], rarity: c[8], oracleNo: Number(c[14]) || 0, marketN: p[1], marketF: p[2], lowN: p[3], lowF: p[4], mask, c7: c7a != null || c7b != null ? (Math.abs(c7a ?? 0) >= Math.abs(c7b ?? 0) ? c7a : c7b) : null,
        rowNames: [...names], setNames: [...setNames], nkey: nkey((c[6] as string | 0) || null), abbr: s?.abbr ?? null,
        trackedN: (mask & PRICE_MASK.TRACKN) !== 0, trackedF: (mask & PRICE_MASK.TRACKF) !== 0, listed: (mask & PRICE_MASK.LISTED) !== 0,
      });
    }
  }
  const sealed: SealedInfo[] = [];
  for (const f of t.files()) {
    if (!/^sl\/list-\d+\.json$/.test(f)) continue;
    for (const r of rd<SealedListFile>(t, f)?.s ?? []) {
      if (r[7] & 2) continue;                                                       // GONE
      const set = r[3] ? sets.get(r[3] as number) : undefined;
      sealed.push({ id: r[0], name: r[2], kind: r[4], setCode: set?.code ?? null, setName: set?.name ?? null, releasedOn: (r[6] as string | 0) || set?.releasedOn || null, presale: (r[7] & 1) !== 0, marketCents: r[8] });
    }
  }
  return { day, printings, oracles, sealed };
}

/** Name = Oracle when the printing has one, else the folded TCG name. */
export const refOfPrinting = (p: Printing, oracleName?: string): string => (p.oracleNo ? `o:${p.oracleNo}` : `n:${fold(oracleName ?? p.rowNames[0] ?? String(p.id))}`);

export interface NameInfo { ref: string; name: string; printings: Printing[]; tracked: Printing[] }
export interface OwnSignals { percentile: Map<string, number>; totalViews: number; watchers: Map<string, number> }
export interface Built { units: Unit[]; names: Map<string, NameInfo>; sealed: Map<string, SealedInfo>; candidates: ChaseCandidate[]; unmatchable: number }

const isHiddenKind = (kind: string): boolean => kind === "art-series" || kind === "oversized";
/** The units of the allocator and the candidates of the chase pool from a catalogue. Pure. Low-only units never count (marketOnlyCents). */
export function buildUnits(view: CatalogueView, today: string, own: OwnSignals | null, cfg: EbayConfig): Built {
  const names = new Map<string, NameInfo>();
  for (const p of view.printings) {
    if (p.cls !== 0 || !p.listed || isHiddenKind(p.kind)) continue;
    const o = p.oracleNo ? view.oracles.get(p.oracleNo) : undefined;
    const ref = refOfPrinting(p, o?.name);
    let n = names.get(ref);
    if (!n) names.set(ref, (n = { ref, name: o?.name ?? p.rowNames[0] ?? String(p.id), printings: [], tracked: [] }));
    n.printings.push(p);
    if (p.trackedN || p.trackedF) n.tracked.push(p);
  }
  const units: Unit[] = [];
  const candidates: ChaseCandidate[] = [];
  const nowMs = Date.parse(today);
  for (const n of names.values()) {
    let v = 0, chase = false, recent = false, chg: number | null = null;
    for (const p of n.tracked) {
      const best = Math.max(p.trackedN ? p.marketN ?? 0 : 0, p.trackedF ? p.marketF ?? 0 : 0);
      v = Math.max(v, best);
      if (best >= 2000 && isChasePrinting({ treat: p.treat, flags: p.flags })) chase = true;
      if (p.releasedOn && nowMs - Date.parse(p.releasedOn) <= 45 * DAY) recent = true;
      if (p.c7 != null && (chg == null || Math.abs(p.c7) > Math.abs(chg))) chg = p.c7;
    }
    const o = n.printings[0]!.oracleNo ? view.oracles.get(n.printings[0]!.oracleNo) : undefined;
    // the chase pool's candidates: one per (printing, finish) with its own market, whatever its tracking bit
    for (const p of n.printings) {
      const lang = p.treat.some((k) => k.startsWith("lang-")) ? "other" : "en";
      const hasArt = (p.flags & (CARD_FLAGS.SCRYIMG | CARD_FLAGS.TCGIMG)) !== 0;
      for (const f of ["N", "F"] as const) {
        const market = f === "N" ? p.marketN : p.marketF;
        if (market == null) continue;
        const etched = f === "F" && (p.flags & CARD_FLAGS.ETCHED) !== 0;
        candidates.push({
          id: p.id, nameKey: n.ref, setCode: p.setCode ?? "", setKind: p.kind, releasedOn: p.releasedOn, rarity: p.rarity, finish: f === "N" ? "nonfoil" : etched ? "etched" : "foil", treatments: p.treat,
          chase: isChasePrinting({ treat: p.treat, flags: p.flags }), reserved: o?.reserved ?? false, edhrecRank: o?.edhrecRank ?? null, marketCents: market, lowCents: f === "N" ? p.lowN : p.lowF, hasArt, cls: p.cls,
          layout: o?.layout ?? "normal", lang, popularity: own?.percentile.get(n.ref) ?? null, ownWeight: own ? Math.min(1, own.totalViews / 50_000) : 0,
        });
      }
    }
    if (v < cfg.minValueCents) continue;
    const pop = popularityOf({ edhrecRank: o?.edhrecRank ?? null, reserved: o?.reserved ?? false, ownPercentile: own?.percentile.get(n.ref) ?? null, totalViews: own?.totalViews ?? 0, watchers: own?.watchers.get(n.ref) ?? 0, change7dPct: chg, valueCents: v });
    units.push({ ref: n.ref, kind: "single", name: n.name, valueCents: v, pop, chase, recent, banner: false });
  }
  const sealed = new Map<string, SealedInfo>();
  const year = 365 * DAY;
  for (const s of view.sealed) {
    if (s.marketCents == null || !SEALED_KINDS.includes(s.kind as (typeof SEALED_KINDS)[number])) continue;
    const ref = `p:${s.id}`;
    sealed.set(ref, s);
    const rel = s.releasedOn ? nowMs - Date.parse(s.releasedOn) <= year : false;
    units.push({ ref, kind: "sealed", name: s.name, valueCents: s.marketCents, pop: sealedPop({ ownPercentile: own?.percentile.get(ref) ?? null, releasedWithin12Months: rel || s.presale, valueCents: s.marketCents }), chase: false, recent: false, banner: false, sealedKind: s.kind });
  }
  return { units, names, sealed, candidates, unmatchable: 0 };
}

/** The matcher rows of ONE name: every class-0 printing of the oracle (tracked or not), so a title that fits an untracked sibling is a miss for the tracked one. */
export function matchRowsOf(n: NameInfo): MatchRow[] {
  return n.printings.map((p): MatchRow => ({
    id: p.id, groupId: p.setId, names: p.rowNames, sc: p.setCode, setNames: p.setNames, nkey: p.nkey, treat: p.treat, hasN: p.marketN != null || (p.mask & PRICE_MASK.HASN) !== 0, hasF: p.marketF != null || (p.mask & PRICE_MASK.HASF) !== 0,
    etched: (p.flags & CARD_FLAGS.ETCHED) !== 0, rootId: null, cls: p.cls, label: p.label, abbr: p.abbr,
  }));
}
export function unitsOf(n: NameInfo): NameUnit[] {
  return n.printings.map((p) => ({
    id: p.id, setCode: p.setCode, setName: p.setName, label: p.label, hasN: p.marketN != null || (p.mask & PRICE_MASK.HASN) !== 0, hasF: p.marketF != null || (p.mask & PRICE_MASK.HASF) !== 0, etched: (p.flags & CARD_FLAGS.ETCHED) !== 0,
    marketN: p.marketN, marketF: p.marketF,
  }));
}

// ── 2. tracks ────────────────────────────────────────────────────────────────

export interface TrackRow { ref: string; market: EbayMarket; tier: TierCode; score: number; banner: boolean; checkedAt: Date | null; dueAt: Date | null; matched: boolean }
/** The rows EbayTrack should hold: only names that are searched somewhere (tier C has no row), one per market they are searched in. Pure. */
export function wantedTracks(units: readonly Unit[], tiers: ReadonlyMap<string, TierCode>, scores: ReadonlyMap<string, number>, poolOrder: readonly string[], cfg: EbayConfig): Omit<TrackRow, "checkedAt" | "dueAt" | "matched">[] {
  const out: Omit<TrackRow, "checkedAt" | "dueAt" | "matched">[] = [];
  const pool = new Map(poolOrder.map((r, i) => [r, i] as const));
  for (const u of units) {
    const t = tiers.get(u.ref) ?? TIER.C;
    const banner = pool.has(u.ref);
    if (t === TIER.C && !banner) continue;
    const markets = new Set<EbayMarket>();
    if (t === TIER.A || t === TIER.B) markets.add("US");
    if (t === TIER.SEALED) for (const m of SEALED_MARKETS) markets.add(m);
    if (banner) { markets.add("US"); if ((pool.get(u.ref) ?? 99) < cfg.bannerOtherNames) for (const m of ["UK", "AU", "EU"] as const) markets.add(m); }
    for (const m of markets) out.push({ ref: u.ref, market: m, tier: banner && t === TIER.C ? TIER.BANNER : t, score: scores.get(u.ref) ?? scoreOf({ valueCents: u.valueCents, pop: u.pop, chase: u.chase, recent: u.recent }), banner });
  }
  return out;
}

// ── 3. the Neon facade (a narrow interface: the pass is tested against memory) ──

export interface PanelEntry { finish: 0 | 1; priceCents: number; shipCents: number | null; currency: string; itemId: string; title: string; image: string | null; rank: number }
export interface GradedEntry { grader: string; grade: string; priceCents: number; shipCents: number | null; currency: string; itemId: string; title: string; image: string | null }
export interface PairWrite {
  ref: string; market: EbayMarket; at: Date; matched: boolean;
  best: { productId: number; finish: Finish; market: EbayMarket; row: { priceCents: number; shipCents: number | null; itemId: string } | null }[];
  panels: { productId: number; market: EbayMarket; listings: PanelEntry[]; graded: GradedEntry[] }[];
}
export interface EbayStore {
  readTracks(): Promise<TrackRow[]>;
  syncTracks(want: Omit<TrackRow, "checkedAt" | "dueAt" | "matched">[]): Promise<{ written: number; removed: number }>;
  writePair(w: PairWrite): Promise<void>;
  readBanner(): Promise<unknown>;
  writeBanner(payload: BannerPayloadV1): Promise<void>;
  sweep(before: Date): Promise<void>;
  paused(): Promise<boolean>;
  ourSpend24h(now: Date): Promise<number>;
  ownSignals(): Promise<{ stats: Map<number, { s: number; v: number }> }>;
}

const dbMarket = (m: EbayMarket): number => MARKET_INDEX[m as Country];

export function prismaEbayStore(db: PrismaClient): EbayStore {
  return {
    async readTracks() {
      const rows = await db.ebayTrack.findMany({ select: { ref: true, market: true, tier: true, score: true, banner: true, checkedAt: true, dueAt: true, matched: true } });
      return rows.map((r) => ({ ref: r.ref, market: marketFromIndex(r.market) as EbayMarket, tier: r.tier as TierCode, score: r.score, banner: r.banner, checkedAt: r.checkedAt, dueAt: r.dueAt, matched: r.matched }));
    },
    async syncTracks(want) {
      const have = await db.ebayTrack.findMany({ select: { ref: true, market: true, tier: true, score: true, banner: true } });
      const key = (r: { ref: string; market: number }) => `${r.ref}|${r.market}`;
      const haveBy = new Map<string, (typeof have)[number]>(have.map((r) => [key(r), r] as const));
      const wantBy = new Map<string, (typeof want)[number]>(want.map((w) => [`${w.ref}|${dbMarket(w.market)}`, w] as const));
      const ops = [];
      let written = 0;
      for (const [k, w] of wantBy) {
        const h = haveBy.get(k);
        if (h && h.tier === w.tier && h.banner === w.banner && Math.abs(h.score - w.score) < 1e-3 * Math.max(1, h.score)) continue;     // diff-guarded: an unchanged row is not rewritten
        written++;
        ops.push(db.ebayTrack.upsert({ where: { ref_market: { ref: w.ref, market: dbMarket(w.market) } }, create: { ref: w.ref, market: dbMarket(w.market), tier: w.tier, score: w.score, banner: w.banner }, update: { tier: w.tier, score: w.score, banner: w.banner } }));
      }
      const gone = have.filter((h) => !wantBy.has(key(h)));
      for (const g of gone) ops.push(db.ebayTrack.delete({ where: { ref_market: { ref: g.ref, market: g.market } } }));
      for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
      return { written, removed: gone.length };
    },
    async writePair(w) {
      const m = dbMarket(w.market);
      const ops = [];
      for (const b of w.best) {
        const where = { productId_finish_market: { productId: b.productId, finish: FINISH_INDEX[b.finish], market: dbMarket(b.market) } };
        if (b.row) ops.push(db.ebayBest.upsert({ where, create: { productId: b.productId, finish: FINISH_INDEX[b.finish], market: dbMarket(b.market), ...b.row, checkedAt: w.at }, update: { ...b.row, checkedAt: w.at } }));
        else ops.push(db.ebayBest.deleteMany({ where: { productId: b.productId, finish: FINISH_INDEX[b.finish], market: dbMarket(b.market) } }));
      }
      for (const p of w.panels) {
        if (p.listings.length || p.graded.length) {
          ops.push(db.ebayPanel.upsert({
            where: { productId_market: { productId: p.productId, market: dbMarket(p.market) } },
            create: { productId: p.productId, market: dbMarket(p.market), checkedAt: w.at, listings: p.listings as object[], graded: p.graded as object[] },
            update: { checkedAt: w.at, listings: p.listings as object[], graded: p.graded as object[] },
          }));
        } else ops.push(db.ebayPanel.deleteMany({ where: { productId: p.productId, market: dbMarket(p.market) } }));
      }
      ops.push(db.ebayTrack.updateMany({ where: { ref: w.ref, market: m }, data: { checkedAt: w.at, matched: w.matched, dueAt: null } }));
      await db.$transaction(ops);
    },
    async readBanner() { return (await db.ebayBanner.findUnique({ where: { key: BANNER_KEY }, select: { payload: true } }))?.payload ?? null; },
    async writeBanner(payload) { await db.ebayBanner.upsert({ where: { key: BANNER_KEY }, create: { key: BANNER_KEY, payload: payload as object }, update: { payload: payload as object } }); },
    async sweep(before) { await db.ebayPanel.deleteMany({ where: { checkedAt: { lt: before } } }); await db.ebayBest.deleteMany({ where: { checkedAt: { lt: before } } }); },
    async paused() { return (await db.meta.findUnique({ where: { key: "ebay.paused" }, select: { value: true } }))?.value === "1"; },
    async ourSpend24h(now) {
      const rows = await db.importRun.findMany({ where: { kind: "ebay", startedAt: { gte: new Date(now.getTime() - DAY) } }, select: { summary: true } });
      return rows.reduce((s, r) => s + (Number((r.summary as { spent?: unknown } | null)?.spent) || 0), 0);
    },
    async ownSignals() {
      const rows = await db.cardStat.findMany({ select: { cardId: true, searchCount: true, viewCount: true }, orderBy: { viewCount: "desc" }, take: 20_000 });
      return { stats: new Map(rows.map((r) => [r.cardId, { s: r.searchCount, v: r.viewCount }] as const)) };
    },
  };
}

/** An in-memory store for tests and dry runs: the same rules, the data in plain maps. */
export function memoryEbayStore(): EbayStore & { tracks: Map<string, TrackRow>; best: Map<string, PairWrite["best"][number]["row"] & { checkedAt: Date }>; panels: Map<string, { listings: PanelEntry[]; graded: GradedEntry[]; checkedAt: Date }>; banner: { payload: unknown }; writes: number; pausedFlag: boolean; spend24: number } {
  const s = {
    tracks: new Map<string, TrackRow>(), best: new Map<string, PairWrite["best"][number]["row"] & { checkedAt: Date }>(), panels: new Map<string, { listings: PanelEntry[]; graded: GradedEntry[]; checkedAt: Date }>(),
    banner: { payload: null as unknown }, writes: 0, pausedFlag: false, spend24: 0,
  };
  const out: EbayStore & typeof s = {
    ...s,
    async readTracks() { return [...s.tracks.values()]; },
    async syncTracks(want) {
      const keys = new Set(want.map((w) => pairKey(w.ref, w.market)));
      let written = 0, removed = 0;
      for (const w of want) { const k = pairKey(w.ref, w.market); const h = s.tracks.get(k); if (!h || h.tier !== w.tier || h.banner !== w.banner) { written++; s.tracks.set(k, { ...w, checkedAt: h?.checkedAt ?? null, dueAt: null, matched: h?.matched ?? false }); } }
      for (const k of [...s.tracks.keys()]) if (!keys.has(k)) { s.tracks.delete(k); removed++; }
      return { written, removed };
    },
    async writePair(w) {
      s.writes++;
      for (const b of w.best) { const k = `${b.productId}|${b.finish}|${b.market}`; if (b.row) s.best.set(k, { ...b.row, checkedAt: w.at }); else s.best.delete(k); }
      for (const p of w.panels) { const k = `${p.productId}|${p.market}`; if (p.listings.length || p.graded.length) s.panels.set(k, { listings: p.listings, graded: p.graded, checkedAt: w.at }); else s.panels.delete(k); }
      const t = s.tracks.get(pairKey(w.ref, w.market)); if (t) { t.checkedAt = w.at; t.matched = w.matched; }
    },
    async readBanner() { return s.banner.payload; },
    async writeBanner(p) { s.banner.payload = p; },
    async sweep(before) { for (const [k, v] of s.panels) if (v.checkedAt < before) s.panels.delete(k); for (const [k, v] of s.best) if (v.checkedAt < before) s.best.delete(k); },
    async paused() { return out.pausedFlag; },
    async ourSpend24h() { return out.spend24; },
    async ownSignals() { return { stats: new Map() }; },
  };
  return out;
}

// ── 4. the pass ──────────────────────────────────────────────────────────────

export interface MarketStats { due: number; planned: number; searched: number; matched: number; failed: number; calls: number }
export interface EbayPassSummary {
  purpose: RunPurpose; mode: string; observeOnly: boolean; stop: StopReason | null; allowance: number; budgetDetail: Record<string, number | string | null>;
  remainingStart: number | null; remainingEnd: number | null; limit: number | null; reset: string | null; windowKey: string | null;
  spent: number; claimed: number; modelled: number; completed: number; matched: number; panels: number; banner: number;
  byMarket: Record<string, MarketStats>; byClass: Record<string, number>; tiers: { A: number; B: number; C: number; sealed: number; banner: number; aMin: number | null; bMin: number | null };
  latched: "429" | "budget" | "failures" | "reserve" | null; breaker?: string; tokenRefused?: true; unmatchable: number; rejects: Record<string, number>; foreignDelta: number | null; problems: string[];
}
export interface PassDeps {
  tree: TreeView | null;
  store: EbayStore;
  ledger: LedgerStore;
  env?: Record<string, string | undefined>;
  /** the quiet check and the foreign-spend pause; tests pass 0 */
  sleep?: (ms: number) => Promise<void>;
  quietMs?: number;
  /** purge the Neon tags after a run that wrote (POST /api/revalidate); absent: not called */
  revalidate?: () => Promise<void>;
  onProgress?: (spent: number) => Promise<void>;
  schedule?: string | null;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const emptyStats = (): MarketStats => ({ due: 0, planned: 0, searched: 0, matched: 0, failed: 0, calls: 0 });
const bumpRej = (into: Record<string, number>, from: Record<string, number>): void => { for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v; };

/** Percentile of 3 x searches + views across names, and the totals. Pure. */
export function ownSignalsOf(stats: ReadonlyMap<number, { s: number; v: number }>, refOf: ReadonlyMap<number, string>): OwnSignals | null {
  const perName = new Map<string, number>();
  let totalViews = 0;
  for (const [id, x] of stats) { totalViews += x.v; const r = refOf.get(id); if (r) perName.set(r, (perName.get(r) ?? 0) + 3 * x.s + x.v); }
  if (!perName.size || totalViews <= 0) return null;
  const sorted = [...perName.values()].sort((a, b) => a - b);
  const percentile = new Map<string, number>();
  for (const [r, v] of perName) percentile.set(r, sorted.filter((x) => x <= v).length / sorted.length);
  return { percentile, totalViews, watchers: new Map() };
}

export async function runEbayPass(log: Log, deps: PassDeps, opts: { now?: Date } = {}): Promise<EbayPassSummary> {
  const now = opts.now ?? new Date();
  const env = deps.env ?? process.env;
  const sleep = deps.sleep ?? realSleep;
  const { cfg, problems } = ebayConfigFromEnv(env);
  for (const p of problems) { log(`config: ${p}`); annotate("warning", "eBay config", p); }
  const only = parseOnlyMarket(env.EBAY_ONLY_MARKET);
  const force = env.EBAY_FORCE === "1";
  const dispatchCap = env.EBAY_DISPATCH_CAP;
  // a dispatched run (a cap or a force) is a main run; a scheduled run is told apart by the clock: the main pass is the 23:37 cron, delayed by GitHub at worst a few hours
  const hour = now.getUTCHours();
  const purpose: RunPurpose = deps.schedule !== undefined ? purposeOfSchedule(deps.schedule) : force || (dispatchCap != null && dispatchCap !== "") || hour >= 22 || hour < 3 ? "main" : "banner";
  const summary: EbayPassSummary = {
    purpose, mode: cfg.keysetMode, observeOnly: cfg.observeOnly, stop: null, allowance: 0, budgetDetail: {}, remainingStart: null, remainingEnd: null, limit: null, reset: null, windowKey: null,
    spent: 0, claimed: 0, modelled: 0, completed: 0, matched: 0, panels: 0, banner: 0, byMarket: {}, byClass: {}, tiers: { A: 0, B: 0, C: 0, sealed: 0, banner: 0, aMin: null, bMin: null },
    latched: null, unmatchable: 0, rejects: {}, foreignDelta: null, problems,
  };
  const stopWith = (s: StopReason): EbayPassSummary => { summary.stop = s; return summary; };
  if (!cfg.apiEnabled) { log("EBAY_API_ENABLED=0: the kill switch is on, 0 calls."); return stopWith("api-disabled"); }

  // ── token and the live quota (free) ────────────────────────────────────────
  const open = await openEbayClient((m) => log(m));
  if (open.tokenRefused) { summary.tokenRefused = true; return summary; }
  const q0 = trustedQuota(await fetchRemaining());
  let quota: QuotaReading | null = q0;
  if (quota) { summary.remainingStart = quota.remaining; summary.limit = quota.limit; summary.reset = quota.reset.toISOString(); }
  else log("eBay quota: unreadable (shared mode spends nothing)");

  // ── the ledger window ─────────────────────────────────────────────────────
  let windowKey = quota ? windowKeyOf(quota.reset, quota.timeWindowSec) : now.toISOString().slice(0, 10);
  const cap = quota ? effectiveCap(quota.limit, cfg) : cfg.dailyBudget;
  let ledgerRow: Awaited<ReturnType<LedgerStore["open"]>> | null = null;
  try {
    ledgerRow = await deps.ledger.open(windowKey, cap, { limit: quota?.limit ?? null, resetAt: quota?.reset ?? null });
    summary.windowKey = windowKey;
    if (quota) await deps.ledger.sample(windowKey, { t: now.toISOString(), remaining: quota.remaining, limit: quota.limit });
  } catch (e) { log(`eBay ledger unreachable: ${(e as Error).message}`); }

  // ── the catalogue: tiers, tracks, the chase pool (also when observing: the admin panel shows the plan) ──
  let built: Built | null = null;
  let units: Unit[] = [];
  let poolOrder: string[] = [];
  let poolCandidates: ChaseCandidate[] = [];
  let alloc: ReturnType<typeof allocate> | null = null;
  let tracks: TrackRow[] = [];
  if (deps.tree) {
    const day = (JSON.parse(deps.tree.has("status.json") ? deps.tree.read("status.json") : "{}") as { pointer?: { priceDay?: string } }).pointer?.priceDay ?? now.toISOString().slice(0, 10);
    const view = readCatalogue(deps.tree, day);
    const idsByRef = new Map<number, string>();
    for (const p of view.printings) if (p.cls === 0) idsByRef.set(p.id, refOfPrinting(p, p.oracleNo ? view.oracles.get(p.oracleNo)?.name : undefined));
    let own: OwnSignals | null = null;
    try { own = ownSignalsOf((await deps.store.ownSignals()).stats, idsByRef); } catch { own = null; }
    built = buildUnits(view, now.toISOString().slice(0, 10), own, cfg);
    poolCandidates = selectChasePool(built.candidates, now.toISOString().slice(0, 10));
    const seen = new Set<string>();
    for (const c of poolCandidates) if (!seen.has(c.nameKey)) { seen.add(c.nameKey); poolOrder.push(c.nameKey); }
    const poolRank = new Map(poolOrder.map((r, i) => [r, i] as const));
    // Names that can never match a listing are never searched: no call is spent on a name whose own printings' canonical titles do not match them.
    for (const u of built.units) {
      if (u.kind !== "single") continue;
      const n = built.names.get(u.ref)!;
      if (!(u.valueCents >= cfg.minValueCents || poolRank.has(u.ref))) continue;
      const t = nameTarget(n.name, matchRowsOf(n), unitsOf(n).filter((x) => n.tracked.some((p) => p.id === x.id)));
      if (!selfMatches(t)) { u.matchable = false; summary.unmatchable++; }
    }
    units = built.units.map((u) => ({ ...u, banner: poolRank.has(u.ref) })).sort((a, b) => (poolRank.get(a.ref) ?? 1e9) - (poolRank.get(b.ref) ?? 1e9));
    tracks = await deps.store.readTracks().catch(() => []);
    const prev = new Map<string, TierCode>();
    for (const t of tracks) if (!prev.has(t.ref) || t.tier === TIER.A || t.tier === TIER.B) prev.set(t.ref, t.tier);
    alloc = allocate(units, cfg, prev);
    summary.tiers = { ...alloc.counts, aMin: alloc.cut.aMin, bMin: alloc.cut.bMin };
    const sync = await deps.store.syncTracks(wantedTracks(units, alloc.tiers, alloc.scores, poolOrder, cfg)).catch((e) => { log(`tracks: ${(e as Error).message}`); return null; });
    if (sync) { log(`eBay tracks: ${sync.written} written, ${sync.removed} removed`); tracks = await deps.store.readTracks().catch(() => tracks); }
    log(`eBay tiers: A ${alloc.counts.A} (V >= ${alloc.cut.aMin ?? "-"}c), B ${alloc.counts.B} (V >= ${alloc.cut.bMin ?? "-"}c), C ${alloc.counts.C}, sealed ${alloc.counts.sealed}, chase pool ${poolOrder.length} names; modelled ${Math.round(alloc.daily.total)} calls a day`);
  } else log("eBay: no data checkout (PLANE_REPO unset): tiers and tracks unchanged");

  // ── the allowance ─────────────────────────────────────────────────────────
  const paused = await deps.store.paused().catch(() => false);
  const ourSpend24h = await deps.store.ourSpend24h(now).catch(() => 0);
  const runBase = {
    cfg, now, quota, ledger: ledgerRow ? { cap: ledgerRow.cap, claimed: ledgerRow.claimed, blockedUntil: ledgerRow.blockedUntil } : null, paused, purpose, dispatchCap, ourSpend24h, log: (m: string) => log(m),
  };
  let a = allowanceFor(runBase);
  summary.allowance = a.allowance; summary.budgetDetail = a.detail;
  const finish = async (s: EbayPassSummary): Promise<EbayPassSummary> => {
    if (ledgerRow) {
      const rec: RunRecord = {
        at: now.toISOString(), mode: cfg.keysetMode, purpose, claimed: s.claimed, spent: s.spent, remainingStart: s.remainingStart, remainingEnd: s.remainingEnd, foreignDelta: s.foreignDelta, stop: s.stop ?? s.latched,
        byClass: s.byClass, byMarket: Object.fromEntries(Object.entries(s.byMarket).map(([k, v]) => [k, v.calls])), matched: s.matched, panels: s.panels,
      };
      await deps.ledger.record(windowKey, rec, { ...recordedConfig(cfg), reserve: typeof s.budgetDetail.reserve === "number" ? s.budgetDetail.reserve : null, remaining: s.remainingEnd ?? s.remainingStart, tiers: s.tiers, bannerNames: poolOrder.length, unmatchable: s.unmatchable, modelledDaily: alloc ? Math.round(alloc.daily.total) : null }).catch((e) => log(`ledger record: ${(e as Error).message}`));
    }
    return s;
  };
  if (a.allowance <= 0 || !built || !alloc || !ledgerRow) {
    summary.stop = a.stop ?? (!built ? "no-budget" : "ledger-unreachable");
    log(`eBay: 0 calls (${summary.stop}) ${JSON.stringify(a.detail)}`);
    if (summary.stop === "quota-unreadable" || summary.stop === "ledger-unreachable") annotate("warning", "eBay budget", `no calls this run: ${summary.stop}`);
    return finish(summary);
  }

  // ── quiet check: is anything else (Rift mid-run) draining the quota right now? ──
  if (cfg.keysetMode === "shared" && quota) {
    let ok = false;
    let q = quota;
    for (let i = 0; i < 3 && !ok; i++) {
      await sleep(deps.quietMs ?? 45_000);
      const q2 = trustedQuota(await fetchRemaining());
      if (!q2) { quota = null; break; }
      if (q2.remaining >= q.remaining) ok = true;
      else { q = q2; await sleep((deps.quietMs ?? 45_000) * 5); }
    }
    if (!ok) {
      summary.stop = "foreign-active";
      log("eBay: another app is spending this keyset right now: 0 calls this run");
      annotate("warning", "eBay keyset", "another app is spending the shared quota; this run made no calls");
      return finish(summary);
    }
    quota = q;
    summary.remainingStart = q.remaining;
    a = allowanceFor({ ...runBase, quota: q });
    summary.allowance = a.allowance; summary.budgetDetail = a.detail;
    if (a.allowance <= 0) { summary.stop = a.stop ?? "no-budget"; return finish(summary); }
  }

  // ── plan ──────────────────────────────────────────────────────────────────
  const checks = new Map<string, Date>(tracks.filter((t) => t.checkedAt).map((t) => [pairKey(t.ref, t.market), t.checkedAt!]));
  const markets = only ? [only] : [...SINGLES_MARKETS, "CA" as EbayMarket];
  const due = duePairs({ units, tiers: alloc.tiers, checks, now, cfg, purpose, force, onlyMarket: only }).filter((p) => markets.includes(p.market));
  const spentToday = ledgerRow.breakdown;
  const plan = planRun(due, a.allowance, classAllowance(cfg, spentToday));
  summary.modelled = Math.round(plan.modelled);
  for (const m of [...SINGLES_MARKETS, ...SEALED_MARKETS]) summary.byMarket[m] ??= emptyStats();
  for (const p of due) summary.byMarket[p.market]!.due++;
  for (const p of plan.order) summary.byMarket[p.market]!.planned++;
  log(`eBay plan (${purpose}): ${plan.order.length} pairs, ${Math.round(plan.modelled)} modelled calls of ${a.allowance} allowed; ${plan.overflow.length} more due`);

  // ── search and write, pair by pair ────────────────────────────────────────
  const claimer = new Claimer(deps.ledger, windowKey, () => now);
  setEbayBudget(a.allowance);
  setCallGate(() => claimer.next(a.allowance));
  const poolIds = new Set(poolCandidates.map((c) => c.id));
  const poolFinish = new Map(poolCandidates.map((c) => [c.id, c.finish === "nonfoil" ? ("N" as Finish) : ("F" as Finish)] as const));
  const freshTiles: BannerTile[] = [];
  const clearedTiles: { id: number; market: Country }[] = [];
  const breaker = new FailureBreaker();
  const byClassCalls: Record<string, number> = {};
  let prevRemaining = quota?.remaining ?? null;
  let spentAtCheck = 0;
  let sinceProgress = 0;
  let saw429 = false;

  const searchSingle = async (pair: Pair, n: NameInfo): Promise<{ status: QueryStatus; items: BrowseItem[] }> => {
    const marketplace = EBAY_MARKETPLACE[pair.market as keyof typeof EBAY_MARKETPLACE];
    const floor = Math.min(...n.tracked.flatMap((p) => [p.trackedN ? p.marketN : null, p.trackedF ? p.marketF : null]).filter((x): x is number => x != null));
    const filter = cardFilter(pair.market as Country, Number.isFinite(floor) ? floor : null);
    const q = cardQuery(n.name);
    const r1 = await searchBrowse({ marketplace, q: q.strict, filter, limit: CARD_LIMIT, category: MTG_SINGLES_CATEGORY });
    if (r1.status !== "ok") return { status: r1.status, items: [] };
    if (r1.items.length) return { status: "ok", items: r1.items };
    const r2 = await searchBrowse({ marketplace, q: q.retry, filter, limit: CARD_LIMIT });
    return { status: combineQueries(r1.status, r2.status), items: r2.status === "ok" ? r2.items : [] };
  };

  for (const pair of [...plan.order, ...plan.overflow]) {
    if (isEbayRateLimited()) break;
    const st = summary.byMarket[pair.market] ?? (summary.byMarket[pair.market] = emptyStats());
    const before = ebaySpentThisRun();
    let status: QueryStatus = "failed";
    let write: PairWrite | null = null;
    if (pair.kind === "single") {
      const n = built.names.get(pair.ref);
      if (!n) continue;
      const r = await searchSingle(pair, n);
      status = r.status;
      if (status === "ok") {
        const target = nameTarget(n.name, matchRowsOf(n), unitsOf(n));
        const sc = screenName(r.items, target, pair.market as Country);
        bumpRej(summary.rejects, sc.rejects);
        const slabs = screenGraded(r.items, target, pair.market as Country);
        const best: PairWrite["best"] = [];
        const panels: PairWrite["panels"] = [];
        const picks = new Map<string, EbayListing | null>();
        let any = false;
        const asEntry = (f: Finish, l: EbayListing, rank: number): PanelEntry => ({ finish: FINISH_INDEX[f] as 0 | 1, priceCents: l.priceCents, shipCents: l.shippingCents, currency: l.currency, itemId: l.itemId, title: l.title, image: l.imageUrl, rank });
        for (const p of n.tracked) {
          const byFinish: Partial<Record<Finish, EbayListing[]>> = {};
          const pk: Partial<Record<Finish, EbayListing | null>> = {};
          for (const f of ["N", "F"] as const) {
            if (f === "N" ? !p.trackedN : !p.trackedF) continue;
            const list = sc.byUnit.get(unitKeyOf(p.id, f)) ?? [];
            byFinish[f] = list; pk[f] = pickListing(list);
            picks.set(`${p.id}.${f}`, pk[f] ?? null);
            if (pk[f]) any = true;
            best.push({ productId: p.id, finish: f, market: pair.market as EbayMarket, row: pk[f] ? { priceCents: pk[f]!.priceCents, shipCents: pk[f]!.shippingCents, itemId: pk[f]!.itemId } : null });
          }
          const rows = panelListings(byFinish, pk);
          const graded: GradedEntry[] = (slabs.get(p.id) ?? []).map((g: GradedListing) => ({ grader: g.grader, grade: g.grade, priceCents: g.priceCents, shipCents: g.shippingCents, currency: g.currency, itemId: g.itemId, title: g.title, image: g.imageUrl }));
          panels.push({ productId: p.id, market: pair.market as EbayMarket, listings: rows.map((r2, i) => asEntry(r2.finish, r2.l, i)), graded });
        }
        // CA singles are derived from the US search at no cost, only when the seller is in the US or Canada ("ships from the US" is true)
        if (pair.market === "US") {
          for (const p of n.tracked) for (const f of ["N", "F"] as const) {
            if (f === "N" ? !p.trackedN : !p.trackedF) continue;
            const l = (sc.byUnit.get(unitKeyOf(p.id, f)) ?? []).find((x) => x.location === "US" || x.location === "CA");
            best.push({ productId: p.id, finish: f, market: "CA", row: l ? { priceCents: convertUsdCents(l.priceCents, "CAD"), shipCents: null, itemId: l.itemId } : null });
          }
        }
        write = { ref: pair.ref, market: pair.market, at: now, matched: any, best, panels };
        // the chase pool: the listing of each pool printing of this name in this market (zero extra calls)
        if (poolOrder.includes(pair.ref) && ["US", "UK", "AU", "EU", "CA"].includes(pair.market)) {
          for (const c of poolCandidates.filter((x) => x.nameKey === pair.ref)) {
            const f = poolFinish.get(c.id)!;
            const l = picks.get(`${c.id}.${f}`);
            const p = n.tracked.find((x) => x.id === c.id) ?? n.printings.find((x) => x.id === c.id);
            const listing = l ?? (p && !n.tracked.includes(p) ? pickListing(sc.byUnit.get(unitKeyOf(c.id, f)) ?? []) : null);
            const tile = listing && p ? tileOf({ id: c.id, name: n.name, finish: f, market: pair.market as Country, priceCents: listing.priceCents, shipCents: listing.shippingCents, itemId: listing.itemId, imageUrl: listing.imageUrl, checkedAt: now, setCode: c.setCode, label: p.label, marketCents: c.marketCents }) : null;
            if (tile) freshTiles.push(tile); else clearedTiles.push({ id: c.id, market: pair.market as Country });
          }
        }
      }
    } else {
      const s = built.sealed.get(pair.ref);
      if (!s) continue;
      const target: SealedTarget = { kind: "sealed", id: s.id, name: s.name, marketCents: s.marketCents, refs: [...built.sealed.values()].map((x): SealedRef => ({ id: x.id, name: x.name, setCode: x.setCode, kind: x.kind })) };
      const marketplace = EBAY_MARKETPLACE[pair.market as keyof typeof EBAY_MARKETPLACE];
      const r = await searchBrowse({ marketplace, q: sealedQuery(s.name), filter: sealedFilter(pair.market as Country, s.marketCents), limit: SEALED_LIMIT });
      status = r.status;
      if (r.status === "ok") {
        const sc = screenSealed(r.items, target, pair.market as Country);
        bumpRej(summary.rejects, sc.rejects);
        const pick = pickListing(sc.survivors);
        const list = pruneForPanel(sc.survivors);
        write = {
          ref: pair.ref, market: pair.market, at: now, matched: pick != null,
          best: [{ productId: s.id, finish: "N", market: pair.market as EbayMarket, row: pick ? { priceCents: pick.priceCents, shipCents: pick.shippingCents, itemId: pick.itemId } : null }],
          panels: [{ productId: s.id, market: pair.market as EbayMarket, listings: list.map((l, i) => ({ finish: 0 as const, priceCents: l.priceCents, shipCents: l.shippingCents, currency: l.currency, itemId: l.itemId, title: l.title, image: l.imageUrl, rank: i })), graded: [] }],
        };
      }
    }
    const calls = ebaySpentThisRun() - before;
    st.calls += calls; byClassCalls[pair.cls] = (byClassCalls[pair.cls] ?? 0) + calls;
    if (status === "rate-limited") saw429 = true;
    if (status === "budget") break;
    sinceProgress += calls;
    if (deps.onProgress && sinceProgress >= 100) { sinceProgress = 0; await deps.onProgress(ebaySpentThisRun()).catch(() => {}); }
    const outcome = status === "ok" ? ({ status: "ok", matched: write?.matched ?? false } as const) : ({ status } as const);
    if (pairWrite(outcome).track === "keep") {
      st.failed++;
      if (status === "failed" && breaker.record(true)) {
        summary.breaker = breaker.tripped!;
        log(`eBay: stopping, ${breaker.tripped}`);
        annotate("error", "eBay searches failing", `${breaker.tripped}; stopped after ${ebaySpentThisRun()} calls`);
        break;
      }
      if (status === "rate-limited") break;
      continue;
    }
    breaker.record(false);
    summary.completed++;
    await deps.store.writePair(write!);
    checks.set(pairKey(pair.ref, pair.market), now);
    st.searched++;
    if (write!.matched) { st.matched++; summary.matched++; }
    summary.panels += write!.panels.filter((p) => p.listings.length || p.graded.length).length;
    // every chunk: re-read the free quota; stop at the reserve, pause when someone else is spending
    if (quota && cfg.keysetMode === "shared" && ebaySpentThisRun() - spentAtCheck >= CLAIM_CHUNK) {
      spentAtCheck = ebaySpentThisRun();
      const cur = trustedQuota(await fetchRemaining());
      if (!cur) { summary.latched = "reserve"; log("eBay: the quota became unreadable mid-run: stopping"); break; }
      const foreign = prevRemaining != null ? prevRemaining - CLAIM_CHUNK - cur.remaining : 0;
      prevRemaining = cur.remaining;
      summary.remainingEnd = cur.remaining;
      if (foreign > 10) { log(`eBay: ${foreign} calls spent by another app during the last chunk: pausing`); await sleep((deps.quietMs ?? 45_000) * 6); }
      const reserve = reserveFor(now, cur.reset, cfg);
      if (cur.remaining - reserve < CLAIM_CHUNK) { summary.latched = "reserve"; log(`eBay: remaining ${cur.remaining} is within a chunk of the reserve ${reserve}: stopping`); break; }
    }
  }
  setCallGate(null);
  summary.spent = ebaySpentThisRun();
  summary.claimed = claimer.used;
  summary.byClass = byClassCalls;
  if (isEbayRateLimited() && !summary.latched && !summary.breaker) summary.latched = saw429 ? "429" : "budget";
  if (summary.breaker) summary.latched = "failures";
  if (saw429) { summary.latched = "429"; await deps.ledger.block(windowKey, quota?.reset ?? new Date(now.getTime() + DAY)).catch(() => {}); annotate("warning", "eBay 429", "eBay returned 429: the quota window is blocked, no more calls today"); }
  await claimer.settle(byClassCalls).catch((e) => log(`ledger settle: ${(e as Error).message}`));

  // ── the banner, the sweep, the purge ──────────────────────────────────────
  if (summary.completed > 0) {
    const prev = parsePayload(await deps.store.readBanner().catch(() => null));
    const update: BannerUpdate = { fresh: freshTiles, cleared: clearedTiles, poolIds };
    const payload = mergeBanner(prev, update, now.getTime());
    await deps.store.writeBanner(payload).catch((e) => log(`banner: ${(e as Error).message}`));
    summary.banner = payload.tiles.length;
    await deps.store.sweep(new Date(now.getTime() - 72 * 3_600_000)).catch(() => {});
    if (deps.revalidate) await deps.revalidate().catch((e) => log(`revalidate: ${(e as Error).message}`));
  }
  const fin = quota && cfg.keysetMode === "shared" ? trustedQuota(await fetchRemaining().catch(() => null)) : null;
  if (fin) { summary.remainingEnd = fin.remaining; summary.foreignDelta = quota ? Math.max(0, quota.remaining - summary.spent - fin.remaining) : null; }
  if (summary.foreignDelta != null && summary.foreignDelta > 50) log(`eBay: ${summary.foreignDelta} calls were spent by another app during this run (Rift's jobs)`);
  // The foreign-spend profile of the whole window, for the admin panel and the rise alarm.
  const row = await deps.ledger.read(windowKey).catch(() => null);
  if (row && fin) summary.budgetDetail = { ...summary.budgetDetail, foreignObserved: foreignObserved(fin.limit, fin.remaining, row.spent) };
  for (const m of Object.keys(summary.byMarket)) if (!summary.byMarket[m]!.due && !summary.byMarket[m]!.calls) delete summary.byMarket[m];
  log(`eBay: spent ${summary.spent} calls (modelled ${summary.modelled}), ${summary.completed} searches completed, ${summary.matched} matched${summary.latched ? `; stopped: ${summary.latched}` : ""}`);
  return finish(summary);
}

/** A sealed panel's listings: the survivors after the cheap-outlier prune, at most 8. */
function pruneForPanel(survivors: EbayListing[]): EbayListing[] {
  const out: EbayListing[] = [];
  const seen = new Set<string>();
  const first = pickListing(survivors);
  if (first) { out.push(first); seen.add(first.itemId); }
  for (const l of survivors) if (!seen.has(l.itemId) && out.length < 8) { out.push(l); seen.add(l.itemId); }
  return out;
}
