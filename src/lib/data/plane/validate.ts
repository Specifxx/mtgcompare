// src/lib/data/plane/validate.ts (owner WP01b, FROZEN). The publisher's pre-push validation: PURE over a TreeView, PHASE-AWARE, FAIL CLOSED. Any problem (or an exception) refuses the publish BEFORE the data commit; the pointer stays on the last good one.
//
// What changed against the lab's validator (critique DP-02, DP-19; both verified by experiment):
//   * Phase `catalog` (the first publish of the day) leaves the store families carrying yesterday's rows. The lab required `un rows == tracked units` and refused it as soon as ONE unit crossed the tracking band (7 problems for one
//     cleared TRACKN bit on the real tree). Phase 1 now reconciles membership first (reconcile.ts) and the validator asks: catalog = every `un`/`of`/`ix s`/`ix f` unit is a subset of today's tracked units (an absent row means "no store data yet");
//     full = additionally every tracked unit has exactly one `un` row.
//   * Store ids in offers must be 8, 9 or >= 10: ids 1 to 7 are the eBay display ids of constants.ts and can never be published (a numeric hole in the string scan).
import { PRICE_MASK } from "../../constants";
import { PLANE_FILE_MAX_BYTES, FAMILIES, type BucketsFile, type CatRow, type IxDict, type IxF, type IxK, type IxP, type IxS, type OfferTuple, type SlugShard, type UnRow } from "./formats";
import { CARD_BUCKET, IX_CHUNK, IX_FLAT_CHUNK, cardBucket, slugShard } from "./shards";
import type { TreeView } from "./tree";

export type Phase = "catalog" | "full";
export interface PrevCounts { cards: number; listed: number; tracked: number; oracles: number }
export interface ValidateOpts { phase: Phase; prev?: PrevCounts | null; maxFileBytes?: number; minCountRatio?: number; histCut?: number | null }
export interface Problem { code: string; message: string }
export interface Counts { cards: number; listed: number; thin: number; tracked: number; oracles: number; offers: number; files: number; bytes: number }
export interface ValidateResult { problems: Problem[]; counts: Counts }
export const DEFAULT_MIN_COUNT_RATIO = 0.9;

/** Content that must never appear in a published file: eBay data (licence), user and billing data, demand counters, secrets. Applied to the RAW text of every file. `reason` is allowed only in pv/rising.json. */
/** An e-mail address anywhere in a file. Scans each "@" instead of running one regex over 150 MB (the naive `[\\w.+-]+@...` regex backtracks: 2 seconds for 2 MB, measured). */
export function hasEmail(text: string): boolean {
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    const before = text.charCodeAt(i - 1); const localOk = (before >= 48 && before <= 57) || (before >= 65 && before <= 90) || (before >= 97 && before <= 122) || before === 46 || before === 95 || before === 37 || before === 43 || before === 45;
    if (localOk && /^[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}/.test(text.slice(i + 1, i + 100))) return true;
  }
  return false;
}
export const FORBIDDEN_TEXT: { code: string; test: (text: string) => boolean; what: string }[] = [
  { code: "FORBIDDEN_EBAY", what: "eBay data (licence)", test: (t) => /ebay(?:img)?\.com|ebaystatic\.com|"itemId"|\bitemId\b/i.test(t) },
  { code: "FORBIDDEN_KEY", what: "user, billing or demand counter key", test: (t) => /"(?:viewCount|searchCount|velocity|userId|email|stripeCustomerId|premiumUntil|unsubToken)"\s*:/.test(t) },
  { code: "FORBIDDEN_EMAIL", what: "an e-mail address", test: hasEmail },
  { code: "FORBIDDEN_SECRET", what: "a secret", test: (t) => /\b(?:ghp_|github_pat_|sk_live_|sk_test_|whsec_)[A-Za-z0-9_]{10,}/.test(t) },
];
const FORBIDDEN_RANKING_KEY = /"(?:rank|ranking|score|deals|rising|demand)"\s*:/;           // a ranked list under these keys is a premium dataset in clear (12.3)
/** DP-19: a published store id is a registry id (>= 10) or a feed id (8, 9). 0 is TCGplayer's virtual store (never an offer); 1 to 7 are the eBay display ids. */
export const isPublishableStoreId = (id: number): boolean => id === 8 || id === 9 || (Number.isInteger(id) && id >= 10 && id <= 32767);

function inner(t: TreeView, o: ValidateOpts): ValidateResult {
  const problems: Problem[] = []; const perCode = new Map<string, number>(); const add = (code: string, message: string) => { const n = (perCode.get(code) ?? 0) + 1; perCode.set(code, n); if (n <= 25 && problems.length < 400) problems.push({ code, message }); };   // 25 examples per code: one bad family never hides the others
  const maxBytes = o.maxFileBytes ?? PLANE_FILE_MAX_BYTES, ratio = o.minCountRatio ?? DEFAULT_MIN_COUNT_RATIO;
  const files = t.files(); const cache = new Map<string, unknown>();
  const rd = <T,>(rel: string): T => { if (!cache.has(rel)) cache.set(rel, JSON.parse(t.read(rel))); return cache.get(rel) as T; };
  const drop = (rel: string) => cache.delete(rel);
  const fam = new Set<string>(FAMILIES);
  let bytes = 0;
  // 1. every file: size, family allowlist, JSON, forbidden content
  for (const f of files) {
    const sz = t.size(f); bytes += sz;
    if (sz > maxBytes) add("FILE_TOO_BIG", `${f}: ${sz} bytes over the ${maxBytes} cap`);
    const top = f.split("/")[0]!;
    if (!f.endsWith(".json")) add("BAD_EXT", `${f}: only .json files are published (an encrypted *.enc shard would be a premium dataset that the public host serves anyway: contract 12.3)`);
    if (!fam.has(top)) add("UNKNOWN_FAMILY", `${f}: family "${top}" is not published (the allowlist of formats.ts FAMILIES)`);
    let text = ""; try { text = t.read(f); JSON.parse(text); } catch (e) { add("NOT_JSON", `${f}: not JSON (${(e as Error).message.slice(0, 60)})`); continue; }
    for (const { code, test, what } of FORBIDDEN_TEXT) if (test(text)) add(code, `${f}: contains ${what}`);
    if (f !== "pv/rising.json" && /"reason"\s*:/.test(text)) add("FORBIDDEN_KEY", `${f}: key "reason" outside pv/rising.json`);
    if (FORBIDDEN_RANKING_KEY.test(text) && !f.startsWith("pv/")) add("FORBIDDEN_RANKING", `${f}: a ranked list under a premium key`);
  }
  if (problems.some((p) => p.code === "NOT_JSON")) return { problems, counts: { cards: 0, listed: 0, thin: 0, tracked: 0, oracles: 0, offers: 0, files: files.length, bytes } };   // nothing below can be trusted on a file that does not parse
  // 2. identity
  const catFiles = files.filter((f) => f.startsWith("cat/")); const idsByBucket = new Map<number, number[]>(); const slugOf = new Map<number, string>(); const slugs = new Set<string>(); const oracleOfCard = new Set<number>(); let cards = 0;
  for (const f of catFiles) {
    const J = rd<{ b: number; c: CatRow[] }>(f);
    for (const r of J.c) {
      cards++; (idsByBucket.get(J.b) ?? idsByBucket.set(J.b, []).get(J.b)!).push(r[0]);
      if (Math.floor(r[0] / CARD_BUCKET) !== J.b) add("CAT_BUCKET", `${f}: id ${r[0]} in the wrong bucket`);
      if (r.length < 21) add("CAT_SHAPE", `${f}: row ${r[0]} has ${r.length} elements, expected 21`);
      if (slugs.has(r[1])) add("DUP_SLUG", `duplicate slug ${r[1]}`); slugs.add(r[1]); slugOf.set(r[0], r[1]); if (r[14]) oracleOfCard.add(r[14]);
    }
    drop(f);
  }
  let slugRows = 0;
  for (const f of files.filter((x) => x.startsWith("slug/"))) {
    const J = rd<SlugShard>(f);
    for (const [s, id] of J.s) { slugRows++; if (slugOf.get(id) !== s) add("SLUG_SHARD", `${f}: ${s} -> ${id} disagrees with cat`); if (slugShard(s) !== f.slice(5, 7)) add("SLUG_SHARD", `${f}: slug ${s} is in the wrong shard`); }
    drop(f);
  }
  if (slugRows !== cards) add("SLUG_COUNT", `slug shards hold ${slugRows} card slugs, cat holds ${cards}`);
  // 3. prices, tracking
  const trackedUids = new Set<number>(); let listed = 0, thin = 0;
  for (const f of files.filter((x) => x.startsWith("px/"))) {
    const J = rd<{ b: number; p: number[][] }>(f); const want = idsByBucket.get(J.b) ?? [];
    if (J.p.map((r) => r[0]).join() !== want.join()) add("PX_IDS", `${f}: ids differ from cat bucket ${J.b}`);
    for (const r of J.p) {
      const mask = r[5]!;
      if (mask & PRICE_MASK.LISTED) listed++; if (mask & PRICE_MASK.THIN) { thin++; if (!(mask & PRICE_MASK.LISTED)) add("PX_THIN", `${f}: ${r[0]} is THIN but not LISTED`); }
      if (mask & PRICE_MASK.TRACKN) { trackedUids.add(r[0]! * 2); if (!(mask & PRICE_MASK.HASN)) add("PX_TRACK", `${f}: ${r[0]} tracked Normal without a Normal price`); }
      if (mask & PRICE_MASK.TRACKF) { trackedUids.add(r[0]! * 2 + 1); if (!(mask & PRICE_MASK.HASF)) add("PX_TRACK", `${f}: ${r[0]} tracked Foil without a Foil price`); }
    }
    drop(f);
  }
  if (catFiles.length && !files.some((x) => x.startsWith("px/"))) add("PX_MISSING", "cat exists but px does not");
  // 4. store families: PHASE-AWARE membership
  const unSeen = new Set<number>(); let offers = 0;
  for (const f of files.filter((x) => x.startsWith("un/"))) {
    const J = rd<{ b: number; u: UnRow[] }>(f);
    for (const r of J.u) {
      if (!trackedUids.has(r[0])) add("UN_UNTRACKED", `${f}: unit ${r[0]} is not tracked in px (phase ${o.phase}: membership must be reconciled before the store stage)`);
      if (unSeen.has(r[0])) add("UN_DUP", `${f}: unit ${r[0]} has two un rows`); unSeen.add(r[0]);
      if (r[1].length !== 6 || r[2].length !== 6 || r[3].length !== 6) add("UN_SHAPE", `${f}: unit ${r[0]} is not 6 markets wide`);
    }
    drop(f);
  }
  if (o.phase === "full") for (const u of trackedUids) if (!unSeen.has(u)) { add("UN_MISSING", `phase full: tracked unit ${u} has no un row`); break; }
  const storeIdBad = (id: number): boolean => !isPublishableStoreId(id);
  for (const f of files.filter((x) => x.startsWith("of/"))) {
    for (const r of rd<{ o: OfferTuple[] }>(f).o) {
      offers++;
      if (!trackedUids.has(r[0])) add("OF_UNTRACKED", `${f}: offer for untracked unit ${r[0]}`);
      if (storeIdBad(r[2])) add("STORE_ID", `${f}: store id ${r[2]} is not publishable (8, 9 or >= 10)`);
      if (!(r[1] >= 0 && r[1] <= 5) || !(r[3] > 0) || (r[5] !== 0 && r[5] !== 1)) add("OF_SHAPE", `${f}: malformed offer for unit ${r[0]}`);
    }
    drop(f);
  }
  for (const f of files.filter((x) => /^sl\/d\/[0-9a-f]{2}\.json$/.test(x))) { for (const p of rd<{ p: [number, string, [number, number][]][] }>(f).p) for (const of of p[2]) if (storeIdBad(of[1])) add("STORE_ID", `${f}: sealed offer store id ${of[1]}`); drop(f); }
  for (const f of files.filter((x) => x === "ss/runs.json")) for (const r of rd<{ r: number[][] }>(f).r) if (storeIdBad(r[0]!)) add("STORE_ID", `${f}: store id ${r[0]}`);
  // 5. oracle references
  const oracleNos = new Set<number>();
  for (const f of files.filter((x) => x.startsWith("or/"))) { for (const r of rd<{ o: number[][] }>(f).o) oracleNos.add(r[0]!); drop(f); }
  let badOr = 0; for (const n of oracleOfCard) if (!oracleNos.has(n)) badOr++;
  if (badOr) add("ORACLE_REF", `${badOr} oracle ordinals referenced by cat are not in or/*`);
  // 6. bucket presence list: what the reader trusts to skip requests
  if (files.includes("meta/buckets.json")) {
    const b = rd<BucketsFile>("meta/buckets.json"); const catB = [...idsByBucket.keys()].sort((x, y) => x - y), trB = [...new Set([...trackedUids].map((u) => cardBucket(Math.floor(u / 2))))].sort((x, y) => x - y);
    if (b.cat.join() !== catB.join()) add("BUCKETS", "meta/buckets.json cat list differs from the cat/ files");
    // the buckets that hold a tracked unit in px (formats.ts BucketsFile), in every phase. An EMPTY list is "not computed" to the readers (they rule nothing out): a tree that has not listed them is legal, one that lists them wrongly is not
    if (b.tracked.length && b.tracked.join() !== trB.join()) add("BUCKETS", "meta/buckets.json tracked list differs from the buckets of the units px tracks");
  } else add("BUCKETS", "meta/buckets.json is missing");
  // 7. chunked families
  const boards = new Map<number, { chunks: number; n: number; got: number; seen: Set<number> }>();
  for (const f of files.filter((x) => x.startsWith("st/"))) { const J = rd<{ set: number; chunks: number; n: number; chunk: number; c: unknown[] }>(f); const e = boards.get(J.set) ?? { chunks: J.chunks, n: J.n, got: 0, seen: new Set<number>() }; e.got += J.c.length; e.seen.add(J.chunk); boards.set(J.set, e); drop(f); }
  for (const [set, e] of boards) { if (e.seen.size !== e.chunks) add("BOARD", `st/${set}: ${e.seen.size} of ${e.chunks} chunks present`); if (e.got !== e.n) add("BOARD", `st/${set}: ${e.got} rows in the chunks, ${e.n} declared`); }
  const slFiles = files.filter((x) => /^sl\/list-\d+\.json$/.test(x)); const sl = slFiles.map((f) => rd<{ chunks: number }>(f)); if (files.some((x) => x.startsWith("sl/")) && (!sl.length || sl.some((x) => x.chunks !== sl.length))) add("SEALED", "sl/list chunks are incomplete");
  { const seenSealed = new Set<number>();
    for (const f of slFiles) { for (const r of rd<{ s: unknown[][] }>(f).s) {
      if (r.length !== 13) { add("SEALED_ROW", `${f}: a sealed row has ${r.length} columns, not 13`); break; }
      if (seenSealed.has(r[0] as number)) add("SEALED_ROW", `${f}: sealed id ${r[0]} appears twice`); seenSealed.add(r[0] as number);
      for (const k of [10, 11]) if (r[k] !== 0 && !(Array.isArray(r[k]) && (r[k] as unknown[]).length === 6)) add("SEALED_ROW", `${f}: sealed ${r[0]} column ${k} is not 0 or 6 markets wide`);
    } drop(f); } }
  // 8. history: one cut day, base files of a known format
  const cuts = new Set(files.filter((x) => x.startsWith("hist/t/")).map((f) => rd<{ cut: number }>(f).cut)); if (cuts.size > 1) add("HIST_CUT", `hist/t files name ${cuts.size} different cut days`);
  if (o.histCut != null && cuts.size === 1 && !cuts.has(o.histCut)) add("HIST_CUT", `hist/t names cut ${[...cuts][0]} but the pointer says ${o.histCut}`);
  for (const f of files.filter((x) => x.startsWith("hist/p/")).slice(0, 50)) { const v = rd<{ v: number }>(f).v; if (v !== 3 && v !== 4) add("HIST_FORMAT", `${f}: history format ${v}`); drop(f); }
  // 9. the browse index: rows = LISTED rows, store/flat columns reference tracked units
  if (files.includes("ix/dict.json")) {
    const dict = rd<IxDict>("ix/dict.json"); if (dict.rows !== listed) add("IX_ROWS", `ix rows ${dict.rows} != LISTED px rows ${listed}`); if (dict.chunk !== IX_CHUNK) add("IX_ROWS", `ix chunk ${dict.chunk} != ${IX_CHUNK}`);
    const nCh = Math.ceil(dict.rows / IX_CHUNK);
    for (let c = 0; c < nCh; c++) {
      for (const k of ["k", "p"]) if (!files.includes(`ix/${k}-${c}.json`)) add("IX_CHUNK", `ix/${k}-${c}.json is missing`);
      if (!files.includes(`ix/k-${c}.json`)) continue;
      const K = rd<IxK>(`ix/k-${c}.json`); const P = files.includes(`ix/p-${c}.json`) ? rd<IxP>(`ix/p-${c}.json`) : null;
      if (P && P.n !== K.n) add("IX_CHUNK", `ix chunk ${c}: k has ${K.n} rows, p has ${P.n}`);
      if (files.includes(`ix/s-${c}.json`)) for (const u of rd<IxS>(`ix/s-${c}.json`).u) { const id = K.id[u[0]!]; if (id === undefined || !trackedUids.has(id * 2 + u[1]!)) add("IX_S_UNTRACKED", `ix/s-${c}: row ${u[0]} finish ${u[1]} is not a tracked unit`); }
      if (files.includes(`ix/f-${c}.json`)) { const F = rd<IxF>(`ix/f-${c}.json`); if (F.n > IX_FLAT_CHUNK) add("IX_F", `ix/f-${c}: ${F.n} rows over ${IX_FLAT_CHUNK}`); F.uid.forEach((u, i) => { if (!trackedUids.has(u)) add("IX_F_UNTRACKED", `ix/f-${c}: unit ${u} is not tracked`); if (storeIdBad(F.st[i]!)) add("STORE_ID", `ix/f-${c}: store id ${F.st[i]}`); }); }
      drop(`ix/k-${c}.json`); drop(`ix/p-${c}.json`); drop(`ix/s-${c}.json`); drop(`ix/f-${c}.json`);
    }
  } else add("IX_ROWS", "ix/dict.json is missing");
  // 10. preview slices are small and say nothing else (12.3.4)
  if (files.includes("pv/demand.json")) { const d = rd<{ r: unknown[] }>("pv/demand.json"); if (d.r.length > 10) add("PV_SIZE", `pv/demand.json has ${d.r.length} rows (the free strip is 10)`); }
  if (files.includes("pv/rising.json")) for (const [scope, picks] of Object.entries(rd<{ scopes: Record<string, unknown[]> }>("pv/rising.json").scopes)) if (picks.length > 3) add("PV_SIZE", `pv/rising.json scope ${scope} has ${picks.length} picks (the free preview is 3)`);
  // 11. counts against the previous publish (F2, F10 equivalents): a collapse refuses the publish
  const counts: Counts = { cards, listed, thin, tracked: trackedUids.size, oracles: oracleNos.size, offers, files: files.length, bytes };
  if (o.prev) for (const k of ["cards", "listed", "tracked", "oracles"] as const) if (counts[k] < o.prev[k] * ratio) add("COUNT_COLLAPSE", `${k} fell from ${o.prev[k]} to ${counts[k]} (below ${ratio * 100}%)`);
  return { problems, counts };
}
/** Fail closed: a validator that throws (a file it cannot parse, a missing family) is a refusal, never a pass. */
export function validateTree(t: TreeView, o: ValidateOpts): ValidateResult {
  try { return inner(t, o); }
  catch (e) { return { problems: [{ code: "ABORTED", message: `validation aborted: ${(e as Error).message.slice(0, 160)}` }], counts: { cards: 0, listed: 0, thin: 0, tracked: 0, oracles: 0, offers: 0, files: 0, bytes: 0 } }; }
}
/** An overlay publish (the demand-snapshot job) may change pv/ and the bookkeeping files and NOTHING else. */
export function validateOverlay(before: TreeView, after: TreeView): Problem[] {
  const changed = (() => { const out: string[] = []; const fa = new Set(before.files()), fb = new Set(after.files()); for (const f of fa) if (!fb.has(f) || before.read(f) !== after.read(f)) out.push(f); for (const f of fb) if (!fa.has(f)) out.push(f); return out; })();
  return changed.filter((f) => !(f.startsWith("pv/") || f === "status.json" || f === "manifest.json")).map((f) => ({ code: "OVERLAY_SCOPE", message: `overlay changed ${f}` }));
}
