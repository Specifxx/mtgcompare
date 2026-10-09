// src/lib/import.ts (owner WP01b, FROZEN): the row types of the importer's in-memory MODEL, the context, and the stage functions that other packages call or are called by. Contract section 6.
// WHAT CHANGED against OP's import.ts (a 530-line module that wrote nine tables): the importer reads NOTHING from Neon and writes NOTHING to it but one courtesy ImportRun row. Its memory of last time is a PrevState (plane/prevstate.ts) rebuilt from a depth-1 checkout of the
// pointed data commit; its output is a tree of JSON files (plane/formats.ts) handed to the publisher (plane/publisher.ts) that validates, commits, verifies and points. The stage NAMES survive (importCatalog, aggregate, recordHistory, revalidateSite) so scripts/import.ts reads as before.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { CARD_CLASS, printingOf, CARD_FLAGS, COLOR_BIT, GROUP_TREATMENTS, LINK, NOTPLAY_SET_KINDS, ORACLE_FLAGS, PRICE_MASK, PRIMARY_TYPES, SEALED_KINDS, STALE_HOURS, TREATMENTS, classifyGroup, colorMask, displayName, effectiveRarity, fold, isBucketGroup, joinTreat, legalString, nkey, nsort, oracleFlags, ptypeOf, reskinAlt, type SealedKind, type SetKind, type TreatmentKey } from "./constants";
import { MARKETS, type Country } from "./country";
import type { Finish, Rarity, UnitRef } from "./constants";
import { TCGCSV_BASE, chooseSetToks, finishPrices, isSealedProduct, labelOf, oracleSlugOf, parseSealed, parseTcgName, productClass, sealedSlugOf, setCodeOf, setDisplayName, setSlugOf, slugBase, withProductSuffix, type ParsedName, type PriceRowLike, type TcgcsvGroup, type TcgcsvPrice, type TcgcsvProduct } from "./catalog";
import { completenessPicks, flagChangeGuard, headlineOf, inCatalogue, isIndexable, isThin, marketOnlyCents, popularity, trackConfigHash, trackScoreCents, unitTracked, unitValueCents, type GuardVerdict, type TrackConfig } from "./track";
import { addDays, dayIso, dayNum, daysBetween, nextIndex } from "./history";
import { usdCentsToCountry, toUsdCents } from "./fx";
import { buildScryfallIndex, claimByIds, fetchBulkListing, fetchSets, joinProduct, parseSets, slimScryfall, streamDefaultCards, streamDefaultCardsFile, strictOracleName, type JoinResult, type LinkLevel, type ScryfallRow, type ScryfallSet } from "./scryfall";
import type { MatchRow } from "./match";
import { isOrdinaryPrinting, ordinaryRank, type PrintingFacts } from "./search";
import type { StoreResult } from "./stores";
import type { PrevState } from "./data/plane/prevstate";
import { memTree, type MutableTree, type TreeView } from "./data/plane/tree";
import { reconcileStoreFamilies } from "./data/plane/reconcile";
import type { Phase } from "./data/plane/validate";
import type { BoardRow, CatRow, HistFile, HistTailFile, HomeFile, HomeTileRow, IndexSeriesFile, IxDict, IxF, IxK, IxO, IxOdict, IxP, IxS, MarketFile, MoverRow, MoversFile, NameFile, NameRow, OfferFile, OfferTuple, PointerFile, PxRow, RecordsFile, ScrySetsFile, SealedDetailFile, SealedListFile, SealedOfferTuple, SealedRow, SeriesV4, SetsFile, SitemapPlanFile, SlugShard, StoreRunRow, StoreRunsFile, StoreListingsFile, UnFile, UnRow, WeeklyFile } from "./data/plane/formats";
import { PLANE_PREFIX, SEALED_FLAGS } from "./data/plane/formats";
import { appendDay, decodeDense, encodeRuns, endDayOf, mergeTail, spanOf } from "./data/plane/history-codec";
import { BOARD_CHUNK, IX_CHUNK, IX_FLAT_CHUNK, NAME_CHUNK, SEALED_LIST_CHUNK, SITEMAP_SECTION, bucketPath, cardBucket, histBucket, hex2, hex3, ixPath, moversPath, oracleShard, scShard, slugShard, sealedDetailPath, sealedListPath, storeListingsPath, tailBucket, weeklyPath, boardPath, nameChunkPath, sitemapPath, fnv1a32 } from "./data/plane/shards";
import { HIST_CUT_DAYS, isCutDay } from "./data/plane/publish-protocol";

// ── the model: one row per catalogue object, in memory (never a table). The writers of plane/formats.ts turn them into files. ─────────────────────────────────────────────
export interface SetRow { id: number; slug: string; tok: string; code: string; name: string; tcgName: string; kind: SetKind; releasedOn: string | null; bucket: boolean; scry: string | null; abbr?: string | null }
export interface OracleRow { no: number; scryfallId: string; slug: string; name: string; nameKey: string; manaCost: string; manaValue: number; typeLine: string; colors: number; identity: number; legal: string; edhrecRank: number | null; flags: number; layout: string; pt: string | null; loyalty: string | null; oracleText: string | null; keywords: string; faces: number; nPrint: number }
export interface CardRow { id: number; slug: string; name: string; alt: string | null; tcgName: string; setId: number; sc: string | null; number: string | null; tn: string | null; fnum: string | null; nkey: string | null; nsort: number; rarity: Rarity; cls: number; treat: string; label: string | null; flags: number; link: number; oracleNo: number | null; scryId: string | null; rootId: number | null; colors: number; mv: number; ptype: number }
export interface CardPriceRow { cardId: number; marketN: number | null; marketF: number | null; lowN: number | null; lowF: number | null; mask: number }
export interface SealedModelRow { id: number; slug: string; name: string; setId: number | null; kind: SealedKind; packCount: number | null; releasedOn: string | null; presale: boolean; marketUsd: number | null; lowTcg: number | null; contents: string | null; gone: boolean }
/** One per catalogue product after the join. `row` is the primary Scryfall printing (null when unjoined): WP05's chase pool reads layout, setType, releasedAt, imageStatus, fullArt, frameEffects, promoTypes, edhrecRank, reserved from it. */
export interface JoinedProduct { id: number; linkLevel: LinkLevel; row: ScryfallRow | null; starRow: ScryfallRow | null; oracleNo: number | null; rootId: number | null }
/** The catalogue of one run. The optional fields are additive (amendment A1): `absent` = products and sealed products the run did not see (their published rows are carried, with the new mask), `scrySets` = the origin sets for meta/scrysets.json, `stamps` = the source stamps. */
export interface CatalogueSnapshot {
  day: string; sets: SetRow[]; oracles: OracleRow[]; cards: CardRow[]; prices: CardPriceRow[]; sealed: SealedModelRow[]; units: UnitRef[];
  absent?: { cards: [id: number, mask: number][]; sealed: [id: number, flags: number][]; sets: SetRow[] };
  scrySets?: ScryfallSet[]; stamps?: { tcgcsv: string; scryfall: string };
}
/** Fresh store listings of this run (amendment A1, requested of WP04 as REQ-WP01b-1): importStores pushes every listing it matched; aggregate folds them. `reads` has one entry per (store id, market) pair it READ: a pair with ok false keeps its previous rows and its previous run row. */
export interface StagedOffer { uid: number; market: number; store: number; priceCents: number; condition: number | null; inStock: 0 | 1; path: string }
export interface StagedSealedOffer { productId: number; market: number; store: number; priceCents: number; condition: number | null; inStock: 0 | 1; path: string }
export interface StagedRead { store: number; market: number; ok: boolean; at: string }
export interface OfferStage { cards: StagedOffer[]; sealed: StagedSealedOffer[]; reads: StagedRead[]; asOf?: string }
/** Everything a stage needs. `prev` is the importer's memory (6.2); `work` is the v1/ tree being built (a copy of the previous tree under the publisher); `phase` says which families this run may write (`catalog` = everything except the store families, `full` = all). */
export interface ImportContext {
  log: (...a: unknown[]) => void; day: string; cfg: TrackConfig; prev: PrevState; phase: Phase; work: MutableTree;
  snapshot: CatalogueSnapshot; match: MatchRow[]; joined: ReadonlyMap<number, JoinedProduct>; tracked: ReadonlySet<number> /* uid */;
  offers?: OfferStage;
}
export interface CatalogResult { summary: Partial<ImportSummaryV1>; guards: { flagChange: string | null; groupHold: number[]; storeHold: string[]; configChanged: boolean; countsOk: boolean }; groups: [groupId: number, products: number, priced: number][] }
export interface HistoryResult { day: string; units: number; files: number; cut: boolean; skipped?: string }
export interface ImportSummaryV1 {
  v: 1; priceDay: string; mode: Phase;
  tcgcsv?: { lastUpdated: string; groups: number; products: number; singles: number; sealed: number; priceRows: number; bytes: number };
  scryfall?: { mode: "fresh" | "cached" | "off"; updatedAt: string; rows: number };
  catalogue?: { rows: number; added: number; listed: number; unlisted: number; gone: number; trackedCards: number; units: number; oracles: number; specials: number; reservedUnpriced: number; offersPruned: number };
  writes?: { filesWritten: number; filesUnchanged: number; filesRemoved: number; bytes: number };
  history?: HistoryResult;
  stores?: StoreResult[];
  magic?: { join: Record<LinkLevel, number>; unjoinedCatalogue: number; reskins: number; reskinAmbiguous: number; etchedFlagged: number; etchedAnomalies: number; sharedPairs: number; sharedOdd: number; finishConflicts: number; classCounts: Record<string, number>; classDemoted: number; unknownWords: [string, number][]; treatDisagree: number; unknownSubtypes: string[]; unknownFormats: string[]; unknownLayouts: string[]; slugSuffixed: number; noNumber: number };
  guards?: { flagChange?: string; priceSanity?: string; degraded?: string[] };
  timings?: Record<string, number>; failsafe?: string; error?: string; neon?: "recorded" | "skipped" | "failed";
}

type Log = ImportContext["log"];
const j = (v: unknown): string => JSON.stringify(v);
const lines = (rows: unknown[]): string => rows.map(j).join(",\n");
const z = <T,>(v: T | null | undefined): T | 0 => (v == null || (v as unknown) === "" ? 0 : v);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const UA = "MTGCompare-build/0.1 (+https://github.com/Specifxx/mtgcompare)";
const FINISHES: readonly Finish[] = ["N", "F"];

/** Counters of one file-writing pass: a file is rewritten only if its bytes differ. */
class Writer {
  written = 0; unchanged = 0; removed = 0; bytes = 0; private keep = new Set<string>();
  constructor(readonly t: MutableTree) {}
  put(rel: string, text: string): void {
    this.keep.add(rel); this.bytes += Buffer.byteLength(text);
    if (this.t.has(rel) && this.t.read(rel) === text) { this.unchanged++; return; }
    this.t.write(rel, text); this.written++;
  }
  /** Remove the files of a family this pass owns that it did not write (a bucket that emptied, a board that shrank). */
  sweep(test: (rel: string) => boolean): void { for (const f of this.t.files()) if (test(f) && !this.keep.has(f)) { this.t.remove(f); this.removed++; } }
  has(rel: string): boolean { return this.keep.has(rel); }
  stats(): { written: number; unchanged: number; removed: number; bytes: number } { return { written: this.written, unchanged: this.unchanged, removed: this.removed, bytes: this.bytes }; }
}
const readJson = <T,>(t: TreeView, rel: string): T | null => { if (!t.has(rel)) return null; try { return JSON.parse(t.read(rel)) as T; } catch { return null; } };

// ── S1: TCGCSV ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TcgDay {
  lastUpdated: string;                       // ISO, second precision, Z
  groups: TcgcsvGroup[]; products: Map<number, TcgcsvProduct[]>; prices: Map<number, TcgcsvPrice[]>;
  requests: number; bytes: number; failed: number[];
}
const normStamp = (s: string): string => { const d = new Date(s.trim().replace(/([+-]\d\d)(\d\d)$/, "$1:$2").replace(/\+00:00$/, "Z")); return Number.isFinite(d.getTime()) ? d.toISOString().replace(/\.\d{3}Z$/, "Z") : s.trim(); };
function cacheFile(dir: string, rel: string): string | null {
  const a = path.join(dir, `${rel}.json`), b = path.join(dir, `${rel.replace(/\//g, "_")}.json`);          // <dir>/<gid>/products.json (the research layout) or <dir>/<gid>_products.json (OP's)
  return fs.existsSync(a) ? a : fs.existsSync(b) ? b : null;
}
/** The TCGCSV source stamp (last-updated.txt, normalised to second precision with a Z): the priceDay is the UTC date of THIS, never of the cron. An explicit value (tests, TCGCSV_LAST_UPDATED), then the cache directory's last-updated.txt, then the response header of the cached groups file, then the network. */
export async function tcgcsvStamp(o: { cacheDir?: string; fetch?: typeof fetch; lastUpdated?: string }, fetchText?: (url: string) => Promise<string>): Promise<string> {
  let stamp = o.lastUpdated ?? process.env.TCGCSV_LAST_UPDATED ?? "";
  if (!stamp && o.cacheDir && fs.existsSync(path.join(o.cacheDir, "last-updated.txt"))) stamp = fs.readFileSync(path.join(o.cacheDir, "last-updated.txt"), "utf8");
  if (!stamp && o.cacheDir && fs.existsSync(path.join(o.cacheDir, "groups.hdr"))) { const m = /last-modified:\s*(.+)/i.exec(fs.readFileSync(path.join(o.cacheDir, "groups.hdr"), "utf8")); if (m) stamp = new Date(m[1]!.trim()).toISOString(); }
  if (!stamp) {
    const get = fetchText ?? (async (url: string): Promise<string> => { const res = await (o.fetch ?? fetch)(url, { headers: { "User-Agent": UA }, cache: "no-store" } as RequestInit); if (!res.ok) throw new Error(`TCGCSV ${url}: HTTP ${res.status}`); return res.text(); });
    stamp = await get("https://tcgcsv.com/last-updated.txt");
    if (o.cacheDir) { fs.mkdirSync(o.cacheDir, { recursive: true }); fs.writeFileSync(path.join(o.cacheDir, "last-updated.txt"), stamp); }
  }
  return normStamp(stamp);
}
/** The Scryfall source stamp (the `updated_at` of the default_cards listing) without downloading anything; "" when Scryfall is off or unreachable (the build then refuses or degrades, F4). */
export async function scryfallStamp(o: { pinnedDir?: string; mode?: "auto" | "off"; fetch?: typeof fetch }): Promise<string> {
  if (o.mode === "off") return "";
  if (o.pinnedDir) {
    const meta = path.join(o.pinnedDir, "default_cards.meta.json");
    if (fs.existsSync(meta)) return String((JSON.parse(fs.readFileSync(meta, "utf8")) as { updated_at?: string }).updated_at ?? "");
    const f = findFile(o.pinnedDir, /^default[-_]cards.*\.(jsonl|ndjson)(\.gz)?$/); const m = f ? /(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/.exec(path.basename(f)) : null;
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00` : "";
  }
  try { return (await fetchBulkListing({ fetch: o.fetch })).updatedAt; } catch { return ""; }
}
/** S1: GET groups, then products and prices of every included group. 4 workers, a 120 ms pause after each request, 3 attempts with 1 to 3 s back-off, the build User-Agent, never a personal e-mail. A group whose two files cannot be read is listed in `failed`
 *  (F1: the caller refuses the run). With a cache directory every file is read from it when present and written to it when fetched. */
export async function loadTcgcsv(o: { cacheDir?: string; log: Log; fetch?: typeof fetch; pick?: ((groups: TcgcsvGroup[]) => ReadonlySet<number>) | null; workers?: number; pauseMs?: number; lastUpdated?: string }): Promise<TcgDay> {
  const f = o.fetch ?? fetch; const out: TcgDay = { lastUpdated: "", groups: [], products: new Map(), prices: new Map(), requests: 0, bytes: 0, failed: [] };
  const fetchText = async (url: string): Promise<string> => {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { out.requests++; const res = await f(url, { headers: { "User-Agent": UA, Accept: "application/json, text/plain" }, cache: "no-store" } as RequestInit); if (!res.ok) throw new Error(`TCGCSV ${url}: HTTP ${res.status}`); const text = await res.text(); out.bytes += text.length; return text; }
      catch (e) { last = e; await sleep(1000 * (attempt + 1)); }
    }
    throw last;
  };
  const get = async <T,>(rel: string): Promise<T> => {
    const hit = o.cacheDir ? cacheFile(o.cacheDir, rel) : null;
    if (hit) { const text = fs.readFileSync(hit, "utf8"); out.bytes += text.length; return JSON.parse(text) as T; }
    const text = await fetchText(`${TCGCSV_BASE}/${rel}`);
    const parsed = JSON.parse(text) as T;
    if (o.cacheDir) { const file = path.join(o.cacheDir, `${rel}.json`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
    return parsed;
  };
  const stamp = await tcgcsvStamp({ cacheDir: o.cacheDir, fetch: f, lastUpdated: o.lastUpdated }, fetchText);
  out.lastUpdated = stamp;
  const gj = await get<{ results: TcgcsvGroup[] }>("groups");
  out.groups = gj.results; o.log(`TCGCSV: ${out.groups.length} Magic groups, last updated ${out.lastUpdated}`);
  const chosen = o.pick ? o.pick(out.groups) : null;
  const todo = out.groups.filter((g) => { const k = classifyGroup(g); return k !== "foreign" && k !== "non-card" && (!chosen || chosen.has(g.groupId)); });
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(o.workers ?? 4, todo.length) }, async () => {
    while (i < todo.length) {
      const g = todo[i++]!;
      try {
        const [p, pr] = await Promise.all([get<{ results?: TcgcsvProduct[] }>(`${g.groupId}/products`), get<{ results?: TcgcsvPrice[] }>(`${g.groupId}/prices`)]);
        out.products.set(g.groupId, p.results ?? []); out.prices.set(g.groupId, pr.results ?? []);
      } catch (e) { out.failed.push(g.groupId); o.log(`TCGCSV: group ${g.groupId} (${g.name}) failed: ${String(e).slice(0, 120)}`); }
      if (!o.cacheDir || !cacheFile(o.cacheDir, `${g.groupId}/products`)) await sleep(o.pauseMs ?? 120);
    }
  }));
  return out;
}

// ── S2: Scryfall ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ScryfallLoad { mode: "fresh" | "cached" | "off"; updatedAt: string; rows: ScryfallRow[]; sets: ScryfallSet[] }
const writeSlim = (file: string, rows: ScryfallRow[]): void => { fs.mkdirSync(path.dirname(file), { recursive: true }); const gz = zlib.createGzip(); const out = fs.createWriteStream(file); gz.pipe(out); for (const r of rows) gz.write(`${j(r)}\n`); gz.end(); };
const findFile = (dir: string, rx: RegExp): string | null => { if (!fs.existsSync(dir)) return null; const hits = fs.readdirSync(dir).filter((f) => rx.test(f)).sort(); return hits.length ? path.join(dir, hits[hits.length - 1]!) : null; };
/** S2. `pinnedDir` (SCRYFALL_CACHE_DIR): a directory that holds a default_cards download (default-cards-*.jsonl.gz or default_cards.jsonl[.gz]) and sets.json; used as is, NO network. `slimDir` (the Actions cache): scryfall-slim-<updated_at>.ndjson.gz of an earlier run, used when
 *  the bulk listing says the same build. A failed listing or download is returned as `off` (F4); the caller decides whether a prices-only run is acceptable. */
export async function loadScryfall(o: { pinnedDir?: string; slimDir?: string; mode?: "auto" | "off"; log: Log; fetch?: typeof fetch }): Promise<ScryfallLoad> {
  if (o.mode === "off") return { mode: "off", updatedAt: "", rows: [], sets: [] };
  const rows: ScryfallRow[] = []; const onRow = (r: ScryfallRow): void => { rows.push(r); };
  const setsFrom = (file: string | null): ScryfallSet[] => (file && fs.existsSync(file) ? parseSets(JSON.parse(fs.readFileSync(file, "utf8"))) : []);
  if (o.pinnedDir) {
    const raw = findFile(o.pinnedDir, /^(default[-_]cards.*\.(jsonl|ndjson)(\.gz)?|scryfall-slim-.*\.ndjson\.gz)$/);
    if (!raw) throw new Error(`SCRYFALL_CACHE_DIR ${o.pinnedDir} holds no default_cards file`);
    const t0 = Date.now(); const st = await streamDefaultCardsFile(raw, onRow);
    let updatedAt = ""; const meta = path.join(o.pinnedDir, "default_cards.meta.json");
    if (fs.existsSync(meta)) updatedAt = String((JSON.parse(fs.readFileSync(meta, "utf8")) as { updated_at?: string }).updated_at ?? "");
    if (!updatedAt) { const m = /(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/.exec(path.basename(raw)); updatedAt = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00` : new Date(fs.statSync(raw).mtimeMs).toISOString(); }
    o.log(`Scryfall: ${rows.length} paper printings of ${st.rows} read from ${path.basename(raw)} in ${Date.now() - t0} ms (pinned directory, no network)`);
    return { mode: "cached", updatedAt, rows, sets: setsFrom(findFile(o.pinnedDir, /^(scryfall-)?sets.*\.json$/)) };
  }
  try {
    const listing = await fetchBulkListing({ fetch: o.fetch });
    const slim = o.slimDir ? path.join(o.slimDir, `scryfall-slim-${listing.updatedAt.replace(/[^0-9A-Za-z]/g, "")}.ndjson.gz`) : null;
    const setsFile = o.slimDir ? path.join(o.slimDir, `scryfall-sets-${listing.updatedAt.replace(/[^0-9A-Za-z]/g, "")}.json`) : null;
    if (slim && fs.existsSync(slim) && setsFile && fs.existsSync(setsFile)) {
      await streamDefaultCardsFile(slim, onRow); o.log(`Scryfall: ${rows.length} printings from the Actions cache (${listing.updatedAt})`);
      return { mode: "cached", updatedAt: listing.updatedAt, rows, sets: setsFrom(setsFile) };
    }
    const t0 = Date.now(); const st = await streamDefaultCards(listing.jsonlUrl, onRow, { fetch: o.fetch });
    const sets = await fetchSets({ fetch: o.fetch });
    if (slim && setsFile) { writeSlim(slim, rows); fs.writeFileSync(setsFile, j({ data: sets.map((s) => ({ code: s.code, name: s.name, set_type: s.setType, tcgplayer_id: s.tcgplayerId, released_at: s.releasedAt, parent_set_code: s.parentSetCode, digital: s.digital })) })); }
    o.log(`Scryfall: ${rows.length} paper printings of ${st.rows} downloaded in ${Date.now() - t0} ms (${listing.updatedAt})`);
    return { mode: "fresh", updatedAt: listing.updatedAt, rows, sets };
  } catch (e) {
    o.log(`Scryfall: unavailable (${String(e).slice(0, 160)}); the run continues without it`);
    return { mode: "off", updatedAt: "", rows: [], sets: [] };
  }
}

// ── S0b..S7: parse, classify, join, select ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** data/slug-seed.json (scripts/slug-seed.ts): the fallback memory of a first run or a lost branch, so a rebuilt catalogue reproduces every URL a search engine already knows. */
export interface SlugSeed { v: 1; toks: Record<string, string>; cards: Record<string, string>; oracles: Record<string, string> }
export interface ImportOpts {
  cacheDir?: string; scryfallCacheDir?: string; bootstrapGroups?: number;
  /** Additive (amendment A1): the Actions cache directory of the slim Scryfall file, the previous tree (carried rows, oracle uuids, sealed slugs), the Scryfall mode, the slug seed, a fetch for tests and a fixed TCGCSV stamp. */
  slimDir?: string; scryfall?: "auto" | "off"; tree?: TreeView; slugSeed?: SlugSeed | null; fetch?: typeof fetch; lastUpdated?: string;
}
const LINK_OF: Record<LinkLevel, number> = { id: LINK.ID, etched: LINK.ETCHED, fallback: LINK.FALLBACK, variant: LINK.VARIANT, "oracle-name": LINK.ORACLE_NAME, none: LINK.NONE };
const KNOWN_LAYOUTS: ReadonlySet<string> = new Set(["normal", "split", "flip", "transform", "modal_dfc", "meld", "leveler", "class", "case", "saga", "adventure", "mutate", "prototype", "battle", "planar", "scheme", "vanguard", "token", "double_faced_token", "emblem", "augment", "host", "art_series", "reversible_card", "prepare"]);
const SF_KINDS: ReadonlySet<string> = new Set(["frame", "art", "serial", "edition", "promo"]);
const ed = (p: TcgcsvProduct, k: string): string | null => p.extendedData?.find((e) => e.name === k)?.value ?? null;
const CLASS_NAME = ["card", "token", "art", "oversized", "helper"] as const;
const MIN_PARSE_RATIO = (): number => { const v = Number(process.env.IMPORT_MIN_PARSE_RATIO); return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.9; };
const STAR_BITS = PRICE_MASK.TRACKN | PRICE_MASK.TRACKF;
const FLAG_BITS = PRICE_MASK.LISTED | PRICE_MASK.THIN | STAR_BITS;                    // what F10 may veto
const OFFERS_PER_UNIT = 7.13;                                                      // measured on the OP and lab stage-2 tables; the offer budget guard divides by it
const SEALED_GONEP = 4;                                                            // sealed flags bit (additive to SEALED_FLAGS): absent from ONE complete day; GONE (2) is set on the second

interface Single {
  p: TcgcsvProduct; g: TcgcsvGroup; kind: SetKind; id: number; name: string; tcgNumber: string | null; tcgRarity: string; parsed: ParsedName;
  n: PriceRowLike | null; f: PriceRowLike | null; cls0: number; join: JoinResult; cls: number; row: ScryfallRow | null; starRow: ScryfallRow | null; oracleId: string | null; link: number; alt: string | null; reskinOk: boolean;
}
interface PricedCard { c: CardRow; pr: CardPriceRow; single: Single; oracleKey: string | null; score: number; pop: number; reserved: boolean; vn: { cents: number; lowBasis: boolean } | null; vf: { cents: number; lowBasis: boolean } | null; wasMask: number | undefined }

function pickBootstrap(n: number): (groups: TcgcsvGroup[]) => Set<number> {
  const BIG = new Set([2576, 92, 2715]);                         // Secret Lair Drop Series, Prerelease Cards, The List Reprints: the three biggest bucket groups
  return (groups) => {
    const usable = groups.filter((g) => { const k = classifyGroup(g); return k !== "foreign" && k !== "non-card"; });
    const out = new Set<number>(usable.filter((g) => BIG.has(g.groupId)).map((g) => g.groupId));
    const dated = usable.filter((g) => !isBucketGroup(g) && g.publishedOn <= new Date().toISOString()).sort((a, b) => (a.publishedOn < b.publishedOn ? 1 : a.publishedOn > b.publishedOn ? -1 : b.groupId - a.groupId));
    for (const g of dated) { if (out.size >= n) break; out.add(g.groupId); }
    return out;
  };
}
/** Read what a published tree remembers that PrevState does not carry: set rows (a group that left TCGCSV keeps its set), the oracle uuid -> ordinal map, the sealed slugs and flags. Empty for an empty tree. */
function carryOf(tree: TreeView | undefined): { sets: SetRow[]; oracleByUuid: Map<string, { no: number; slug: string }>; sealed: Map<number, { slug: string; flags: number; setId: number }>; setOf: Map<number, number> } {
  const out = { sets: [] as SetRow[], oracleByUuid: new Map<string, { no: number; slug: string }>(), sealed: new Map<number, { slug: string; flags: number; setId: number }>(), setOf: new Map<number, number>() };
  if (!tree) return out;
  const sets = readJson<SetsFile>(tree, "meta/sets.json");
  for (const r of sets?.sets ?? []) out.sets.push({ id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[5] || r[4], kind: r[6] as SetKind, releasedOn: r[7] || null, bucket: r[8] === 1, scry: r[9] || null });
  for (const f of tree.files()) {
    if (f.startsWith("or/")) { for (const r of readJson<{ o: (string | number)[][] }>(tree, f)?.o ?? []) out.oracleByUuid.set(String(r[1]), { no: Number(r[0]), slug: String(r[2]) }); }
    else if (f.startsWith("cat/")) { for (const r of readJson<{ c: CatRow[] }>(tree, f)?.c ?? []) out.setOf.set(r[0], r[4]); }
    else if (/^sl\/list-\d+\.json$/.test(f)) { for (const r of readJson<SealedListFile>(tree, f)?.s ?? []) out.sealed.set(r[0], { slug: r[1], flags: r[7], setId: Number(r[3]) || 0 }); }
  }
  return out;
}
const bareOracle = (name: string, id: string): string => { const b = oracleSlugOf({ id, name }, false); return b; };

export async function importCatalog(base: Pick<ImportContext, "log" | "cfg" | "prev">, opts: ImportOpts = {}): Promise<{ ctx: ImportContext; result: CatalogResult }> {
  const { log, cfg } = base; let prev = base.prev; const timings: Record<string, number> = {}; let tick = Date.now();
  const lap = (k: string): void => { const n = Date.now(); timings[k] = n - tick; tick = n; };
  const seed = prev.empty ? opts.slugSeed ?? null : null;
  const carry = carryOf(opts.tree); lap("carry");
  // S1: TCGCSV
  const tcg = await loadTcgcsv({ cacheDir: opts.cacheDir, log, fetch: opts.fetch, pick: opts.bootstrapGroups ? pickBootstrap(opts.bootstrapGroups) : null, lastUpdated: opts.lastUpdated }); lap("tcgcsv");
  if (tcg.failed.length) throw new Error(`F1: ${tcg.failed.length} included group(s) could not be read (${tcg.failed.slice(0, 5).join(", ")}): the day is incomplete, nothing is published`);
  const day = tcg.lastUpdated.slice(0, 10);
  const incl = tcg.groups.filter((g) => tcg.products.has(g.groupId));
  // S2: Scryfall
  const sf = await loadScryfall({ pinnedDir: opts.scryfallCacheDir, slimDir: opts.slimDir, mode: opts.scryfall, log, fetch: opts.fetch }); lap("scryfall");
  if (sf.mode === "off" && opts.scryfall !== "off") throw new Error("F4: Scryfall is unavailable; the catalogue cannot be joined (set SCRYFALL_MODE=off to publish prices only)");
  if (sf.mode === "off") throw new Error("SCRYFALL_MODE=off needs the prices-only path of a published catalogue, which this importer does not run yet: keep the previous publish (it is still live)");
  const idx = buildScryfallIndex(sf.rows, sf.sets); lap("index");
  const setCodes = new Set<string>([...sf.sets.map((s) => s.code.toLowerCase()), ...incl.map((g) => (g.abbreviation ?? "").toLowerCase()).filter(Boolean)]);
  // S3: parse and classify every product of the included groups
  const kinds = new Map<number, SetKind>(); for (const g of incl) kinds.set(g.groupId, classifyGroup(g) as SetKind);
  const singles: Single[] = []; const sealedIn: { p: TcgcsvProduct; g: TcgcsvGroup; kind: SetKind; n: PriceRowLike | null; f: PriceRowLike | null }[] = [];
  const groupStat = new Map<number, [number, number]>(); const unknownSubtypes = new Set<string>(); let priceRows = 0;
  const gById = new Map<number, TcgcsvGroup>(incl.map((g) => [g.groupId, g]));
  for (const g of incl) {
    const kind = kinds.get(g.groupId)!; const rowsOf = new Map<number, TcgcsvPrice[]>();
    for (const r of tcg.prices.get(g.groupId) ?? []) { priceRows++; const a = rowsOf.get(r.productId); if (a) a.push(r); else rowsOf.set(r.productId, [r]); }
    let pricedN = 0; const prods = tcg.products.get(g.groupId) ?? [];
    for (const p of prods) {
      const fp = finishPrices(rowsOf.get(p.productId) ?? []); for (const u of fp.unknownSubtypes) unknownSubtypes.add(u);
      const n = fp.n && (fp.n.marketCents != null || fp.n.lowCents != null) ? fp.n : null, f = fp.f && (fp.f.marketCents != null || fp.f.lowCents != null) ? fp.f : null;
      if (isSealedProduct(p)) { sealedIn.push({ p, g, kind, n, f }); if (n || f) pricedN++; continue; }
      if (n || f) pricedN++;
      const tcgRarity = ed(p, "Rarity") ?? "S";
      const parsed = parseTcgName(p.name, { setCodes, groupKind: kind });
      const cls0 = productClass({ name: p.name, rarity: tcgRarity }, kind, null);
      singles.push({ p, g, kind, id: p.productId, name: p.name, tcgNumber: ed(p, "Number"), tcgRarity, parsed, n, f, cls0, join: null as never, cls: cls0, row: null, starRow: null, oracleId: null, link: 0, alt: null, reskinOk: false });
    }
    groupStat.set(g.groupId, [prods.length, pricedN]);
  }
  lap("parse");
  // F2: a partial day never nulls or deletes; F2b: a group that vanished or shrank under 90% is HELD
  const ratio = MIN_PARSE_RATIO(); const restricted = !!opts.bootstrapGroups;
  if (!prev.empty && !restricted) {
    let pp = 0, pr = 0; for (const [a, b] of prev.groups.values()) { pp += a; pr += b; }
    let cp = 0, cr = 0; for (const [a, b] of groupStat.values()) { cp += a; cr += b; }
    if (pp > 1000 && (cp < pp * ratio || cr < pr * ratio)) throw new Error(`F2: ${cp} products and ${cr} priced against ${pp} and ${pr} in the last publish (under ${ratio * 100}%): the day looks partial, nothing is published`);
  }
  const held = new Set<number>(); const heldGroupRows = new Map<number, [number, number]>();
  if (!prev.empty && !restricted) for (const [gid, [pp, pr]] of prev.groups) { const cur = groupStat.get(gid); if (pp > 0 && (!cur || cur[0] < pp * 0.9 || cur[1] < pr * 0.9)) { held.add(gid); heldGroupRows.set(gid, [pp, pr]); } }
  // S4: join (pass 1 claims printings by id, pass 2 runs the chain; the class is decided before and refined after)
  const { claimed, memory } = claimByIds(singles.map((x) => ({ productId: x.id, groupId: x.g.groupId, single: true })), idx);
  const joinCount: Record<LinkLevel, number> = { id: 0, etched: 0, fallback: 0, variant: 0, "oracle-name": 0, none: 0 };
  let sharedPairs = 0, sharedOdd = 0, etchedAnomalies = 0, classDemoted = 0, reskins = 0, reskinAmbiguous = 0;
  const classCounts: Record<string, number> = {};
  for (const x of singles) {
    const r = joinProduct({ productId: x.id, groupId: x.g.groupId, name: x.name, number: x.tcgNumber, cls: x.cls0 }, { name: x.g.name, abbreviation: x.g.abbreviation ?? "", kind: x.kind }, idx, claimed, memory);
    x.join = r;
    // a dash that reads "<printed name> - <oracle name>" and no printing was found: the oracle-name index decides which side is the oracle (R4), ambiguity keeps the whole core
    if (r.linkLevel === "none" && x.cls0 === 0 && x.parsed.dash?.kind === "reskin?") {
      const oh = idx.oracleByNameKey.get(fold(x.parsed.dash.head)), ot = idx.oracleByNameKey.get(fold(x.parsed.dash.tail));
      const one = (s: Set<string> | undefined): string | null => (s && s.size === 1 ? [...s][0]! : null);
      if (one(oh) && !ot) { x.join = { ...r, linkLevel: "oracle-name", oracleId: one(oh), ambiguous: false }; x.alt = x.parsed.dash.tail; x.reskinOk = true; }
      else if (one(ot) && !oh) { x.join = { ...r, linkLevel: "oracle-name", oracleId: one(ot), ambiguous: false }; x.alt = x.parsed.dash.head; x.reskinOk = true; }
      else if (oh && ot) reskinAmbiguous++;
    }
    joinCount[x.join.linkLevel]++;
    if ((x.join.linkLevel === "id" || x.join.linkLevel === "etched") && (idx.byTcgId.get(x.id)?.length ?? 0) > 1) { if (x.join.starRow) sharedPairs++; else sharedOdd++; }
    if (idx.byTcgId.has(x.id) && idx.byEtchedId.has(x.id)) etchedAnomalies++;
    const sfRef = x.join.row ? { layout: x.join.row.layout, oversized: x.join.row.oversized } : null;
    x.cls = sfRef ? productClass({ name: x.name, rarity: x.tcgRarity }, x.kind, sfRef) : x.cls0;
    if (x.cls !== 0 && x.cls0 === 0) classDemoted++;
    classCounts[CLASS_NAME[x.cls] ?? String(x.cls)] = (classCounts[CLASS_NAME[x.cls] ?? String(x.cls)] ?? 0) + 1;
    if (x.cls === 0) { x.row = x.join.row; x.starRow = x.join.starRow; x.oracleId = x.join.oracleId; x.link = LINK_OF[x.join.linkLevel]; }      // C11: a token or art card has no oracle and link NONE
  }
  lap("join");
  // oracles: the best printing per oracle (latest released, never a reversible_card unless it is the only one), the earliest release for the bare-slug right
  const best = new Map<string, ScryfallRow>(), firstRelease = new Map<string, string>();
  for (const r of sf.rows) {
    if (!r.oracleId || r.layout === "token" || r.layout === "double_faced_token" || r.layout === "emblem" || r.layout === "art_series") continue;
    const cur = best.get(r.oracleId);
    if (!cur || (cur.layout === "reversible_card") || (r.layout !== "reversible_card" && cur.releasedAt < r.releasedAt)) best.set(r.oracleId, r);        // the latest printing that is not a reversible_card; the first seen wins a tie
    const fr = firstRelease.get(r.oracleId); if (!fr || r.releasedAt < fr) firstRelease.set(r.oracleId, r.releasedAt);
  }
  for (const x of singles) if (x.cls === 0 && x.oracleId && !best.has(x.oracleId)) x.oracleId = null;
  const unknownFormats = new Set<string>(); let unknownStatuses = 0; const unknownLayouts = new Set<string>();
  const nameOfBest = (r: ScryfallRow): string => (r.layout === "reversible_card" ? r.faces[0] ?? r.name : r.name);
  const factsOf = (oid: string): { name: string; layout: string; colors: number; mv: number; typeLine: string; edhrec: number | null; reserved: boolean } => { const r = best.get(oid)!; return { name: nameOfBest(r), layout: r.layout, colors: colorMask(r.colors), mv: r.cmc, typeLine: r.typeLine, edhrec: r.edhrecRank, reserved: r.reserved }; };
  const oracleOf = new Map<string, OracleRow>();                                    // built after the selection, for the oracles a catalogue row references
  lap("oracles");
  // sets: write-once tokens and slugs; the dominant Scryfall code of the group's joined singles is its origin set
  const toks = chooseSetToks(incl.map((g) => ({ groupId: g.groupId, abbreviation: g.abbreviation ?? null, kind: kinds.get(g.groupId)! })), new Map<number, string>([...(prev.empty ? Object.entries(seed?.toks ?? {}).map(([k, v]) => [Number(k), v] as const) : []), ...prev.tokBySetId]));
  const setCount = new Map<number, Map<string, number>>();
  for (const x of singles) if (x.cls === 0 && x.row) { let m = setCount.get(x.g.groupId); if (!m) setCount.set(x.g.groupId, (m = new Map())); m.set(x.row.set, (m.get(x.row.set) ?? 0) + 1); }
  const setRows = new Map<number, SetRow>(); const usedSetSlugs = new Set<string>([...prev.setSlugById.values()]);
  for (const g of [...incl].sort((a, b) => a.groupId - b.groupId)) {
    const kind = kinds.get(g.groupId)!; const tok = toks.get(g.groupId)!; const bucket = isBucketGroup(g);
    const counts = setCount.get(g.groupId); let scry: string | null = null;
    if (counts && !bucket) { const total = [...counts.values()].reduce((a, b) => a + b, 0); const [code, n] = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]!; if (n / total >= 0.6) scry = code; }
    let slug = prev.setSlugById.get(g.groupId); if (!slug) { slug = setSlugOf({ name: g.name, bucket }, tok); if (usedSetSlugs.has(slug)) slug = `${slug}-g${g.groupId}`; }
    usedSetSlugs.add(slug);
    setRows.set(g.groupId, { id: g.groupId, slug, tok, code: setCodeOf(g, scry ? ({ code: scry } as never) : null), name: setDisplayName(g), tcgName: g.name, kind, releasedOn: bucket ? null : g.publishedOn?.slice(0, 10) ?? null, bucket, scry, abbr: g.abbreviation ? g.abbreviation.toLowerCase() : null });
  }
  const carriedSets: SetRow[] = carry.sets.filter((s) => !setRows.has(s.id));        // a group that left TCGCSV keeps its set row (sets are never deleted)
  lap("sets");
  // card rows: slugs are write-once (an existing product keeps its slug, a new one is slugBase with -p<id> on a collision)
  const takenSlug = new Set<string>(prev.slugById.values()); for (const v of Object.values(seed?.cards ?? {})) takenSlug.add(v);
  const rootOf = new Map<string, number>();                                          // printing id -> family root
  { const fam = new Map<string, Single[]>(); for (const x of singles) if (x.cls === 0 && x.row && (x.link === LINK.ID || x.link === LINK.ETCHED || x.link === LINK.VARIANT)) { const a = fam.get(x.row.id); if (a) a.push(x); else fam.set(x.row.id, [x]); }
    for (const [pid, members] of fam) if (members.length > 1) { const withId = members.filter((m) => m.link === LINK.ID); rootOf.set(pid, Math.min(...(withId.length ? withId : members).map((m) => m.id))); } }
  const nameWords = new Map<string, number>(); let treatDisagree = 0, etchedFlagged = 0, finishConflicts = 0, noNumber = 0, slugSuffixed = 0, setMoves = 0;
  const cardsAll: PricedCard[] = []; const day8 = day;
  for (const x of singles.sort((a, b) => a.id - b.id)) {
    const set = setRows.get(x.g.groupId)!; const facts = x.oracleId ? factsOf(x.oracleId) : null; const row = x.row;
    const sc = row?.set ?? null; const prevSet = carry.setOf.get(x.id);
    const setId = prevSet ?? x.g.groupId; if (prevSet !== undefined && prevSet !== x.g.groupId) setMoves++;                 // a product that changed group is HELD in its old set (CollectionCard.setId relies on it)
    const group = GROUP_TREATMENTS.find(([rx]) => rx.test(x.g.name))?.[1] ?? null;
    const keys = new Set<TreatmentKey>(x.parsed.treat); if (group && x.cls === 0) keys.add(group);
    const rootId = row && x.cls === 0 ? rootOf.get(row.id) ?? null : null;
    if (row && x.cls === 0 && (x.link === LINK.ID || x.link === LINK.ETCHED) && (rootId === null || rootId === x.id)) {          // rule S: Scryfall facts add frame, art, serial, edition and promo keys of the root member only
      const facts = new Set<string>([`border:${row.borderColor}`, ...row.frameEffects.map((e) => `frame:${e}`), ...row.promoTypes.map((e) => `promo:${e}`), ...(row.fullArt ? ["flag:full_art"] : [])]);
      for (const t of TREATMENTS) if (SF_KINDS.has(t.kind) && t.sf.some((s) => facts.has(s))) keys.add(t.key as TreatmentKey);
      if (x.parsed.treat.some((k) => { const t = TREATMENTS.find((q) => q.key === k); return t && t.sf.length > 0 && !t.sf.some((s) => facts.has(s)); })) treatDisagree++;
    }
    const treat = joinTreat([...keys]);
    const prices = (): { n: PriceRowLike | null; f: PriceRowLike | null } => ({ n: x.n, f: x.f });
    const { n, f } = prices();
    const hasN = n !== null, hasF = f !== null;
    let flags = 0;
    if (x.cls === 0 && (keys.has("etched") || (x.join.linkLevel === "etched" && row?.finishes.includes("etched")))) { flags |= CARD_FLAGS.ETCHED; etchedFlagged++; }
    if (keys.has("serial")) flags |= CARD_FLAGS.SERIAL;
    if (row?.promo || x.kind === "promo" || x.kind === "promo-pack") flags |= CARD_FLAGS.PROMO;
    if (row?.fullArt || keys.has("fullart")) flags |= CARD_FLAGS.FULLART;
    if (row && (row.layout === "transform" || row.layout === "modal_dfc" || row.layout === "reversible_card")) flags |= CARD_FLAGS.DFC;
    if (row && (row.imageStatus === "highres_scan" || row.imageStatus === "lowres")) flags |= CARD_FLAGS.SCRYIMG;
    if (row?.imageStatus === "lowres") flags |= CARD_FLAGS.LOWRES;
    if ((x.p.imageCount ?? 0) > 0) flags |= CARD_FLAGS.TCGIMG;
    if (row) flags |= CARD_FLAGS.JOINED;
    if (x.p.presaleInfo?.isPresale || (row && row.releasedAt > day8)) flags |= CARD_FLAGS.FUTURE;
    if (!hasN) flags |= CARD_FLAGS.FOILONLY;
    if (x.starRow) flags |= CARD_FLAGS.STAR;
    if ((NOTPLAY_SET_KINDS as readonly string[]).includes(x.kind) || row?.oversized || row?.borderColor === "gold" || row?.borderColor === "silver" || x.cls === CARD_CLASS.OVERSIZED) flags |= CARD_FLAGS.NOTPLAY;
    if (row?.promoTypes.includes("universesbeyond")) flags |= CARD_FLAGS.UB;
    if (row && x.cls === 0 && (x.link === LINK.ID || x.link === LINK.ETCHED) && (idx.byTcgId.get(x.id)?.length ?? 0) < 2) {      // TCGplayer is kept when it contradicts Scryfall, and counted
      const fin = row.finishes;
      if ((f && !fin.includes("foil") && !fin.includes("etched")) || (n && !fin.includes("nonfoil"))) finishConflicts++;
    }
    const tcgBase = x.parsed.base || x.parsed.core || x.name;
    const name = facts ? displayName(facts.layout, facts.name) : tcgBase;
    const alt = x.cls === 0 ? (row ? reskinAlt({ flavorName: row.flavorName, faceFlavorNames: row.faceFlavor }) : x.alt) : null;
    if (alt) reskins++;
    if (x.cls === 0) for (const w of x.parsed.words) nameWords.set(w, (nameWords.get(w) ?? 0) + 1);
    const number = row && x.cls === 0 ? row.cn : x.tcgNumber ? x.tcgNumber.replace(/\s*\/\s*\d+$/, "").replace(/^0+(?=\d)/, "") || null : null;
    if (!number) noNumber++;
    let slug = prev.slugById.get(x.id) ?? seed?.cards[String(x.id)];
    if (!slug) {
      slug = slugBase({ productId: x.id, name: x.name, number: x.tcgNumber }, set.tok);
      if (takenSlug.has(slug)) { slug = withProductSuffix(slug, x.id); slugSuffixed++; }
      if (takenSlug.has(slug)) slug = `${slug}-${x.id}`;
    }
    takenSlug.add(slug);
    const mvv = facts ? facts.mv : 0;
    const c: CardRow = {
      id: x.id, slug, name, alt: alt && fold(alt) !== fold(name) ? alt : null, tcgName: tcgBase, setId, sc, number, tn: tcgBase !== name ? tcgBase : null, fnum: x.starRow?.cn ?? null, nkey: nkey(number), nsort: nsort(number),
      rarity: effectiveRarity({ tcg: x.tcgRarity, scry: x.cls === 0 ? row?.rarity ?? null : null, cls: x.cls }), cls: x.cls, treat, label: labelOf(x.parsed, x.cls === 0 ? group : null), flags, link: x.cls === 0 ? x.link : LINK.NONE,
      oracleNo: null, scryId: row && (flags & CARD_FLAGS.SCRYIMG) ? row.id : null, rootId, colors: facts ? facts.colors : 0, mv: mvv, ptype: facts ? ptypeOf(facts.typeLine) : ptypeOf(ed(x.p, "SubType")),
    };
    const vn = unitValueCents(n), vf = unitValueCents(f);
    const pr: CardPriceRow = { cardId: x.id, marketN: n?.marketCents ?? null, marketF: f?.marketCents ?? null, lowN: n?.lowCents ?? null, lowF: f?.lowCents ?? null, mask: 0 };
    let m = 0; if (hasN) m |= PRICE_MASK.HASN; if (hasF) m |= PRICE_MASK.HASF; if (!vn && vf) m |= PRICE_MASK.HEADF;
    if (vn?.lowBasis) m |= PRICE_MASK.LOWN; if (vf?.lowBasis) m |= PRICE_MASK.LOWF;
    pr.mask = m;
    const reserved = facts ? facts.reserved : false;
    const pop = x.cls === 0 && facts ? popularity(facts.edhrec, reserved) : 0;
    const score = x.cls === 0 ? trackScoreCents({ n: vn?.cents ?? null, f: vf?.cents ?? null }, pop, cfg) : Math.max(vn?.cents ?? 0, vf?.cents ?? 0);
    cardsAll.push({ c, pr, single: x, oracleKey: x.cls === 0 ? x.oracleId : null, score, pop, reserved, vn, vf, wasMask: prev.maskById.get(x.id) });
  }
  lap("cards");
  // S5: select. Catalogue, THIN, tracking with hysteresis (the previous published mask is the only memory), TOP / CHEAP, GONE
  const listedNow = new Set<number>(); const forcedThin = new Set<number>();
  for (const k of cardsAll) {
    const priced = k.vn !== null || k.vf !== null; const wasListed = ((k.wasMask ?? 0) & PRICE_MASK.LISTED) !== 0;
    if (k.c.cls === 0) { if (priced ? inCatalogue(k.score, wasListed, 0, cfg) : wasListed || k.reserved) listedNow.add(k.c.id); }
    else if (priced ? inCatalogue(k.score, wasListed, k.c.cls, cfg) : wasListed) listedNow.add(k.c.id);
  }
  if (cfg.oracleComplete) {
    const listedOracles = new Set<string>(); for (const k of cardsAll) if (k.oracleKey && listedNow.has(k.c.id)) listedOracles.add(k.oracleKey);
    const picks = completenessPicks(cardsAll.filter((k) => k.c.cls === 0 && (k.vn || k.vf)).map((k) => ({ id: k.c.id, oracleId: k.oracleKey, marketCents: Math.max(k.pr.marketN ?? 0, k.pr.marketF ?? 0) || null, valueCents: Math.max(k.vn?.cents ?? 0, k.vf?.cents ?? 0) })), listedOracles);
    for (const id of picks) if (!listedNow.has(id)) { listedNow.add(id); forcedThin.add(id); }
  }
  // tracking: the effective floor first (the offer budget), then the per-unit hysteresis
  const unitValue = (k: PricedCard, f: Finish): number | null => { const v = f === "N" ? k.vn : k.vf; if (!v) return null; const cents = cfg.popBoost ? v.cents * (1 + 2 * k.pop) : v.cents; return cents; };
  const effectiveFloor = ((): number => {
    const vals: number[] = []; for (const k of cardsAll) if (k.c.cls === 0 && listedNow.has(k.c.id)) for (const f of FINISHES) { const v = unitValue(k, f); const lb = (f === "N" ? k.vn : k.vf)?.lowBasis; if (v != null && !(lb && !cfg.lowBasis) && v >= cfg.trackFloorCents) vals.push(v); }
    if (vals.length * OFFERS_PER_UNIT <= cfg.offerRowsBudget) return cfg.trackFloorCents;
    vals.sort((a, b) => b - a); return vals[Math.max(0, Math.floor(cfg.offerRowsBudget / OFFERS_PER_UNIT) - 1)] ?? cfg.trackFloorCents;
  })();
  const tcfg: TrackConfig = effectiveFloor > cfg.trackFloorCents ? { ...cfg, trackFloorCents: effectiveFloor } : cfg;
  for (const k of cardsAll) {
    let m = k.pr.mask; const was = k.wasMask ?? 0; const priced = k.vn !== null || k.vf !== null; const listed = listedNow.has(k.c.id);
    if (listed) m |= PRICE_MASK.LISTED;
    if (listed && k.c.cls === 0 && (forcedThin.has(k.c.id) || isThin(k.score, (was & PRICE_MASK.LISTED) !== 0 && (was & PRICE_MASK.THIN) === 0, 0, cfg))) m |= PRICE_MASK.THIN;
    if (listed && k.c.cls !== 0) m |= PRICE_MASK.THIN;
    if (k.c.cls === 0 && listed) {
      if (!priced) { m |= was & STAR_BITS; if (was & PRICE_MASK.TRACKN) m |= PRICE_MASK.HASN; if (was & PRICE_MASK.TRACKF) m |= PRICE_MASK.HASF; }   // a price outage is "unknown", not "zero": keep the tracked bits, and the HAS bit of each (the validator refuses a tracked unit that has no price row at all)
      else for (const f of FINISHES) { const v = unitValue(k, f); if (unitTracked(v, (was & (f === "N" ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKF)) !== 0, (f === "N" ? k.vn : k.vf)?.lowBasis ?? false, tcfg, 0)) m |= f === "N" ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKF; }
    }
    k.pr.mask = m;
  }
  if (cfg.perOracleCap > 0) {
    const by = new Map<string, PricedCard[]>(); for (const k of cardsAll) if (k.oracleKey && k.pr.mask & STAR_BITS) { const a = by.get(k.oracleKey); if (a) a.push(k); else by.set(k.oracleKey, [k]); }
    for (const list of by.values()) if (list.length > cfg.perOracleCap) { list.sort((a, b) => b.score - a.score || a.c.id - b.c.id); for (const k of list.slice(cfg.perOracleCap)) k.pr.mask &= ~STAR_BITS; }
  }
  // F10: a mass change of flags keeps the OLD flags of the rows that existed
  const prevRows = prev.maskById.size; let prevTracked = 0; for (const mk of prev.maskById.values()) prevTracked += ((mk & PRICE_MASK.TRACKN) ? 1 : 0) + ((mk & PRICE_MASK.TRACKF) ? 1 : 0);
  let changedListed = 0, changedTracked = 0;
  for (const k of cardsAll) { const was = k.wasMask; if (was === undefined) continue; if (((was ^ k.pr.mask) & PRICE_MASK.LISTED) !== 0) changedListed++; changedTracked += ((was ^ k.pr.mask) & PRICE_MASK.TRACKN ? 1 : 0) + ((was ^ k.pr.mask) & PRICE_MASK.TRACKF ? 1 : 0); }
  const configChanged = prev.configHash !== null && prev.configHash !== trackConfigHash(cfg);
  const verdict: GuardVerdict = flagChangeGuard({ rows: prevRows, tracked: prevTracked }, { listed: changedListed, tracked: changedTracked }, cfg, { configChanged, priorTrips: prev.guardTrips });
  if (!verdict.ok) { log(`F10: ${verdict.reason}: the old flags are kept (trip ${verdict.trips})`); for (const k of cardsAll) if (k.wasMask !== undefined && !held.has(k.c.setId)) k.pr.mask = (k.pr.mask & ~FLAG_BITS) | (k.wasMask & FLAG_BITS); }
  else if (verdict.reason) log(`F10 released (${verdict.bypass}): ${verdict.reason}`);
  // held groups: every row of a group the day did not fully cover keeps every flag
  for (const k of cardsAll) if (held.has(k.c.setId) && k.wasMask !== undefined) k.pr.mask = (k.pr.mask & ~(FLAG_BITS | PRICE_MASK.THIN)) | (k.wasMask & (FLAG_BITS | PRICE_MASK.THIN));
  // TOP and CHEAP over the listed class-0 rows
  const topOf = new Map<string, PricedCard>(); const cheapOf = new Map<string, PricedCard>();
  const bestMarket = (k: PricedCard): number => Math.max(k.pr.marketN ?? 0, k.pr.marketF ?? 0);
  const bestValue = (k: PricedCard): number => Math.max(k.vn?.cents ?? 0, k.vf?.cents ?? 0);
  for (const k of cardsAll) {
    if (!k.oracleKey || !(k.pr.mask & PRICE_MASK.LISTED) || k.c.cls !== 0) continue;
    const cur = topOf.get(k.oracleKey);
    if (!cur || bestMarket(k) > bestMarket(cur) || (bestMarket(k) === bestMarket(cur) && (bestValue(k) > bestValue(cur) || (bestValue(k) === bestValue(cur) && k.c.id < cur.c.id)))) topOf.set(k.oracleKey, k);
    if ((k.pr.mask & PRICE_MASK.HASN) && (k.pr.marketN ?? 0) > 0 && !(k.c.flags & (CARD_FLAGS.SERIAL | CARD_FLAGS.NOTPLAY))) { const ch = cheapOf.get(k.oracleKey); if (!ch || k.pr.marketN! < ch.pr.marketN! || (k.pr.marketN === ch.pr.marketN && k.c.id < ch.c.id)) cheapOf.set(k.oracleKey, k); }
  }
  for (const [o, k] of topOf) { if (bestMarket(k) > 0) k.pr.mask |= PRICE_MASK.TOP; if (!cheapOf.has(o)) k.pr.mask |= PRICE_MASK.CHEAP; }
  for (const k of cheapOf.values()) k.pr.mask |= PRICE_MASK.CHEAP;
  const nPrint = new Map<string, number>(); for (const k of cardsAll) if (k.oracleKey && k.c.cls === 0 && (k.pr.mask & PRICE_MASK.LISTED)) nPrint.set(k.oracleKey, (nPrint.get(k.oracleKey) ?? 0) + 1);
  // rows that exist: listed now or published before; anything else is not a catalogue row
  const rows = cardsAll.filter((k) => (k.pr.mask & PRICE_MASK.LISTED) || prev.slugById.has(k.c.id));
  // oracles: only the ones a catalogue row references; the slugs and ordinals of the published ones are write-once, the new ones go oldest first
  { const referenced = new Set<string>(); for (const k of rows) if (k.oracleKey) referenced.add(k.oracleKey);
    const oracleNos = new Set<number>(prev.slugByOracleNo.keys()); let nextNo = 1; for (const n of oracleNos) if (n >= nextNo) nextNo = n + 1;
    const takenOracleSlug = new Set<string>(prev.oracleNoBySlug.keys()); for (const v of Object.values(seed?.oracles ?? {})) takenOracleSlug.add(v);
    const orderedUsed = [...referenced].sort((a, b) => { const fa = firstRelease.get(a)!, fb = firstRelease.get(b)!; return fa < fb ? -1 : fa > fb ? 1 : a < b ? -1 : 1; });
    const pendingNew: string[] = [];                                                // oracles without a slug yet
    for (const oid of orderedUsed) {
      const r = best.get(oid)!; const name = nameOfBest(r);
      const known = carry.oracleByUuid.get(oid); const bare = bareOracle(name, oid);
      let slug: string | null = known?.slug ?? seed?.oracles[oid] ?? null; let no: number | null = known?.no ?? null;
      if (!slug && !prev.empty && carry.oracleByUuid.size === 0) {                // no uuid memory at all (a state restored from the branch `state`): the slug decides. With a tree, an unknown uuid is a NEW oracle and never inherits a published slug
        const suffixed = `${bare}-${oid.slice(0, 8)}`;
        if (prev.oracleNoBySlug.has(suffixed)) slug = suffixed;
        else if (prev.oracleNoBySlug.has(bare) && !takenByOther(oracleOf, bare)) slug = bare;
        if (slug) no = prev.oracleNoBySlug.get(slug)!;
      }
      if (slug && no == null) no = prev.oracleNoBySlug.get(slug) ?? null;
      if (slug) takenOracleSlug.add(slug);
      const lg = legalString(r.legalities); for (const k of lg.unknownKeys) unknownFormats.add(k); unknownStatuses += lg.unknownStatuses;
      if (!KNOWN_LAYOUTS.has(r.layout)) unknownLayouts.add(r.layout);
      const row: OracleRow = {
        no: no ?? 0, scryfallId: oid, slug: slug ?? "", name, nameKey: fold(name), manaCost: r.manaCost, manaValue: r.cmc, typeLine: r.typeLine, colors: colorMask(r.colors), identity: colorMask(r.colorIdentity), legal: lg.legal,
        edhrecRank: r.edhrecRank, flags: oracleFlags({ typeLine: r.typeLine, oracleText: r.oracleText, keywords: r.keywords, power: r.power, toughness: r.toughness, reserved: r.reserved, gameChanger: r.gameChanger, commanderLegal: r.legalities.commander === "legal" }),
        layout: r.layout, pt: r.power != null && r.toughness != null ? `${r.power}/${r.toughness}` : null, loyalty: r.loyalty, oracleText: r.oracleText, keywords: r.keywords.map((k) => k.toLowerCase().replace(/\s+/g, "-")).join(" "), faces: r.faces.length || 1, nPrint: nPrint.get(oid) ?? 0,
      };
      oracleOf.set(oid, row); if (!slug) pendingNew.push(oid);
    }
    for (const oid of pendingNew) { const row = oracleOf.get(oid)!; row.slug = oracleSlugOf({ id: oid, name: row.name }, takenOracleSlug.has(bareOracle(row.name, oid))); takenOracleSlug.add(row.slug); }
    for (const row of [...oracleOf.values()].filter((r) => r.no === 0).sort((a, b) => (a.slug < b.slug ? -1 : 1))) row.no = nextNo++;       // new ordinals, in slug order, after the highest one ever published
    for (const k of cardsAll) if (k.oracleKey) k.c.oracleNo = oracleOf.get(k.oracleKey)?.no ?? null;
  }
  const present = new Set<number>(cardsAll.map((k) => k.c.id));
  // S5: absent products (GONEP on the first complete day, GONE on the second) and the sealed catalogue
  const absentCards: [number, number][] = []; let goneNow = 0;
  for (const [id, mask] of prev.maskById) {
    if (present.has(id)) continue;
    const gid = carry.setOf.get(id); if (gid !== undefined && held.has(gid)) { absentCards.push([id, mask]); continue; }
    let m: number;
    if (mask & PRICE_MASK.GONEP || mask & PRICE_MASK.GONE) { m = (mask & ~(PRICE_MASK.LISTED | STAR_BITS | PRICE_MASK.TOP | PRICE_MASK.CHEAP | PRICE_MASK.GONEP)) | PRICE_MASK.GONE; goneNow++; } else m = mask | PRICE_MASK.GONEP;
    absentCards.push([id, m]);
  }
  const sealedRows: SealedModelRow[] = []; const sealedSlugTaken = new Set<string>([...carry.sealed.values()].map((s) => s.slug)); const sealedPresent = new Set<number>();
  for (const s of sealedIn.sort((a, b) => a.p.productId - b.p.productId)) {
    const ps = parseSealed(s.p, kinds.get(s.g.groupId) ?? null); const was = carry.sealed.get(s.p.productId);
    let slug = was?.slug; if (!slug) { slug = sealedSlugOf(ps.name, s.p.productId, sealedSlugTaken.has(sealedSlugOf(ps.name, s.p.productId, false))); }
    sealedSlugTaken.add(slug); sealedPresent.add(s.p.productId);
    const price = s.n ?? s.f;
    sealedRows.push({ id: s.p.productId, slug, name: ps.name, setId: ps.setId, kind: ps.kind as SealedKind, packCount: ps.packCount, releasedOn: ps.releasedOn, presale: ps.presale, marketUsd: price?.marketCents ?? null, lowTcg: price?.lowCents ?? null, contents: ps.contents, gone: false });
  }
  const absentSealed: [number, number][] = [];                                    // [id, new flags]: GONEP on the first complete day absent, GONE on the second
  for (const [id, was] of carry.sealed) {
    if (sealedPresent.has(id)) continue;
    const keep = was.flags & SEALED_FLAGS.PRESALE;
    absentSealed.push([id, was.setId && held.has(was.setId) ? was.flags : was.flags & (SEALED_GONEP | SEALED_FLAGS.GONE) ? keep | SEALED_FLAGS.GONE : keep | SEALED_GONEP]);
  }
  lap("select");
  // caps (F6)
  const tracked = new Set<number>(); const units: UnitRef[] = [];
  for (const k of cardsAll) { if (k.pr.mask & PRICE_MASK.TRACKN) { tracked.add(k.c.id * 2); units.push({ id: k.c.id, finish: "N" }); } if (k.pr.mask & PRICE_MASK.TRACKF) { tracked.add(k.c.id * 2 + 1); units.push({ id: k.c.id, finish: "F" }); } }
  if (rows.length > cfg.catalogMaxRows) throw new Error(`F6: ${rows.length} catalogue rows exceed CATALOG_MAX_ROWS ${cfg.catalogMaxRows}`);
  if (units.length > cfg.trackMaxUnits) throw new Error(`F6: ${units.length} tracked units exceed TRACK_MAX_UNITS ${cfg.trackMaxUnits}`);
  // the snapshot, the joined map and the match rows (S7)
  const joined = new Map<number, JoinedProduct>();
  for (const k of rows) joined.set(k.c.id, { id: k.c.id, linkLevel: k.single.cls === 0 ? k.single.join.linkLevel : "none", row: k.single.row, starRow: k.single.starRow, oracleNo: k.c.oracleNo, rootId: k.c.rootId });
  const rowsOnly = rows.map((k) => k.c), prices = rows.map((k) => k.pr);
  const scrySetsUsed = new Set<string>(); for (const c of rowsOnly) if (c.sc) scrySetsUsed.add(c.sc);
  for (const s of [...scrySetsUsed]) { const p = idx.sets.get(s)?.parentSetCode; if (p) scrySetsUsed.add(p); }
  const snapshot: CatalogueSnapshot = {
    day, sets: [...setRows.values(), ...carriedSets].sort((a, b) => a.id - b.id), oracles: [...oracleOf.values()].sort((a, b) => a.no - b.no), cards: rowsOnly, prices, sealed: sealedRows, units,
    absent: { cards: absentCards, sealed: absentSealed, sets: carriedSets },
    scrySets: sf.sets.filter((s) => scrySetsUsed.has(s.code)).sort((a, b) => (a.code < b.code ? -1 : 1)), stamps: { tcgcsv: tcg.lastUpdated, scryfall: sf.updatedAt },
  };
  const match = matchRowsOf(snapshot, rows.map((k) => k.single), setRows);
  lap("snapshot");
  let listedCount = 0, specials = 0, reservedUnpriced = 0, added = 0, unlisted = 0;
  for (const k of rows) { if (k.pr.mask & PRICE_MASK.LISTED) { listedCount++; if (k.c.cls !== 0) specials++; else if (!(k.vn || k.vf) && k.reserved) reservedUnpriced++; } else unlisted++; if (!prev.slugById.has(k.c.id)) added++; }
  const unjoinedCatalogue = rows.filter((k) => k.c.cls === 0 && (k.pr.mask & PRICE_MASK.LISTED) && k.c.oracleNo === null).length;
  const groupMemory = new Map<number, [number, number]>(groupStat); for (const [gid, v] of heldGroupRows) groupMemory.set(gid, v);        // a held group keeps the numbers it was held at: the memory never ratchets down
  const groups: [number, number, number][] = [...groupMemory].map(([gid, [a, b]]) => [gid, a, b] as [number, number, number]).sort((a, b) => a[0] - b[0]);
  const ctx: ImportContext = { log, day, cfg, prev, phase: "catalog", work: memTree(), snapshot, match, joined, tracked };
  const summary: Partial<ImportSummaryV1> = {
    v: 1, priceDay: day, mode: "catalog",
    tcgcsv: { lastUpdated: tcg.lastUpdated, groups: tcg.groups.length, products: singles.length + sealedIn.length, singles: singles.length, sealed: sealedIn.length, priceRows, bytes: tcg.bytes },
    scryfall: { mode: sf.mode, updatedAt: sf.updatedAt, rows: sf.rows.length },
    catalogue: { rows: rows.length, added, listed: listedCount, unlisted, gone: goneNow, trackedCards: new Set(units.map((u) => u.id)).size, units: units.length, oracles: oracleOf.size, specials, reservedUnpriced, offersPruned: 0 },
    magic: {
      join: { ...joinCount, id: joinCount.id + joinCount.etched }, unjoinedCatalogue, reskins, reskinAmbiguous, etchedFlagged, etchedAnomalies, sharedPairs, sharedOdd, finishConflicts, classCounts, classDemoted, unknownWords: [...nameWords].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 50),
      treatDisagree, unknownSubtypes: [...unknownSubtypes].sort(), unknownFormats: [...unknownFormats].sort(), unknownLayouts: [...unknownLayouts].sort(), slugSuffixed, noNumber,
    },
    guards: { ...(verdict.reason && !verdict.ok ? { flagChange: verdict.reason } : {}), degraded: [...(effectiveFloor > cfg.trackFloorCents ? [`offer budget raised the track floor to ${effectiveFloor} cents`] : []), ...(setMoves ? [`${setMoves} product(s) moved group and were held in their old set`] : []), ...(unknownStatuses ? [`${unknownStatuses} unknown legality status(es)`] : [])] },
    timings,
  };
  log(`Catalogue: ${rows.length} rows (${listedCount} listed, ${specials} specials), ${units.length} tracked units, ${oracleOf.size} oracles, ${absentCards.length} absent, join ${j(joinCount)}`);
  return { ctx, result: { summary, guards: { flagChange: verdict.ok ? null : verdict.reason ?? null, groupHold: [...held].sort((a, b) => a - b), storeHold: [], configChanged, countsOk: true }, groups } };
}
const takenByOther = (m: Map<string, OracleRow>, slug: string): boolean => { for (const r of m.values()) if (r.slug === slug) return true; return false; };

/** The TCGplayer group abbreviation of a set, lower-cased, for MatchRow.abbr: the group's own value when the set came from TCGCSV this run, else the token when it was derived from the abbreviation (a `g<id>` token means it was not). */
const abbrOfSet = (set: SetRow | undefined): string | null => (set ? (set.abbr !== undefined ? set.abbr : /^g\d+$/.test(set.tok) ? null : set.tok.toLowerCase()) : null);

/** S7: one row per LISTED catalogue product the store matcher may emit. The folded name forms are the product's, its oracle's, each face and the printed name; the set names carry the prefix variants of the group name. */
function matchRowsOf(snap: CatalogueSnapshot, singles: Single[], setRows: Map<number, SetRow>): MatchRow[] {
  const byId = new Map<number, Single>(singles.map((s) => [s.id, s])); const oracle = new Map<number, OracleRow>(snap.oracles.map((o) => [o.no, o]));
  const out: MatchRow[] = [];
  for (let i = 0; i < snap.cards.length; i++) {
    const c = snap.cards[i]!, p = snap.prices[i]!; if (!(p.mask & PRICE_MASK.LISTED)) continue;
    const s = byId.get(c.id); const o = c.oracleNo ? oracle.get(c.oracleNo) : undefined; const set = setRows.get(c.setId);
    const names = new Set<string>(); const add = (v: string | null | undefined): void => { const f = fold(v); if (f) names.add(f); };
    add(c.name); add(c.alt); add(c.tcgName); add(o?.name); for (const part of (o?.name ?? c.name).split(" // ")) add(part); if (s?.row) { add(s.row.printedName); add(s.row.flavorName); for (const f of s.row.faces) add(f); }
    const setNames = new Set<string>(); const sn = (v: string | null | undefined): void => { const f = fold(v); if (f) setNames.add(f); };
    sn(s?.row?.setName); if (set) { sn(set.tcgName); for (const pre of ["Commander: ", "Universes Beyond: ", "Art Series: ", "Promo Pack: "]) if (set.tcgName.startsWith(pre)) sn(set.tcgName.slice(pre.length)); }
    out.push({ id: c.id, groupId: c.setId, names: [...names], sc: c.sc ?? set?.scry ?? null, setNames: [...setNames], nkey: c.nkey, treat: c.treat ? (c.treat.split(" ") as TreatmentKey[]) : [], hasN: (p.mask & PRICE_MASK.HASN) !== 0, hasF: (p.mask & PRICE_MASK.HASF) !== 0, etched: (c.flags & CARD_FLAGS.ETCHED) !== 0, rootId: c.rootId, cls: c.cls, label: c.label, abbr: abbrOfSet(set), scryId: s?.row?.id ?? c.scryId, starScryId: s?.starRow?.id ?? null });
  }
  return out;
}

// ── S6 + S11 (the free views): the files ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Per tracked unit, from the history stage: percent change over 7 and 30 days, the 90-day high, today's value and yesterday's (all USD cents / percent with one decimal). */
export interface UnitStat { c7: number | null; c30: number | null; hi90: number | null; cents: number | null; prevCents: number | null }
const statsOf = new WeakMap<CatalogueSnapshot, Map<number, UnitStat>>();
const wroteCatalogue = new WeakSet<CatalogueSnapshot>();
interface UnAgg { low: (number | null)[]; stores: number[]; smin: (number | null)[] }
function loadUn(t: TreeView): Map<number, UnAgg> {
  const out = new Map<number, UnAgg>();
  for (const f of t.files()) if (f.startsWith("un/")) for (const r of readJson<UnFile>(t, f)?.u ?? []) out.set(r[0], { low: r[1], stores: r[2], smin: r[3] });
  return out;
}
const dayStamp = (snap: CatalogueSnapshot): string => snap.stamps?.tcgcsv ?? `${snap.day}T00:00:00Z`;

/** The px row of a card: prices, mask and (tracked finishes) the history stats; trailing nulls are cut (6 untracked, 9 or 12 columns tracked). */
function pxRowOf(id: number, pr: CardPriceRow, stats: Map<number, UnitStat> | undefined): PxRow {
  const row: (number | null)[] = [id, pr.marketN, pr.marketF, pr.lowN, pr.lowF, pr.mask];
  const sn = pr.mask & PRICE_MASK.TRACKN ? stats?.get(id * 2) : undefined, sfin = pr.mask & PRICE_MASK.TRACKF ? stats?.get(id * 2 + 1) : undefined;
  if (sn || sfin) { row.push(sn?.c7 ?? null, sn?.c30 ?? null, sn?.hi90 ?? null, sfin?.c7 ?? null, sfin?.c30 ?? null, sfin?.hi90 ?? null); while (row.length > 6 && row[row.length - 1] == null) row.pop(); }
  return row as PxRow;
}
/** A day whose history stage was skipped (F7) has no change figures of its own. Publishing every tracked unit as "unknown" for that day would empty the movers, the rising sort and the arrows of the home page, so the px rows keep the figures of the last recorded day, for the finishes that are still tracked. */
function carryStats(t: TreeView, snap: CatalogueSnapshot, px: Map<number, PxRow>): void {
  const buckets = new Set<number>(); for (const c of snap.cards) buckets.add(cardBucket(c.id));
  for (const b of buckets) {
    for (const old of readJson<{ p: PxRow[] }>(t, bucketPath("px", b))?.p ?? []) {
      const row = px.get(old[0]); if (!row || old.length <= 6) continue;
      const cols: (number | null)[] = [];
      for (const [bit, from] of [[PRICE_MASK.TRACKN, 6], [PRICE_MASK.TRACKF, 9]] as const) for (let k = 0; k < 3; k++) cols.push(row[5] & bit ? (old[from + k] as number | null | undefined) ?? null : null);
      while (cols.length && cols[cols.length - 1] == null) cols.pop();
      if (cols.length) px.set(old[0], [...row.slice(0, 6), ...cols] as PxRow);
    }
  }
}
function catRowOf(c: CardRow): CatRow {
  return [c.id, c.slug, c.name, z(c.alt), c.setId, z(c.sc), z(c.number), z(c.fnum), c.rarity, c.cls, c.treat, z(c.label), c.flags, c.link, c.oracleNo ?? 0, c.flags & CARD_FLAGS.SCRYIMG ? z(c.scryId) : 0, z(c.rootId), z(c.tn), c.colors, c.mv, c.ptype];
}
interface RowView { c: CatRow; p: PxRow }
/** What the ordinary-printing rule (search.ts ordinaryTier) reads of a catalogue row: the same columns the browse index carries, so the importer and a request pick the same printing. */
const printingFacts = (r: RowView, kindOf: (setId: number) => string): PrintingFacts => ({ id: r.c[0], cls: r.c[9], rarity: r.c[8], treat: r.c[10], flags: r.c[12], mask: r.p[5], marketN: r.p[1], marketF: r.p[2], setKind: kindOf(r.c[4]) });
const headFinishOf = (mask: number): 0 | 1 => ((mask & PRICE_MASK.HEADF) !== 0 ? 1 : 0);
const marketOfUnit = (p: PxRow, f: 0 | 1): number | null => (f === 0 ? p[1] : p[2]);
/** Stat columns of a px row for one finish (the lite hydrator's `at`): Normal at 6..8, Foil at 9..11. */
const statOf = (p: PxRow, f: 0 | 1): { c7: number | null; c30: number | null; hi: number | null } => { const b = 6 + f * 3; return { c7: (p[b] as number | null | undefined) ?? null, c30: (p[b + 1] as number | null | undefined) ?? null, hi: (p[b + 2] as number | null | undefined) ?? null }; };
const topCents = (n: number | null | undefined, f: number | null | undefined): number | null => { const m = Math.max(n ?? 0, f ?? 0); return m > 0 ? m : null; };

/** S6 + the free views of S11 that need only phase 1. Every file is a pure function of the snapshot (and, for the store columns, of the un files already in the tree), written only if its bytes differ; families this pass owns are swept of files it no longer writes.
 *  Rows of products the day did not see (snapshot.absent) are carried from the tree with their new mask. Phase `catalog` first drops the store rows of units that left tracking (reconcile.ts). */
export function writeCatalogueFiles(ctx: ImportContext): { written: number; unchanged: number; removed: number; bytes: number } {
  const t = ctx.work; const snap = ctx.snapshot; const w = new Writer(t); const at = dayStamp(snap);
  if (ctx.phase === "catalog") reconcileStoreFamilies(t, ctx.tracked);
  const stats = statsOf.get(snap);
  // 1. every identity and price row: today's, then the carried ones
  const cat = new Map<number, CatRow>(), px = new Map<number, PxRow>();
  snap.cards.forEach((c, i) => { cat.set(c.id, catRowOf(c)); px.set(c.id, pxRowOf(c.id, snap.prices[i]!, stats)); });
  if (!stats && snap.cards.length) carryStats(t, snap, px);
  const absent = new Map<number, number>(snap.absent?.cards ?? []);
  if (absent.size) {
    const buckets = new Set<number>(); for (const id of absent.keys()) buckets.add(cardBucket(id));
    for (const b of buckets) {
      const oldCat = readJson<{ c: CatRow[] }>(t, bucketPath("cat", b)), oldPx = readJson<{ p: PxRow[] }>(t, bucketPath("px", b));
      for (const r of oldCat?.c ?? []) if (absent.has(r[0]) && !cat.has(r[0])) cat.set(r[0], r);
      for (const r of oldPx?.p ?? []) if (absent.has(r[0]) && !px.has(r[0])) { const q = r.slice() as PxRow; q[5] = absent.get(r[0])!; px.set(r[0], q); }
    }
  }
  for (const id of [...px.keys()]) if (!cat.has(id)) px.delete(id);
  const ids = [...cat.keys()].sort((a, b) => a - b);
  const view: RowView[] = ids.map((id) => ({ c: cat.get(id)!, p: px.get(id) ?? ([id, null, null, null, null, 0] as PxRow) }));
  const setRows = snap.sets; const setById = new Map(setRows.map((s) => [s.id, s]));
  const un = loadUn(t);
  // 2. cat and px by bucket
  const byBucket = new Map<number, RowView[]>(); for (const r of view) { const b = cardBucket(r.c[0]); const a = byBucket.get(b); if (a) a.push(r); else byBucket.set(b, [r]); }
  for (const [b, list] of [...byBucket].sort((x, y) => x[0] - y[0])) {
    w.put(bucketPath("cat", b), `{"v":1,"b":${b},"c":[\n${lines(list.map((r) => r.c))}\n]}`);
    w.put(bucketPath("px", b), `{"v":1,"b":${b},"p":[\n${lines(list.map((r) => r.p))}\n]}`);
  }
  w.sweep((f) => f.startsWith("cat/") || f.startsWith("px/"));
  // 3. sets, origin sets, bucket presence
  const cardCount = new Map<number, number>(), trackedCount = new Map<number, number>(), sealedCount = new Map<number, number>();
  for (const r of view) { const sid = r.c[4]; const mask = r.p[5]; if (r.c[9] === 0 && (mask & PRICE_MASK.LISTED)) cardCount.set(sid, (cardCount.get(sid) ?? 0) + 1); if (mask & STAR_BITS) trackedCount.set(sid, (trackedCount.get(sid) ?? 0) + 1); }
  const oldSealed = new Map<number, SealedRow>(); for (const f of t.files()) if (/^sl\/list-\d+\.json$/.test(f)) for (const r of readJson<SealedListFile>(t, f)?.s ?? []) oldSealed.set(r[0], r);
  const sealedRows = buildSealedRows(snap, oldSealed, stats);
  for (const r of sealedRows) if (r[3] && !(r[7] & SEALED_FLAGS.GONE)) sealedCount.set(r[3] as number, (sealedCount.get(r[3] as number) ?? 0) + 1);
  w.put("meta/sets.json", `{"v":1,"at":"${at}","sets":[\n${lines(setRows.map((s) => [s.id, s.slug, s.tok, s.code, s.name, s.tcgName === s.name ? 0 : s.tcgName, s.kind, z(s.releasedOn), s.bucket ? 1 : 0, z(s.scry), cardCount.get(s.id) ?? 0, trackedCount.get(s.id) ?? 0, sealedCount.get(s.id) ?? 0]))}\n]}`);
  if (snap.scrySets) w.put("meta/scrysets.json", `{"v":1,"sets":[\n${lines(snap.scrySets.map((s) => [s.code, s.name, s.setType, z(s.releasedAt), z(s.parentSetCode)]))}\n]}`);
  const trackedBuckets = [...new Set(view.filter((r) => r.p[5] & STAR_BITS).map((r) => cardBucket(r.c[0])))].sort((a, b) => a - b);   // every bucket that holds a tracked unit, whatever the phase (REQ-WP02-4): the readers skip the history files of the others
  w.put("meta/buckets.json", `{"v":1,"width":256,"cat":${j([...byBucket.keys()].sort((a, b) => a - b))},"tracked":${j(trackedBuckets)}}`);
  // 4. lookups: slugs, set code + number, oracles, names
  const oracles = new Map<number, OracleRow>(snap.oracles.map((o) => [o.no, o]));
  const oldOracle = new Map<number, (string | number)[]>();                       // oracles no product of the day references stay published (ordinals are write-once)
  for (const f of t.files()) if (f.startsWith("or/")) for (const r of readJson<{ o: (string | number)[][] }>(t, f)?.o ?? []) if (!oracles.has(Number(r[0]))) oldOracle.set(Number(r[0]), r);
  const slugShards: { s: [string, number][]; o: [string, number][]; z: [string, number][] }[] = Array.from({ length: 256 }, () => ({ s: [], o: [], z: [] }));
  for (const r of view) slugShards[Number.parseInt(slugShard(r.c[1]), 16)]!.s.push([r.c[1], r.c[0]]);
  for (const o of oracles.values()) slugShards[Number.parseInt(slugShard(o.slug), 16)]!.o.push([o.slug, o.no]);
  for (const [no, r] of oldOracle) slugShards[Number.parseInt(slugShard(String(r[2])), 16)]!.o.push([String(r[2]), no]);
  for (const s of sealedRows) slugShards[Number.parseInt(slugShard(s[1]), 16)]!.z.push([s[1], s[0]]);
  const byS = (a: [string, number], b: [string, number]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
  slugShards.forEach((sh, h) => { sh.s.sort(byS); sh.o.sort(byS); sh.z.sort(byS); w.put(`slug/${hex2(h)}.json`, `{"v":1,"h":${h},"s":[\n${lines(sh.s)}\n],"o":[\n${lines(sh.o)}\n],"z":[\n${lines(sh.z)}\n]}`); });
  const scMaps: Map<string, Map<string, number[]>>[] = Array.from({ length: 64 }, () => new Map());
  for (const r of view) {
    const code = (r.c[5] as string | 0) || setById.get(r.c[4])?.tok || ""; const key = nkey((r.c[6] as string | 0) || null); if (!code || !key) continue;
    const m = scMaps[Number.parseInt(scShard(code), 16)]!; let km = m.get(code); if (!km) m.set(code, (km = new Map())); const a = km.get(key); if (a) a.push(r.c[0]); else km.set(key, [r.c[0]]);
  }
  scMaps.forEach((m, h) => { const o: Record<string, Record<string, number[]>> = {}; for (const code of [...m.keys()].sort()) { o[code] = {}; for (const k of [...m.get(code)!.keys()].sort()) o[code]![k] = m.get(code)!.get(k)!; } w.put(`sc/${hex2(h)}.json`, `{"v":1,"h":${h},"s":${j(o)}}`); });
  const orShards: unknown[][][] = Array.from({ length: 512 }, () => []);
  for (const o of [...oracles.values()].sort((a, b) => a.no - b.no)) orShards[o.no % 512]!.push([o.no, o.scryfallId, o.slug, o.name, o.manaCost, o.manaValue, o.typeLine, o.colors, o.identity, o.legal, z(o.edhrecRank), o.flags, o.layout === "normal" ? 0 : o.layout, z(o.pt), z(o.loyalty), z(o.oracleText), o.keywords, o.faces === 1 ? 0 : o.faces, o.nPrint]);
  for (const [no, r] of [...oldOracle].sort((a, b) => a[0] - b[0])) orShards[no % 512]!.push(r);
  orShards.forEach((rows, h) => { rows.sort((a, b) => (a[0] as number) - (b[0] as number)); w.put(`or/${hex3(h)}.json`, `{"v":1,"h":${h},"o":[\n${lines(rows)}\n]}`); });
  // the representative printing of every oracle (TOP, else the dearest listed, else the lowest id) feeds the typeahead and the home page
  const repOf = new Map<number, RowView>();
  for (const r of view) {
    if (r.c[9] !== 0 || !r.c[14] || !(r.p[5] & PRICE_MASK.LISTED)) continue;
    const cur = repOf.get(r.c[14]); const rank = (x: RowView): number => (x.p[5] & PRICE_MASK.TOP ? 2e12 : 0) + (topCents(x.p[1], x.p[2]) ?? 0) * 1000 + (x.p[3] ?? x.p[4] ?? 0) / 1000;
    if (!cur || rank(r) > rank(cur)) repOf.set(r.c[14], r);
  }
  const hot = (o: OracleRow): number => { const rep = repOf.get(o.no); const price = rep ? topCents(rep.p[1], rep.p[2]) ?? 0 : 0; const pop = o.edhrecRank ? 1 / (1 + o.edhrecRank / 1500) : 0; return price * (1 + 2 * Math.max(pop, o.flags & ORACLE_FLAGS.RESERVED ? 0.5 : 0)); };
  const names = [...oracles.values()].map((o) => ({ o, h: hot(o) })).sort((a, b) => b.h - a.h || (a.o.slug < b.o.slug ? -1 : 1));
  // the printing a NAME opens (nm/ topSlug, its dearest market and printed name): the ORDINARY printing of search.ts (the cheapest plain printing of a main set by MARKET; a promo, treatment or serialized one only
  // when the card has nothing plainer), the rule the request-time search applies to the browse index. Not repOf: the dearest printing made "Sol Ring" open the serialized LTC 409z. repOf still ranks the hot table.
  const kindOf = (sid: number): string => setById.get(sid)?.kind ?? "";
  const nameOf = new Map<number, { r: RowView; k: number }>();
  for (const r of view) {
    if (r.c[9] !== 0 || !r.c[14] || !(r.p[5] & PRICE_MASK.LISTED)) continue;
    const k = ordinaryRank(printingFacts(r, kindOf)), cur = nameOf.get(r.c[14]);
    if (!cur || k < cur.k || (k === cur.k && r.c[0] < cur.r.c[0])) nameOf.set(r.c[14], { r, k });
  }
  const nmRows: NameRow[] = names.map(({ o }) => { const pick = nameOf.get(o.no)?.r; return [o.no, o.name, o.slug, pick ? pick.c[1] : 0, o.nPrint, pick ? topCents(pick.p[1], pick.p[2]) : null, pick ? pick.c[3] : 0]; });
  for (let k = 0, n = 0; k < nmRows.length || n === 0; k += NAME_CHUNK, n++) w.put(nameChunkPath(n), `{"v":1,"n":${n},"r":[\n${lines(nmRows.slice(k, k + NAME_CHUNK))}\n]}`);
  w.sweep((f) => f.startsWith("slug/") || f.startsWith("sc/") || f.startsWith("or/") || f.startsWith("nm/"));
  // 5. boards and sealed
  const listed = view.filter((r) => r.p[5] & PRICE_MASK.LISTED);
  const bySet = new Map<number, RowView[]>(); for (const r of listed) { const a = bySet.get(r.c[4]); if (a) a.push(r); else bySet.set(r.c[4], [r]); }
  for (const [sid, list] of [...bySet].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => nsort((a.c[6] as string | 0) || null) - nsort((b.c[6] as string | 0) || null) || a.c[0] - b.c[0]);
    const rows: BoardRow[] = list.map((r) => {
      const hf = headFinishOf(r.p[5]); const tracked = (r.p[5] & (hf ? PRICE_MASK.TRACKF : PRICE_MASK.TRACKN)) !== 0; const a = tracked ? un.get(r.c[0] * 2 + hf) : undefined;
      return [r.c[0], r.c[1], r.c[2], r.c[6], r.c[8], r.c[9], r.c[10], r.c[11], r.c[12], r.c[5], r.p[1], r.p[2], r.p[3], r.p[4], r.p[5], a ? a.low : 0, a ? a.stores : 0, tracked ? statOf(r.p, hf).c7 : null];
    });
    const chunks = Math.max(1, Math.ceil(rows.length / BOARD_CHUNK));
    for (let k = 0; k < chunks; k++) w.put(boardPath(sid, k), `{"v":1,"set":${sid},"at":"${at}","n":${rows.length},"chunk":${k},"chunks":${chunks},"c":[\n${lines(rows.slice(k * BOARD_CHUNK, (k + 1) * BOARD_CHUNK))}\n]}`);
  }
  w.sweep((f) => f.startsWith("st/"));
  writeSealed(w, t, sealedRows, snap, at);
  // 6. the browse index
  // the flat offers of the store picker follow the same freshness rule as the aggregates: an offer is in stock only while the run of its (store, market) pair is at most STALE_HOURS old
  const runAt = new Map<string, number>(); for (const r of readJson<StoreRunsFile>(t, "ss/runs.json")?.r ?? []) runAt.set(`${r[0]}|${r[1]}`, Date.parse(r[2]));
  const asOf = Date.parse(ctx.offers?.asOf ?? new Date().toISOString());
  writeBrowseIndex(w, t, listed, oracles, oldOracle, un, (o) => o[5] === 1 && asOf - (runAt.get(`${o[2]}|${o[1]}`) ?? 0) <= STALE_HOURS * 3_600_000, at);
  // 7. the free views
  writeViews(w, t, ctx, view, listed, repOf, un, stats, sealedRows, at);
  // 8. files a fresh dataset needs before any later stage has run: an empty store-run list, the empty preview slices, an empty history index
  if (!t.has("ss/runs.json") && !w.has("ss/runs.json")) w.put("ss/runs.json", `{"v":1,"at":"${at}","r":[]}`);
  else if (t.has("ss/runs.json")) w.put("ss/runs.json", t.read("ss/runs.json"));
  if (!t.has("hist/index.json")) w.put("hist/index.json", `{"v":1,"days":[]}`);
  if (!t.has("pv/demand.json")) w.put("pv/demand.json", `{"v":1,"at":"${at}","days":7,"r":[]}`);
  if (!t.has("pv/rising.json")) w.put("pv/rising.json", `{"v":1,"at":"${at}","scopes":{}}`);
  wroteCatalogue.add(snap);
  return w.stats();
}

function buildSealedRows(snap: CatalogueSnapshot, old: Map<number, SealedRow>, stats: Map<number, UnitStat> | undefined): SealedRow[] {
  const rows: SealedRow[] = snap.sealed.map((s) => {
    const was = old.get(s.id);
    return [s.id, s.slug, s.name, z(s.setId), s.kind, z(s.packCount), z(s.releasedOn ?? snap.sets.find((q) => q.id === s.setId)?.releasedOn ?? null), s.presale ? SEALED_FLAGS.PRESALE : 0, s.marketUsd, s.lowTcg, was ? was[10] : 0, was ? was[11] : 0, stats ? stats.get(s.id * 2)?.c7 ?? null : was?.[12] ?? null] as SealedRow;
  });
  const have = new Set(rows.map((r) => r[0]));
  for (const [id, flags] of snap.absent?.sealed ?? []) { const was = old.get(id); if (was && !have.has(id)) rows.push([...was.slice(0, 7), flags, ...was.slice(8)] as SealedRow); }
  return rows.sort((a, b) => a[0] - b[0]);
}
function writeSealed(w: Writer, t: TreeView, rows: SealedRow[], snap: CatalogueSnapshot, at: string): void {
  const chunks = Math.max(1, Math.ceil(rows.length / SEALED_LIST_CHUNK));
  for (let k = 0; k < chunks; k++) w.put(sealedListPath(k), `{"v":1,"at":"${at}","chunk":${k},"chunks":${chunks},"s":[\n${lines(rows.slice(k * SEALED_LIST_CHUNK, (k + 1) * SEALED_LIST_CHUNK))}\n]}`);
  w.sweep((f) => /^sl\/list-\d+\.json$/.test(f));
  const oldOffers = new Map<number, SealedOfferTuple[]>(); for (const f of t.files()) if (/^sl\/d\/[0-9a-f]{2}\.json$/.test(f)) for (const p of readJson<SealedDetailFile>(t, f)?.p ?? []) oldOffers.set(p[0], p[2]);
  const contents = new Map<number, string | null>(snap.sealed.map((s) => [s.id, s.contents])); const oldContents = new Map<number, string | 0>(); for (const f of t.files()) if (/^sl\/d\/[0-9a-f]{2}\.json$/.test(f)) for (const p of readJson<SealedDetailFile>(t, f)?.p ?? []) oldContents.set(p[0], p[3]);
  const shards: unknown[][][] = Array.from({ length: 64 }, () => []);
  for (const r of rows) shards[Number.parseInt(hex2(fnv1a32(r[1]) % 64), 16)]!.push([r[0], r[1], oldOffers.get(r[0]) ?? [], contents.has(r[0]) ? z(contents.get(r[0])) : oldContents.get(r[0]) ?? 0]);
  shards.forEach((p, h) => w.put(`sl/d/${hex2(h)}.json`, `{"v":1,"h":${h},"p":[\n${lines(p)}\n]}`));
}

function writeBrowseIndex(w: Writer, t: TreeView, listed: RowView[], oracles: Map<number, OracleRow>, oldOracle: Map<number, (string | number)[]>, un: Map<number, UnAgg>, inStock: (o: OfferTuple) => boolean, at: string): void {
  const prevDict = readJson<IxDict>(t, "ix/dict.json");
  const sc = ["", ...(prevDict?.sc.slice(1) ?? [])], tr = ["", ...(prevDict?.tr.slice(1) ?? [])], lb = ["", ...(prevDict?.lb.slice(1) ?? [])];
  const maps = [sc, tr, lb].map((a) => new Map<string, number>(a.map((v, i) => [v, i] as const)));
  const di = (k: 0 | 1 | 2, v: string | number): number => { const s = String(v === 0 ? "" : v); if (!s) return 0; const m = maps[k]!; let i = m.get(s); if (i === undefined) { const arr = k === 0 ? sc : k === 1 ? tr : lb; i = arr.length; arr.push(s); m.set(s, i); } return i; };
  const nCh = Math.ceil(listed.length / IX_CHUNK);
  const flat: { uid: number; mk: number; st: number; pr: number }[] = [];
  for (const f of t.files()) if (f.startsWith("of/")) for (const o of readJson<OfferFile>(t, f)?.o ?? []) if (inStock(o)) flat.push({ uid: o[0], mk: o[1], st: o[2], pr: o[3] });
  flat.sort((a, b) => a.uid - b.uid || a.mk - b.mk || a.st - b.st || a.pr - b.pr);
  for (let ch = 0; ch < nCh; ch++) {
    const rows = listed.slice(ch * IX_CHUNK, (ch + 1) * IX_CHUNK);
    const K: IxK = { v: 1, n: rows.length, id: [], slug: [], name: [], set: [], sc: [], num: [], ns: [], rar: "", cls: "", tr: [], lb: [], fl: [], or: [], co: [], mv: [], pt: "", alt: {}, sid: {} };
    const P: IxP = { v: 1, n: rows.length, mn: [], mf: [], ln: [], lf: [], mk: [], t: [] };
    const S: IxS = { v: 1, at, u: [] };
    rows.forEach((r, i) => {
      const c = r.c, p = r.p;
      K.id.push(c[0]); K.slug.push(c[1]); K.name.push(c[2]); K.set.push(c[4]); K.sc.push(di(0, c[5])); K.num.push((c[6] as string | 0) || ""); K.ns.push(nsort((c[6] as string | 0) || null)); K.rar += c[8]; K.cls += String(c[9]);
      K.tr.push(di(1, c[10])); K.lb.push(di(2, c[11])); K.fl.push(c[12]); K.or.push(c[14]); K.co.push(c[18]); K.mv.push(c[19]); K.pt += String(Math.max(0, Math.min(9, c[20])));
      if (c[3]) K.alt[i] = c[3] as string;
      if (c[15] && (!(c[12] & CARD_FLAGS.TCGIMG) || (c[12] & CARD_FLAGS.DFC))) K.sid[i] = c[15] as string;      // the Scryfall id of a list tile: only where it is the image (no TCGplayer scan) or a back face exists; the card page reads cat[15]
      P.mn.push(p[1] ?? -1); P.mf.push(p[2] ?? -1); P.ln.push(p[3] ?? -1); P.lf.push(p[4] ?? -1); P.mk.push(p[5]);
      for (const f of [0, 1] as const) {
        if (!(p[5] & (f === 0 ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKF))) continue;
        const st = statOf(p, f); if (st.c7 != null || st.c30 != null) P.t.push([i, f, Math.round((st.c7 ?? 0) * 10), Math.round((st.c30 ?? 0) * 10)]);       // a tracked unit with no change figure has no `t` row: its change reads as unknown, not 0.0% (REQ-WP02-5)
        const a = un.get(c[0] * 2 + f); if (a) S.u.push([i, f, ...a.low.map((x) => x ?? -1), ...a.stores, ...a.smin.map((x) => x ?? -1)]);
      }
    });
    w.put(ixPath("k", ch), j(K)); w.put(ixPath("p", ch), j(P)); w.put(ixPath("s", ch), j(S));
  }
  // the flat in-stock offers of the store picker (<= 40,000 rows a chunk) over the tracked units that survive; rebuilt from the of files (reconciled in phase 1)
  const fch = Math.ceil(flat.length / IX_FLAT_CHUNK);
  for (let k = 0; k < fch; k++) { const part = flat.slice(k * IX_FLAT_CHUNK, (k + 1) * IX_FLAT_CHUNK); w.put(ixPath("f", k), j({ v: 1, n: part.length, uid: part.map((o) => o.uid), mk: part.map((o) => o.mk).join(""), st: part.map((o) => o.st), pr: part.map((o) => o.pr) } satisfies IxF)); }
  w.put("ix/dict.json", j({ v: 1, chunk: IX_CHUNK, rows: listed.length, sc, tr, lb } satisfies IxDict));
  // oracle columns, 16,384 oracles a file
  const legal = [""], kw = [""]; const lm = new Map<string, number>([["", 0]]), km = new Map<string, number>([["", 0]]);
  const prevOdict = readJson<IxOdict>(t, "ix/odict.json"); for (const v of prevOdict?.legal.slice(1) ?? []) { lm.set(v, legal.length); legal.push(v); } for (const v of prevOdict?.keywords.slice(1) ?? []) { km.set(v, kw.length); kw.push(v); }
  const dj = (m: Map<string, number>, arr: string[], v: string): number => { let i = m.get(v); if (i === undefined) { i = arr.length; arr.push(v); m.set(v, i); } return i; };
  const all: { no: number; co: number; idn: number; lg: string; ed: number; fl: number; kw: string }[] = [...oracles.values()].map((o) => ({ no: o.no, co: o.colors, idn: o.identity, lg: o.legal, ed: o.edhrecRank ?? -1, fl: o.flags, kw: o.keywords }));
  for (const [no, r] of oldOracle) all.push({ no, co: Number(r[7]), idn: Number(r[8]), lg: String(r[9]), ed: Number(r[10]) || -1, fl: Number(r[11]), kw: String(r[16]) });
  all.sort((a, b) => a.no - b.no);
  const OC = 16384;
  for (let k = 0, n = 0; k < all.length || n === 0; k += OC, n++) {
    const part = all.slice(k, k + OC); const O: IxO = { v: 1, n: part.length, no: [], co: [], idn: [], lg: [], ed: [], fl: [], kw: [] };
    for (const o of part) { O.no.push(o.no); O.co.push(o.co); O.idn.push(o.idn); O.lg.push(dj(lm, legal, o.lg)); O.ed.push(o.ed); O.fl.push(o.fl); O.kw.push(dj(km, kw, o.kw)); }
    w.put(ixPath("o", n), j(O));
  }
  w.put("ix/odict.json", j({ v: 1, legal, keywords: kw } satisfies IxOdict));
  w.sweep((f) => /^ix\/(k|p|s|o)-\d+\.json$/.test(f) || /^ix\/f-\d+\.json$/.test(f) || f === "ix/dict.json" || f === "ix/odict.json");
}

// ── the free views: movers, market, records, home, sitemaps (everything a signed-out visitor sees; nothing ranked beyond the public lists of OP) ─────────────────────────
const MIN_BUY = 300, MIN_BELOW = 100, MAX_BELOW_PCT = 75;                        // the "Underpriced vs TCGplayer" predicate of deals.ts, the counts the home page quotes
const RELEASE_KINDS: readonly string[] = ["expansion", "core", "masters", "commander"];
const currencyOfCountry = (c: Country): string => ({ US: "USD", AU: "AUD", UK: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" })[c];
function writeViews(w: Writer, t: TreeView, ctx: ImportContext, view: RowView[], listed: RowView[], repOf: Map<number, RowView>, un: Map<number, UnAgg>, stats: Map<number, UnitStat> | undefined, sealedRows: SealedRow[], at: string): void {
  const snap = ctx.snapshot; const setById = new Map(snap.sets.map((s) => [s.id, s]));
  const scOf = (r: RowView): string => ((r.c[5] as string | 0) || setById.get(r.c[4])?.tok || "");
  // trailing elements are additive inside v1 (REQ-WP15-1): change7d, the printing label (0 for none) and the printing key
  const tile = (r: RowView, c7: number | null = null): HomeTileRow => { const hf = headFinishOf(r.p[5]); return [r.c[0], r.c[1], r.c[2], scOf(r), r.c[6], r.c[8], r.c[12], hf, marketOfUnit(r.p, hf), c7, r.c[11], printingOf(r.c[10] ? (r.c[10].split(" ") as TreatmentKey[]) : [])] as unknown as HomeTileRow; };
  // movers: tracked class-0 units with a change figure
  interface U { r: RowView; f: 0 | 1; c7: number | null; c30: number | null; cents: number }
  const units: U[] = [];
  for (const r of listed) {
    if (r.c[9] !== 0 || (r.p[5] & PRICE_MASK.GONE)) continue;
    for (const f of [0, 1] as const) { if (!(r.p[5] & (f === 0 ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKF))) continue; const m = marketOfUnit(r.p, f); if (m == null) continue; const st = statOf(r.p, f); units.push({ r, f, c7: st.c7, c30: st.c30, cents: m }); }
  }
  const headlineUnits = ((): U[] => { const by = new Map<number, U[]>(); for (const u of units) { const a = by.get(u.r.c[0]); if (a) a.push(u); else by.set(u.r.c[0], [u]); } return [...by.values()].map((l) => l.find((u) => u.f === headFinishOf(u.r.p[5])) ?? l[0]!); })();
  const moverRow = (u: U, change: number): MoverRow => [u.r.c[0], u.f, u.r.c[1], u.r.c[2], scOf(u.r), u.r.c[6], u.r.c[8], u.r.c[12], u.cents, change];
  for (const win of [7, 30] as const) for (const vw of ["a", "n", "f"] as const) {
    const pool = (vw === "a" ? headlineUnits : units.filter((u) => (vw === "n") === (u.f === 0))).map((u) => ({ u, c: win === 7 ? u.c7 : u.c30 })).filter((x): x is { u: U; c: number } => x.c != null);
    for (const dir of ["up", "down"] as const) {
      const pick = pool.filter((x) => (dir === "up" ? x.c > 0 : x.c < 0)).sort((a, b) => (dir === "up" ? b.c - a.c : a.c - b.c) || b.u.cents - a.u.cents || a.u.r.c[0] - b.u.r.c[0]).slice(0, 100);
      w.put(moversPath(dir, win, vw), `{"v":1,"at":"${at}","r":[\n${lines(pick.map((x) => moverRow(x.u, x.c)))}\n]}`);
    }
  }
  if (stats) {
    const rec = units.map((u) => { const s = stats.get(u.r.c[0] * 2 + u.f); const pv = s?.prevCents; return { u, pct: pv && pv > 0 ? Math.round(((u.cents - pv) * 1000) / pv) / 10 : 0 }; }).filter((x) => x.pct !== 0).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.u.r.c[0] - b.u.r.c[0]).slice(0, 24);
    w.put("mv/recent.json", `{"v":1,"at":"${at}","r":[\n${lines(rec.map((x) => moverRow(x.u, x.pct)))}\n]}`);
  } else if (t.has("mv/recent.json")) w.put("mv/recent.json", t.read("mv/recent.json"));
  else w.put("mv/recent.json", `{"v":1,"at":"${at}","r":[]}`);
  w.sweep((f) => f.startsWith("mv/"));
  // market overview: the basket of listed singles priced at US$1+ on their headline MARKET, the 200 constituents, the per-set totals
  const head = (r: RowView): number | null => marketOfUnit(r.p, headFinishOf(r.p[5]));
  const basket = listed.filter((r) => r.c[9] === 0 && !(r.p[5] & PRICE_MASK.GONE)).map((r) => ({ r, v: head(r) })).filter((x): x is { r: RowView; v: number } => x.v != null);
  const vals = basket.filter((x) => x.v >= 100).map((x) => x.v).sort((a, b) => a - b); const total = vals.reduce((a, b) => a + b, 0);
  let adv = 0, dec = 0; for (const u of units) { if (u.c7 != null) { if (u.c7 > 0) adv++; else if (u.c7 < 0) dec++; } }
  const cons = [...basket].sort((a, b) => b.v - a.v || a.r.c[0] - b.r.c[0]).slice(0, 200).map((x) => [x.r.c[0], x.r.c[1], x.r.c[2], x.v] as [number, string, string, number]);
  const setStats = new Map<number, [number, number]>(); for (const x of basket) { const e = setStats.get(x.r.c[4]) ?? [0, 0]; e[0]++; e[1] += x.v; setStats.set(x.r.c[4], e); }
  const overview: MarketFile = { v: 1, at, basket: { n: vals.length, totalUsd: total, avg: vals.length ? Math.round(total / vals.length) : 0, median: vals.length ? vals[Math.floor(vals.length / 2)]! : 0 }, adv, dec, cons, sets: [...setStats].sort((a, b) => a[0] - b[0]).map(([id, [n, tt]]) => [id, n, tt] as [number, number, number]) };
  w.put("mk/overview.json", j(overview));
  // records: the biggest cross-market STORE gaps per home market (stores only, never TCGplayer's price), and the 90-day highs and lows of tracked units
  const XMIN_HOME = 500, XMIN_PCT = 15, XMAX_PCT = 70, XMIN_SAVE = 500, TOPN = 10;
  const gaps: RecordsFile["gaps"] = {};
  MARKETS.forEach((home, hi) => {
    const rows: RecordsFile["gaps"][string] = [];
    for (const [uid, a] of un) {
      const h = a.smin[hi]; if (h == null || h < XMIN_HOME) continue; let bestRow: RecordsFile["gaps"][string][number] | null = null;
      MARKETS.forEach((away, ai) => {
        if (ai === hi) return; const v = a.smin[ai]; if (v == null) return;
        const conv = usdCentsToCountry(toUsdCents(v, currencyOfCountry(away)), home); const save = h - conv; const pct = Math.round((save / h) * 1000) / 10;
        if (pct < XMIN_PCT || pct > XMAX_PCT || save < XMIN_SAVE) return;
        if (!bestRow || save > bestRow[5]) bestRow = [uid, hi, ai, v, conv, save, pct];
      });
      if (bestRow) rows.push(bestRow);
    }
    gaps[home] = rows.sort((x, y) => y[5] - x[5] || y[6] - x[6] || x[0] - y[0]).slice(0, TOPN);
  });
  const trk = units.filter((u) => u.cents >= 500).map((u) => ({ u, hi: statOf(u.r.p, u.f).hi })).filter((x): x is { u: U; hi: number } => x.hi != null && x.hi > 0);
  const highs = trk.filter((x) => x.u.cents >= x.hi).sort((a, b) => b.u.cents - a.u.cents || a.u.r.c[0] * 2 + a.u.f - (b.u.r.c[0] * 2 + b.u.f)).slice(0, TOPN).map((x) => [x.u.r.c[0] * 2 + x.u.f, x.u.cents, x.hi] as [number, number, number]);
  const lows = trk.filter((x) => x.u.cents < x.hi).map((x) => ({ x, pct: Math.round(((x.hi - x.u.cents) * 1000) / x.hi) / 10 })).sort((a, b) => b.pct - a.pct || a.x.u.r.c[0] - b.x.u.r.c[0]).slice(0, TOPN).map((q) => [q.x.u.r.c[0] * 2 + q.x.u.f, q.x.u.cents, q.x.hi, q.pct] as [number, number, number, number]);
  w.put("mk/records.json", j({ v: 1, at, gaps, highs, lows } satisfies RecordsFile));
  // deals: only the COUNTS and the one free savings row per market are published (the ranked list is computed per request behind the entitlement gate)
  const dealCounts: number[] = [], dealsFree: HomeFile["dealsFree"] = [];
  MARKETS.forEach((mkt, mi) => {
    const rows: { id: number; uid: number; buy: number; pct: number; r: RowView }[] = [];
    for (const [uid, a] of un) {
      const buy = a.smin[mi]; if (buy == null || buy < MIN_BUY) continue;
      const id = Math.floor(uid / 2), f = (uid % 2) as 0 | 1;
      const row = rowById(view, id); if (!row || !(row.p[5] & PRICE_MASK.LISTED)) continue;
      const m = marketOfUnit(row.p, f); if (m == null) continue;
      const ref = usdCentsToCountry(m, mkt); const below = ref - buy; if (below < MIN_BELOW) continue;
      const lo = f === 0 ? row.p[3] : row.p[4]; if (mi === 0 && lo != null && lo <= buy) continue;
      const pct = Math.round((below / ref) * 1000) / 10; if (pct > MAX_BELOW_PCT) continue;
      rows.push({ id, uid, buy, pct, r: row });
    }
    rows.sort((a, b) => b.pct - a.pct || a.uid - b.uid); dealCounts.push(rows.length);
    dealsFree.push(rows[0] ? [rows[0].id, rows[0].r.c[1], rows[0].r.c[2], rows[0].buy, rows[0].pct, scOf(rows[0].r), rows[0].r.c[6], rows[0].r.c[12], headFinishOf(rows[0].r.p[5])] as unknown as NonNullable<HomeFile["dealsFree"][number]> : null);
  });
  // the home payload
  const reps = [...repOf.values()].filter((r) => r.c[9] === 0 && !(r.p[5] & PRICE_MASK.GONE));
  const byValue = [...reps].sort((a, b) => (topCents(b.p[1], b.p[2]) ?? 0) - (topCents(a.p[1], a.p[2]) ?? 0) || a.c[0] - b.c[0]);
  const edh = new Map<number, number>(); for (const o of snap.oracles) if (o.edhrecRank) edh.set(o.no, o.edhrecRank);
  // `popular` shows the printing a player buys (REQ-WP15-14): the cheapest plain Normal printing in a main set (search.ts isOrdinaryPrinting, the tier-0 printing a bare name opens), the dearest only when the oracle has none; `chase` keeps the dearest
  const plain = (r: RowView): boolean => isOrdinaryPrinting(printingFacts(r, (sid) => setById.get(sid)?.kind ?? ""));
  const cheapestPlain = new Map<number, RowView>();
  for (const r of view) { if (!r.c[14] || !(r.p[5] & PRICE_MASK.LISTED) || !plain(r)) continue; const cur = cheapestPlain.get(r.c[14]); if (!cur || r.p[1]! < cur.p[1]! || (r.p[1] === cur.p[1] && r.c[0] < cur.c[0])) cheapestPlain.set(r.c[14], r); }
  const byPopularity = reps.filter((r) => (topCents(r.p[1], r.p[2]) ?? 0) >= 100 && edh.has(r.c[14])).sort((a, b) => edh.get(a.c[14])! - edh.get(b.c[14])! || a.c[0] - b.c[0]).map((r) => cheapestPlain.get(r.c[14]) ?? r);
  const sorted7 = headlineUnits.filter((u) => u.c7 != null).sort((a, b) => b.c7! - a.c7! || a.r.c[0] - b.r.c[0]);
  const releasedMain = snap.sets.filter((s) => s.releasedOn && RELEASE_KINDS.includes(s.kind));
  const home: HomeFile = {
    v: 1, at, stats: { cards: listed.filter((r) => r.c[9] === 0).length, tracked: units.length, sets: snap.sets.length, sealed: sealedRows.filter((s) => !(s[7] & SEALED_FLAGS.GONE)).length, oracles: new Set(view.map((r) => r.c[14]).filter(Boolean)).size },
    newest: releasedMain.filter((s) => s.releasedOn! <= ctx.day).sort((a, b) => (a.releasedOn! < b.releasedOn! ? 1 : a.releasedOn! > b.releasedOn! ? -1 : b.id - a.id)).slice(0, 6).map((s) => s.id),
    upcoming: releasedMain.filter((s) => s.releasedOn! > ctx.day).sort((a, b) => (a.releasedOn! < b.releasedOn! ? -1 : a.releasedOn! > b.releasedOn! ? 1 : a.id - b.id)).slice(0, 6).map((s) => s.id),
    chase: byValue.slice(0, 64).map(tile), popular: byPopularity.slice(0, 12).map(tile), up: sorted7.filter((u) => u.c7! > 0).slice(0, 4).map((u) => tile(u.r, u.c7)), down: [...sorted7].reverse().filter((u) => u.c7! < 0).slice(0, 4).map((u) => tile(u.r, u.c7)), dealCounts, dealsFree,
  };
  w.put("hm/home.json", j(home));
  // sitemap path lists (slugs; the route prefixes them), 10,000 a file
  const section = (kind: string, paths: string[]): number => { const n = Math.max(1, Math.ceil(paths.length / SITEMAP_SECTION)); for (let k = 0; k < n; k++) w.put(sitemapPath(kind, k), j(paths.slice(k * SITEMAP_SECTION, (k + 1) * SITEMAP_SECTION))); return n; };
  const indexable = view.filter((r) => isIndexable(r.p[5], r.c[9])); const idxOracles = new Set(indexable.map((r) => r.c[14]));
  const oracleSlugs = snap.oracles.length ? snap.oracles : [];
  const plan: SitemapPlanFile = {
    v: 1,
    sets: section("sets", snap.sets.filter((s) => !["art-series", "oversized"].includes(s.kind)).map((s) => s.slug)),
    sealed: section("sealed", sealedRows.filter((s) => !(s[7] & SEALED_FLAGS.GONE)).map((s) => s[1])),
    commanders: section("commanders", oracleSlugs.filter((o) => o.flags & ORACLE_FLAGS.COMMANDER && o.nPrint > 0).map((o) => o.slug)),
    names: section("names", oracleSlugs.filter((o) => o.nPrint >= 2 && idxOracles.has(o.no)).map((o) => o.slug)),
    cards: section("cards", indexable.map((r) => r.c[1])), urls: { cards: indexable.length },
  };
  w.put("sm/plan.json", j(plan));
  w.sweep((f) => f.startsWith("sm/"));
}
const rowIndexCache = new WeakMap<RowView[], Map<number, RowView>>();
function rowById(view: RowView[], id: number): RowView | undefined { let m = rowIndexCache.get(view); if (!m) { m = new Map(view.map((r) => [r.c[0], r])); rowIndexCache.set(view, m); } return m.get(id); }

// ── the published tree as a snapshot (phase 2 and the jobs that only fold new data into a published catalogue) ────────────────────────────────────────────────────────
function oracleFromTuple(r: (string | number)[]): OracleRow {
  return { no: Number(r[0]), scryfallId: String(r[1]), slug: String(r[2]), name: String(r[3]), nameKey: fold(String(r[3])), manaCost: String(r[4]), manaValue: Number(r[5]), typeLine: String(r[6]), colors: Number(r[7]), identity: Number(r[8]), legal: String(r[9]), edhrecRank: r[10] ? Number(r[10]) : null, flags: Number(r[11]), layout: r[12] ? String(r[12]) : "normal", pt: r[13] ? String(r[13]) : null, loyalty: r[14] ? String(r[14]) : null, oracleText: r[15] ? String(r[15]) : null, keywords: String(r[16]), faces: r[17] ? Number(r[17]) : 1, nPrint: Number(r[18]) };
}
/** The phase-2 view of a published tree: every row is CARRIED (snapshot.absent) so writeCatalogueFiles re-derives the dependent files (boards, index columns, home, records) from the tree plus the new store data and leaves every identity and price byte as it is. */
export function snapshotFromTree(t: TreeView, day: string): CatalogueSnapshot {
  const cards: [number, number][] = []; const units: UnitRef[] = [];
  for (const f of t.files()) if (f.startsWith("px/")) for (const r of readJson<{ p: PxRow[] }>(t, f)?.p ?? []) { cards.push([r[0], r[5]]); if (r[5] & PRICE_MASK.TRACKN) units.push({ id: r[0], finish: "N" }); if (r[5] & PRICE_MASK.TRACKF) units.push({ id: r[0], finish: "F" }); }
  const sets = (readJson<SetsFile>(t, "meta/sets.json")?.sets ?? []).map((r): SetRow => ({ id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[5] || r[4], kind: r[6] as SetKind, releasedOn: r[7] || null, bucket: r[8] === 1, scry: r[9] || null }));
  const sealed: [number, number][] = []; for (const f of t.files()) if (/^sl\/list-\d+\.json$/.test(f)) for (const r of readJson<SealedListFile>(t, f)?.s ?? []) sealed.push([r[0], r[7]]);
  const oracles: OracleRow[] = []; for (const f of t.files()) if (f.startsWith("or/")) for (const r of readJson<{ o: (string | number)[][] }>(t, f)?.o ?? []) oracles.push(oracleFromTuple(r));
  const scry = readJson<ScrySetsFile>(t, "meta/scrysets.json")?.sets ?? [];
  const status = readJson<{ pointer?: { tcgcsv?: string; scryfall?: string } }>(t, "status.json");
  const snap: CatalogueSnapshot = {
    day, sets, oracles, cards: [], prices: [], sealed: [], units, absent: { cards, sealed, sets: [] },
    scrySets: scry.map((s) => ({ code: s[0], name: s[1], setType: s[2], releasedAt: s[3] || null, parentSetCode: s[4] || null, tcgplayerId: null, digital: false })),
    stamps: { tcgcsv: status?.pointer?.tcgcsv ?? `${day}T00:00:00Z`, scryfall: status?.pointer?.scryfall ?? "" },
  };
  return snap;
}
/** The match rows of a published tree (phase 2 has no TCGCSV or Scryfall in memory): names from the catalogue row, its oracle and its faces. */
export function matchRowsFromTree(t: TreeView): MatchRow[] {
  const oracle = new Map<number, OracleRow>(); for (const f of t.files()) if (f.startsWith("or/")) for (const r of readJson<{ o: (string | number)[][] }>(t, f)?.o ?? []) oracle.set(Number(r[0]), oracleFromTuple(r));
  const sets = new Map<number, SetRow>(); for (const r of readJson<SetsFile>(t, "meta/sets.json")?.sets ?? []) sets.set(r[0], { id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[5] || r[4], kind: r[6] as SetKind, releasedOn: r[7] || null, bucket: r[8] === 1, scry: r[9] || null });
  const scry = new Map<string, string>(); for (const s of readJson<ScrySetsFile>(t, "meta/scrysets.json")?.sets ?? []) scry.set(s[0], s[1]);
  const out: MatchRow[] = [];
  for (const f of t.files()) {
    if (!f.startsWith("cat/")) continue; const b = Number(/\/(\d+)\.json$/.exec(f)![1]); const px = new Map<number, PxRow>((readJson<{ p: PxRow[] }>(t, bucketPath("px", b))?.p ?? []).map((r) => [r[0], r]));
    for (const c of readJson<{ c: CatRow[] }>(t, f)?.c ?? []) {
      const p = px.get(c[0]); if (!p || !(p[5] & PRICE_MASK.LISTED)) continue; const o = c[14] ? oracle.get(c[14]) : undefined; const set = sets.get(c[4]);
      const names = new Set<string>(); const add = (v: string | number | null | undefined): void => { const q = fold(v == null || v === 0 ? "" : String(v)); if (q) names.add(q); };
      add(c[2]); add(c[3]); add(c[17]); add(o?.name); for (const part of (o?.name ?? c[2]).split(" // ")) add(part);
      const setNames = new Set<string>(); const sn = (v: string | null | undefined): void => { const q = fold(v); if (q) setNames.add(q); };
      if (c[5]) sn(scry.get(String(c[5]))); if (set) { sn(set.tcgName); for (const pre of ["Commander: ", "Universes Beyond: ", "Art Series: ", "Promo Pack: "]) if (set.tcgName.startsWith(pre)) sn(set.tcgName.slice(pre.length)); }
      out.push({ id: c[0], groupId: c[4], names: [...names], sc: (c[5] as string | 0) || set?.scry || null, setNames: [...setNames], nkey: nkey((c[6] as string | 0) || null), treat: c[10] ? (c[10].split(" ") as TreatmentKey[]) : [], hasN: (p[5] & PRICE_MASK.HASN) !== 0, hasF: (p[5] & PRICE_MASK.HASF) !== 0, etched: (c[12] & CARD_FLAGS.ETCHED) !== 0, rootId: (c[16] as number | 0) || null, cls: c[9], label: (c[11] as string | 0) || null, abbr: abbrOfSet(set), scryId: (c[15] as string | 0) || null, starScryId: null });
    }
  }
  return out;
}

// ── S9: aggregates ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const aggregateInfo = new WeakMap<ImportContext, { offersPruned: number; dropped: number }>();
/** What the last aggregate() of this context did beyond its return value (the run summary's offersPruned). */
export const aggregateInfoOf = (ctx: ImportContext): { offersPruned: number; dropped: number } => aggregateInfo.get(ctx) ?? { offersPruned: 0, dropped: 0 };
const better = (a: OfferTuple, b: OfferTuple): boolean => (a[5] !== b[5] ? a[5] > b[5] : a[4] !== b[4] ? (a[4] ?? 0) < (b[4] ?? 0) : a[3] !== b[3] ? a[3] < b[3] : a[6] < b[6]);   // in stock first, best condition, lowest price, lowest path
/** S9. Folds the staged store offers (ctx.offers) and TCGplayer's own lows into un, of, ss and sl/d, then re-derives everything that quotes them (boards, index columns, flat offers, sealed lists, home, records) through writeCatalogueFiles.
 *  A pair (store, market) that was READ this run replaces its rows; a pair that failed or was not read keeps its rows and its run row (their age reads them out of stock after 72 hours). One row per (unit, market, store): in stock first, best condition, lowest price, lowest path.
 *  Offers are pruned by unit value when the published rows would pass OFFER_ROWS_BUDGET. eBay is never an input. */
export function aggregate(ctx: ImportContext, stores: readonly StoreResult[]): { units: number; offers: number; files: number } {
  const t = ctx.work; const w = new Writer(t); const snap = ctx.snapshot; const at = dayStamp(snap); const stage = ctx.offers;
  const asOf = Date.parse(stage?.asOf ?? new Date().toISOString());
  const reads = new Map<string, StagedRead>(); for (const r of stage?.reads ?? []) reads.set(`${r.store}|${r.market}`, r);
  const okPairs = new Set<string>([...reads].filter(([, r]) => r.ok).map(([k]) => k));
  // previous rows of the pairs not refreshed
  const kept: OfferTuple[] = [];
  for (const f of t.files()) if (f.startsWith("of/")) for (const o of readJson<OfferFile>(t, f)?.o ?? []) if (ctx.tracked.has(o[0]) && !okPairs.has(`${o[2]}|${o[1]}`)) kept.push(o);
  const fresh: OfferTuple[] = []; for (const o of stage?.cards ?? []) if (ctx.tracked.has(o.uid) && okPairs.has(`${o.store}|${o.market}`)) fresh.push([o.uid, o.market, o.store, o.priceCents, o.condition, o.inStock, o.path]);
  const best = new Map<string, OfferTuple>();
  for (const o of [...kept, ...fresh]) { const k = `${o[0]}|${o[1]}|${o[2]}`; const cur = best.get(k); if (!cur || better(o, cur)) best.set(k, o); }
  let rows = [...best.values()];
  // the run rows (ss/runs.json): fresh reads replace their pair, the others stay
  const prevRuns = new Map<string, StoreRunRow>(); for (const r of readJson<StoreRunsFile>(t, "ss/runs.json")?.r ?? []) prevRuns.set(`${r[0]}|${r[1]}`, r);
  const perPair = new Map<string, { offers: number; inStock: number; singles: number; sealed: number; cheapest: number }>();
  const pair = (s: number, m: number): { offers: number; inStock: number; singles: number; sealed: number; cheapest: number } => { const k = `${s}|${m}`; let e = perPair.get(k); if (!e) perPair.set(k, (e = { offers: 0, inStock: 0, singles: 0, sealed: 0, cheapest: 0 })); return e; };
  const runAt = (s: number, m: number): number => { const r = reads.get(`${s}|${m}`); if (r?.ok) return Date.parse(r.at); const p = prevRuns.get(`${s}|${m}`); return p ? Date.parse(p[2]) : 0; };
  const fresher = (o: OfferTuple): boolean => o[5] === 1 && asOf - runAt(o[2], o[1]) <= STALE_HOURS * 3_600_000;
  // offer budget: drop the offers of the cheapest units until the rows fit
  const valueOf = new Map<number, number>(); for (const f of t.files()) if (f.startsWith("px/")) for (const r of readJson<{ p: PxRow[] }>(t, f)?.p ?? []) { valueOf.set(r[0] * 2, r[1] ?? r[3] ?? 0); valueOf.set(r[0] * 2 + 1, r[2] ?? r[4] ?? 0); }
  let pruned = 0;
  if (rows.length > ctx.cfg.offerRowsBudget) {
    const byUnit = new Map<number, OfferTuple[]>(); for (const o of rows) { const a = byUnit.get(o[0]); if (a) a.push(o); else byUnit.set(o[0], [o]); }
    const order = [...byUnit.keys()].sort((a, b) => (valueOf.get(a) ?? 0) - (valueOf.get(b) ?? 0) || a - b); let n = rows.length; const drop = new Set<number>();
    for (const u of order) { if (n <= ctx.cfg.offerRowsBudget) break; n -= byUnit.get(u)!.length; drop.add(u); }
    pruned = rows.length - n; rows = rows.filter((o) => !drop.has(o[0]));
  }
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  // un: one row per tracked unit
  const price = new Map<number, PxRow>(); for (const f of t.files()) if (f.startsWith("px/")) for (const r of readJson<{ p: PxRow[] }>(t, f)?.p ?? []) price.set(r[0], r);
  const agg = new Map<number, UnAgg>(); for (const u of ctx.tracked) agg.set(u, { low: MARKETS.map(() => null), stores: MARKETS.map(() => 0), smin: MARKETS.map(() => null) });
  for (const o of rows) {
    const e = pair(o[2], o[1]); e.offers++;
    if (!fresher(o)) continue; e.inStock++; e.singles++;
    const a = agg.get(o[0])!; const m = o[1];
    a.stores[m]!++; a.smin[m] = a.smin[m] == null ? o[3] : Math.min(a.smin[m]!, o[3]); a.low[m] = a.low[m] == null ? o[3] : Math.min(a.low[m]!, o[3]);
  }
  for (const [uid, a] of agg) { const p = price.get(Math.floor(uid / 2)); const lo = p ? (uid % 2 === 0 ? p[3] : p[4]) : null; if (lo != null) a.low[0] = a.low[0] == null ? lo : Math.min(a.low[0]!, lo); }
  for (const o of rows) { if (!fresher(o)) continue; const a = agg.get(o[0]); if (a && a.smin[o[1]] === o[3]) pair(o[2], o[1]).cheapest++; }
  const byBucket = new Map<number, UnRow[]>(); for (const [uid, a] of [...agg].sort((x, y) => x[0] - y[0])) { const b = cardBucket(Math.floor(uid / 2)); const l = byBucket.get(b) ?? []; l.push([uid, a.low, a.stores, a.smin]); byBucket.set(b, l); }
  const ofBucket = new Map<number, OfferTuple[]>(); for (const o of rows) { const b = cardBucket(Math.floor(o[0] / 2)); const l = ofBucket.get(b) ?? []; l.push(o); ofBucket.set(b, l); }
  for (const [b, u] of [...byBucket].sort((x, y) => x[0] - y[0])) w.put(bucketPath("un", b), `{"v":1,"b":${b},"at":"${at}","u":[\n${lines(u)}\n]}`);
  for (const [b, o] of [...ofBucket].sort((x, y) => x[0] - y[0])) w.put(bucketPath("of", b), `{"v":1,"b":${b},"at":"${at}","o":[\n${lines(o)}\n]}`);
  w.sweep((f) => f.startsWith("un/") || f.startsWith("of/"));
  // sealed offers: sl/d keeps its contents; the rows of the pairs read this run are replaced
  const sealedPrev = new Map<number, SealedOfferTuple[]>(); for (const f of t.files()) if (/^sl\/d\/[0-9a-f]{2}\.json$/.test(f)) for (const p of readJson<SealedDetailFile>(t, f)?.p ?? []) sealedPrev.set(p[0], p[2]);
  const sealedNew = new Map<number, SealedOfferTuple[]>();
  for (const [id, os] of sealedPrev) sealedNew.set(id, os.filter((o) => !okPairs.has(`${o[1]}|${o[0]}`)));
  for (const o of stage?.sealed ?? []) if (okPairs.has(`${o.store}|${o.market}`)) { const a = sealedNew.get(o.productId) ?? []; a.push([o.market, o.store, o.priceCents, o.condition, o.inStock, o.path]); sealedNew.set(o.productId, a); }
  const sealedBest = new Map<number, SealedOfferTuple[]>();
  for (const [id, os] of sealedNew) { const m = new Map<string, SealedOfferTuple>(); for (const o of os) { const k = `${o[0]}|${o[1]}`; const cur = m.get(k); if (!cur || (o[4] !== cur[4] ? o[4] > cur[4] : (o[3] ?? 0) !== (cur[3] ?? 0) ? (o[3] ?? 0) < (cur[3] ?? 0) : o[2] !== cur[2] ? o[2] < cur[2] : o[5] < cur[5])) m.set(k, o); } sealedBest.set(id, [...m.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])); }
  for (const [id, os] of sealedBest) for (const o of os) { const e = pair(o[1], o[0]); e.offers++; if (o[4] === 1 && asOf - runAt(o[1], o[0]) <= STALE_HOURS * 3_600_000) { e.inStock++; e.sealed++; } }
  rewriteSealedOffers(t, w, sealedBest, asOf, runAt);
  // runs and per-store listings
  const runs: StoreRunRow[] = [];
  const keys = new Set<string>([...perPair.keys(), ...prevRuns.keys(), ...reads.keys()]);
  for (const k of [...keys].sort()) {
    const [s, m] = k.split("|").map(Number) as [number, number]; const rd = reads.get(k); const e = perPair.get(k) ?? { offers: 0, inStock: 0, singles: 0, sealed: 0, cheapest: 0 }; const was = prevRuns.get(k);
    if (rd?.ok) runs.push([s, m, rd.at, 1, e.offers, e.inStock, e.singles, e.sealed, e.cheapest]);
    else if (was) runs.push([s, m, was[2], rd ? 0 : was[3], was[4], was[5], was[6], was[7], was[8]]);
    else if (rd) runs.push([s, m, rd.at, 0, 0, 0, 0, 0, 0]);
  }
  w.put("ss/runs.json", j({ v: 1, at, r: runs } satisfies StoreRunsFile));
  const top = new Map<string, OfferTuple[]>(), cheap = new Map<string, OfferTuple[]>();
  for (const o of rows) { if (!fresher(o)) continue; const k = `${o[2]}-${o[1]}`; (top.get(k) ?? top.set(k, []).get(k)!).push(o); const a = agg.get(o[0]); if (a && a.smin[o[1]] === o[3]) (cheap.get(k) ?? cheap.set(k, []).get(k)!).push(o); }
  const tup = (o: OfferTuple): StoreListingsFile["top"][number] => [o[0], o[3], o[4], o[6]];
  const mktOf = (uid: number): number => valueOf.get(uid) ?? 0;
  for (const [k, os] of [...top].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [s, m] = k.split("-").map(Number) as [number, number];
    w.put(storeListingsPath(s, m), j({ v: 1, top: [...os].sort((a, b) => b[3] - a[3] || a[0] - b[0]).slice(0, 24).map(tup), cheapestHere: [...(cheap.get(k) ?? [])].sort((a, b) => mktOf(b[0]) - mktOf(a[0]) || a[0] - b[0]).slice(0, 24).map(tup) } satisfies StoreListingsFile));
  }
  w.sweep((f) => f.startsWith("ss/l/"));
  // everything that quotes the new aggregates
  const rest = writeCatalogueFiles({ ...ctx, phase: "full" });
  aggregateInfo.set(ctx, { offersPruned: pruned, dropped: kept.length });
  void stores;
  return { units: agg.size, offers: rows.length, files: w.written + w.unchanged + rest.written + rest.unchanged };
}
function rewriteSealedOffers(t: MutableTree, w: Writer, offers: Map<number, SealedOfferTuple[]>, asOf: number, runAt: (s: number, m: number) => number): void {
  const rowsById = new Map<number, SealedListFile["s"][number]>(); const lists: string[] = [];
  for (const f of t.files()) if (/^sl\/list-\d+\.json$/.test(f)) { lists.push(f); for (const r of readJson<SealedListFile>(t, f)?.s ?? []) rowsById.set(r[0], r); }
  const detail = new Map<number, SealedDetailFile["p"][number]>(); const files = t.files().filter((f) => /^sl\/d\/[0-9a-f]{2}\.json$/.test(f));
  for (const f of files) for (const p of readJson<SealedDetailFile>(t, f)?.p ?? []) detail.set(p[0], p);
  for (const [id, p] of detail) p[2] = offers.get(id) ?? [];
  const byShard: unknown[][][] = Array.from({ length: 64 }, () => []);
  for (const p of [...detail.values()].sort((a, b) => a[0] - b[0])) byShard[fnv1a32(p[1]) % 64]!.push(p);
  byShard.forEach((p, h) => w.put(`sl/d/${hex2(h)}.json`, `{"v":1,"h":${h},"p":[\n${lines(p)}\n]}`));
  // the cheapest in-stock offer and the store count per market, written back into the list rows
  for (const [id, r] of rowsById) {
    const os = (offers.get(id) ?? []).filter((o) => o[4] === 1 && asOf - runAt(o[1], o[0]) <= STALE_HOURS * 3_600_000);
    const low: (number | null)[] = MARKETS.map(() => null), st: number[] = MARKETS.map(() => 0);
    for (const o of os) { low[o[0]] = low[o[0]] == null ? o[2] : Math.min(low[o[0]]!, o[2]); st[o[0]]!++; }
    if (r[8] != null && r[9] != null) low[0] = low[0] == null ? r[9] : Math.min(low[0]!, r[9]);
    const any = os.length > 0; r[10] = any ? low : 0; r[11] = any ? st : 0;
  }
  const all = [...rowsById.values()].sort((a, b) => a[0] - b[0]); const chunks = Math.max(1, lists.length);
  for (let k = 0; k < chunks; k++) { const old = readJson<SealedListFile>(t, sealedListPath(k)); t.write(sealedListPath(k), `{"v":1,"at":"${old?.at ?? ""}","chunk":${k},"chunks":${chunks},"s":[\n${lines(all.slice(k * SEALED_LIST_CHUNK, (k + 1) * SEALED_LIST_CHUNK))}\n]}`); }
}

// ── S10: history ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const WINDOW_DAYS = 730, WEEKS = 18;
const keyOf = (uid: number): string => `${Math.floor(uid / 2)}.${uid % 2}`;
const uidOfKey = (k: string): number => { const [id, f] = k.split("."); return Number(id) * 2 + Number(f); };
/** A series cut to the 730 days that end on `endDay`; null when nothing of it falls inside. */
function windowTo(s: SeriesV4, endDay: number): SeriesV4 | null {
  const first = addDays(endDay, -(WINDOW_DAYS - 1));
  if (endDayOf(s) < first) return null;
  if (s[0] >= first) return s;
  const dense = decodeDense(s).filter((p) => p.day >= first);
  return dense.length ? encodeRuns(dense[0]!.day, dense.map((p) => p.cents)) : null;
}
function statsFrom(s: SeriesV4, day: number): UnitStat {
  const dense = decodeDense(s); const last = dense.length - 1;
  const at = (d: number): number | null => { const i = last - daysBetween(d, day); return i >= 0 && i <= last ? dense[i]!.cents : null; };
  const change = (n: number): number | null => { const now = at(day); if (now == null) return null; for (let k = n; k <= n + 4; k++) { const then = at(addDays(day, -k)); if (then != null && then > 0) return Math.round(((now - then) * 1000) / then) / 10; } return null; };
  let hi: number | null = null; for (let k = 0; k <= 90; k++) { const v = at(addDays(day, -k)); if (v != null && (hi == null || v > hi)) hi = v; }
  const prev = at(addDays(day, -1));
  return { c7: change(7), c30: change(30), hi90: hi, cents: at(day), prevCents: prev };
}
/** S10. Appends today's market value to every tracked unit (and every sealed product) with `appendDay`, the ONLY append rule: the same price day published twice replaces the last day, a missed day becomes a null run, a day older than the series is refused.
 *  Between cuts the days live in hist/t (the tail); on a cut day (every 28 days, a Sunday; the first run is a cut) every series is merged, trimmed to 730 days ending on the cut day and written to hist/p, and the tail is emptied. Sundays take the weekly closes (hist/w).
 *  F7: more than 30% of the tracked units moving more than 50% against their last recorded day, or fewer than 80% of them priced, skips the history (flagged); prices still publish. Also computes c7, c30 and hi90 per unit for the px rows and the free views. */
export async function recordHistory(ctx: ImportContext, today?: Date): Promise<HistoryResult> {
  void today;
  const t = ctx.work; const snap = ctx.snapshot; const day = dayNum(ctx.day); const w = new Writer(t);
  const cutDay = ctx.prev.empty || !ctx.prev.histCut || ctx.prev.histCut === ctx.day || isCutDay(ctx.day, ctx.prev.histCut);   // a re-run of the cut day is still the cut day
  const lastCut = ctx.prev.histCut && !cutDay ? dayNum(ctx.prev.histCut) : day;
  // today's values
  const values = new Map<number, number>(); const cardUnits = new Set<number>();
  snap.cards.forEach((c, i) => { const p = snap.prices[i]!; if (p.mask & PRICE_MASK.GONE) return; if ((p.mask & PRICE_MASK.TRACKN) && p.marketN && p.marketN > 0) { values.set(c.id * 2, p.marketN); cardUnits.add(c.id * 2); } if ((p.mask & PRICE_MASK.TRACKF) && p.marketF && p.marketF > 0) { values.set(c.id * 2 + 1, p.marketF); cardUnits.add(c.id * 2 + 1); } });
  for (const s of snap.sealed) if (!s.gone && s.marketUsd && s.marketUsd > 0) values.set(s.id * 2, s.marketUsd);
  // the series as published: base + tail
  const baseCache = new Map<string, Record<string, (number | null)[]>>(), tailCache = new Map<string, Record<string, (number | null)[]>>();
  const loadBase = (hb: number): Record<string, (number | null)[]> => { const rel = bucketPath("hist/p", hb); let m = baseCache.get(rel); if (!m) { const f = readJson<HistFile>(t, rel); m = f && f.v === 4 ? f.p : {}; baseCache.set(rel, m); } return m; };
  const loadTail = (tb: number): Record<string, (number | null)[]> => { const rel = bucketPath("hist/t", tb); let m = tailCache.get(rel); if (!m) { const f = readJson<HistTailFile>(t, rel); m = f ? f.p : {}; tailCache.set(rel, m); } return m; };
  const merged = (uid: number): SeriesV4 | undefined => { const k = keyOf(uid), id = Math.floor(uid / 2); return mergeTail(loadBase(histBucket(id))[k] as SeriesV4 | undefined, loadTail(tailBucket(id))[k] as SeriesV4 | undefined); };
  // F7 against the last recorded day
  const guardUnits = [...cardUnits]; let moved = 0, compared = 0;
  const hasHistory = t.files().some((f) => f.startsWith("hist/p/") || f.startsWith("hist/t/"));
  if (hasHistory) for (const uid of guardUnits) { const s = merged(uid); if (!s) continue; const d = decodeDense(s); const lastV = [...d].reverse().find((p) => p.cents != null)?.cents; if (lastV == null || lastV <= 0) continue; compared++; if (Math.abs(values.get(uid)! - lastV) / lastV > 0.5) moved++; }
  const tracked = ctx.tracked.size;
  if (tracked > 0 && cardUnits.size < tracked * 0.8) return { day: ctx.day, units: 0, files: 0, cut: false, skipped: `F7: only ${cardUnits.size} of ${tracked} tracked units are priced today (under 80%)` };
  if (compared >= 100 && moved > compared * 0.3) return { day: ctx.day, units: 0, files: 0, cut: false, skipped: `F7: ${moved} of ${compared} tracked units moved more than 50% against their last recorded day (over 30%)` };
  // append
  const stats = new Map<number, UnitStat>(); const next = new Map<number, SeriesV4>();
  for (const [uid, v] of values) {
    const s = merged(uid); const r = appendDay(s, day, v); next.set(uid, r.series);
    stats.set(uid, statsFrom(r.series, day));
  }
  // write
  if (cutDay) {
    const baseOut = new Map<number, Record<string, (number | null)[]>>();
    const put = (uid: number, s: SeriesV4): void => { const id = Math.floor(uid / 2); const w2 = windowTo(s, day); if (!w2) return; const b = histBucket(id); let m = baseOut.get(b); if (!m) baseOut.set(b, (m = {})); m[keyOf(uid)] = w2 as (number | null)[]; };
    for (const f of t.files()) {                                                     // every published series keeps its history, trimmed to the window
      if (f.startsWith("hist/p/")) for (const k of Object.keys(readJson<HistFile>(t, f)?.p ?? {})) { const uid = uidOfKey(k); if (!next.has(uid)) { const s = merged(uid); if (s) put(uid, s); } }
      else if (f.startsWith("hist/t/")) for (const k of Object.keys(readJson<HistTailFile>(t, f)?.p ?? {})) { const uid = uidOfKey(k); if (!next.has(uid)) { const s = merged(uid); if (s) put(uid, s); } }
    }
    for (const [uid, s] of next) put(uid, s);
    for (const [b, p] of [...baseOut].sort((a, c) => a[0] - c[0])) { const keys = Object.keys(p).sort((a, c) => uidOfKey(a) - uidOfKey(c)); const o: Record<string, (number | null)[]> = {}; for (const k of keys) o[k] = p[k]!; w.put(bucketPath("hist/p", b), `{"v":4,"p":${j(o)}}`); }
    w.sweep((f) => f.startsWith("hist/p/") || f.startsWith("hist/t/"));
  } else {
    const tails = new Map<number, Record<string, (number | null)[]>>();
    for (const uid of next.keys()) {
      const id = Math.floor(uid / 2), tb = tailBucket(id); const own = loadTail(tb)[keyOf(uid)] as SeriesV4 | undefined;
      const r = appendDay(own, day, values.get(uid)!); let m = tails.get(tb); if (!m) tails.set(tb, (m = { ...loadTail(tb) })); m[keyOf(uid)] = r.series as (number | null)[];
    }
    for (const [tb, p] of [...tails].sort((a, c) => a[0] - c[0])) { const o: Record<string, (number | null)[]> = {}; for (const k of Object.keys(p).sort((a, c) => uidOfKey(a) - uidOfKey(c))) o[k] = p[k]!; w.put(bucketPath("hist/t", tb), `{"v":4,"cut":${lastCut},"p":${j(o)}}`); }
  }
  // weekly closes
  const dow = new Date(Date.UTC(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100)).getUTCDay();
  const weekly = Array.from({ length: 8 }, (_, i) => readJson<WeeklyFile>(t, weeklyPath(i)));
  if (dow === 0 || weekly.every((x) => !x)) {
    const end = addDays(day, -dow); const shards: { k: number[]; c: number[][] }[] = Array.from({ length: 8 }, () => ({ k: [], c: [] }));
    for (const uid of [...cardUnits].sort((a, b) => a - b)) {
      const old = weekly[uid % 8]; const i = old ? old.k.indexOf(uid) : -1; let row: number[] = new Array(WEEKS).fill(0);
      if (old && i >= 0) { row = old.end === dayIso(end) ? old.c[i]!.slice() : [...old.c[i]!.slice(1), 0]; }
      row[WEEKS - 1] = dow === 0 ? values.get(uid)! : row[WEEKS - 1]!;
      shards[uid % 8]!.k.push(uid); shards[uid % 8]!.c.push(row);
    }
    shards.forEach((s, i) => w.put(weeklyPath(i), `{"v":1,"end":"${dayIso(end)}","weeks":${WEEKS},"k":${j(s.k)},"c":[\n${lines(s.c)}\n]}`));
  }
  // the market index: chained and value-weighted over the tracked units priced at US$1+ on both days
  const idxFile = readJson<IndexSeriesFile>(t, "hist/index.json") ?? { v: 1, days: [] };
  const newerIndexed = idxFile.days.some((d) => d[0] > ctx.day);                       // an older day than the last indexed one is refused here like appendDay refuses it for a series: the chain never goes back
  const days = idxFile.days.filter((d) => d[0] !== ctx.day); const prevRow = days.length ? { day: days[days.length - 1]![0], value: days[days.length - 1]![1], totalUsd: days[days.length - 1]![2], cardCount: days[days.length - 1]![3] } : null;
  const pairs: [number, number][] = []; let totalCents = 0, basket = 0;
  for (const uid of cardUnits) { const st = stats.get(uid)!; const v = values.get(uid)!; if (v >= 100) { totalCents += v; basket++; if (st.prevCents != null && st.prevCents >= 100) pairs.push([v, st.prevCents]); } }
  if (!newerIndexed) { const row = nextIndex(prevRow, pairs, totalCents, basket, ctx.day);
    w.put("hist/index.json", j({ v: 1, days: [...days, [row.day, row.value, row.totalUsd, row.cardCount] as IndexSeriesFile["days"][number]].slice(-WINDOW_DAYS) } satisfies IndexSeriesFile)); }
  else w.put("hist/index.json", j(idxFile));
  statsOf.set(snap, stats);
  if (wroteCatalogue.has(snap)) writeCatalogueFiles(ctx);                              // the other order of the stages: refresh the px columns and the views that quote them
  return { day: ctx.day, units: values.size, files: w.written + w.unchanged, cut: cutDay };
}

// ── S13: tell the site ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** After the pointer commit: POST /api/data-warm { ref } (loads the hot set into the regional Data Cache and makes the instance look at the pointer), then poll GET /api/data-status until the site serves `ref`, for at most 12 minutes. Never throws:
 *  a site that does not answer only delays the 20-second pointer memo. Nothing is purged: a pinned URL needs no purge. */
export async function revalidateSite(log: ImportContext["log"], o: { pointer: PointerFile; fetch?: typeof fetch; pollMs?: number; maxMs?: number }): Promise<void> {
  const base = process.env.REVALIDATE_URL; const secret = process.env.CRON_SECRET;
  if (!base || !secret) { log("Hook: skipped (REVALIDATE_URL or CRON_SECRET is not set); the site notices the pointer within 20 seconds"); return; }
  let origin: string; try { origin = new URL(base).origin; } catch { log(`Hook: REVALIDATE_URL is not a URL`); return; }
  const f = o.fetch ?? fetch;
  try {
    const res = await f(`${origin}/api/data-warm`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify({ ref: o.pointer.ref }) });
    log(`Hook: warm HTTP ${res.status}`);
  } catch (e) { log(`Hook: warm failed: ${(e as Error).message}`); }
  const deadline = Date.now() + (o.maxMs ?? 12 * 60_000);
  while (Date.now() < deadline) {
    try {
      const r = await f(`${origin}/api/data-status`, { headers: { "User-Agent": UA }, cache: "no-store" } as RequestInit);
      const body = (await r.json()) as { ref?: string };
      if (body.ref === o.pointer.ref) { log(`Hook: the site serves ${o.pointer.ref.slice(0, 7)}`); return; }
    } catch { /* keep polling */ }
    await sleep(o.pollMs ?? 15_000);
  }
  log(`Hook: the site did not report ${o.pointer.ref.slice(0, 7)} within the window (POINTER_BEHIND will say so)`);
}

/** Per-market lows in MARKETS order (kept from OP: tests/history.test.ts pins it). */
export function marketLows(p: { lowUS: number | null; lowAU: number | null; lowUK: number | null; lowSG: number | null; lowCA: number | null; lowEU: number | null }): (number | null)[] {
  return [p.lowUS, p.lowAU, p.lowUK, p.lowSG, p.lowCA, p.lowEU];
}
export function utcDay(d: Date = new Date()): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
export type { Country, Finish };
