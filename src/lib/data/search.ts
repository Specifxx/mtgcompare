// owner: WP07
// src/lib/data/search.ts: the section "search.ts" of api.ts (contract 7.12). The name table (nm/<k>, hottest first), the typeahead and the search PLANNER: a typed query is parsed (src/lib/search.ts, pure), resolved to oracle numbers / a set / a collector number / treatments /
// a finish, and answered by the browse engine (plane/browse-index.ts), which does not interpret `q`. Every function reads PUBLISHED FILES through the PlaneSource of the request and holds only instance memory (kinds P and M of contract 7.5): no database, no unstable_cache.
// The names, arguments, result types and cache kinds are FROZEN (contract 7.12): this module only adds exports.
//
// Cost: nm/0 is the 8,000 hottest oracles (480 KB); a query that the hot table answers with an exact or prefix match reads nothing else. Otherwise the tail chunks nm/1.. are parsed once per data commit (about 4 files, 2 MB) and every later query is memory.
import { fold } from "../constants";
import { didYouMean, nameTier, nicknameTargets, parseSearch, type ParsedSearch } from "../search";
import { getBrowseIndex, getScrySets, getSetByCode, getSets, resolveBySetNumber } from "./catalog";
import { canonicalQuery } from "./core";
import { pageOf } from "./lite";
import type { NameFile, NameRow } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { nameChunkPath } from "./plane/shards";
import type { CardLite, CardPage, CardQuery, NameHit, NameIndexEntry } from "./types";

const NAME_CHUNK_MAX = 64;                                  // nm/ holds the whole oracle list in a handful of files; a runaway chain never loops forever
const TAIL_CACHE_MAX = 200;                                 // folded queries kept per data commit
const CANDIDATES = 24;                                      // CardQuery.oracleNos is at most 24 (core.ts)

/** One name file with the keys a query is compared with, folded once. `faces` are the halves of a split or double-faced card ("Fire // Ice" is also found by "ice"); `alt` is the printed (reskin) name. */
interface PreparedNames { rows: readonly NameRow[]; keys: string[]; alts: string[]; faces: string[][] }
function prepare(f: NameFile): PreparedNames {
  const keys: string[] = [], alts: string[] = [], faces: string[][] = [];
  for (const r of f.r) {
    keys.push(fold(r[1])); alts.push(r[6] ? fold(r[6]) : "");
    const halves = r[1].includes(" // ") ? r[1].split(" // ").map((h) => fold(h)).filter(Boolean) : [];
    faces.push(halves);
  }
  return { rows: f.r, keys, alts, faces };
}
const chunkAt = (n: number): Promise<PreparedNames | null> =>
  planeSource().then(({ src, ptr }) => memoByRef(`nm:${n}`, memoKey(ptr), async () => { const f = await optionalOf<NameFile>(src, nameChunkPath(n)); return f ? prepare(f) : null; }));

/** A candidate of a name search: where it matched (name, a face, or the printed name) and how well; `at` is the row's position in the hottest-first table. */
interface Ranked { row: NameRow; tier: number; via: "name" | "face" | "alt"; at: number; chunk: number }
function rankIn(p: PreparedNames, chunk: number, qk: string): Ranked[] {
  const out: Ranked[] = [];
  for (let i = 0; i < p.rows.length; i++) {
    let tier = nameTier(p.keys[i]!, qk), via: Ranked["via"] = "name";
    for (const h of p.faces[i]!) { const t = nameTier(h, qk); if (t != null && (tier == null || t + 0.5 < tier)) { tier = t + 0.5; via = "face"; } }       // a face counts a little less than the whole name
    if (p.alts[i]) { const t = nameTier(p.alts[i]!, qk); if (t != null && (tier == null || t + 0.25 < tier)) { tier = t + 0.25; via = "alt"; } }
    if (tier != null) out.push({ row: p.rows[i]!, tier, via, at: chunk * 1_000_000 + i, chunk });
  }
  return out;
}
const byRelevance = (a: Ranked, b: Ranked): number => a.tier - b.tier || a.at - b.at;
const hitOf = (r: Ranked): NameHit => ({ oracleNo: r.row[0], name: r.row[1], ...(r.via === "alt" && r.row[6] ? { alt: r.row[6] } : {}), oracleSlug: r.row[2], topSlug: r.row[3] ? String(r.row[3]) : "", nPrint: r.row[4], topCents: r.row[5] });

/** P nm/0 (the top 8,000 oracles, hottest first): 480 KB */
export async function getNameIndex(): Promise<NameIndexEntry[]> {
  const p = await chunkAt(0);
  return p ? (p.rows as NameIndexEntry[]) : [];
}

/** Every name file after the hot one, parsed once per data commit, scanned for a query. Uncached helper under getNameTail. */
export async function readNameTail(qn: string, limit = CANDIDATES): Promise<NameHit[]> {
  const qk = fold(qn); if (!qk) return [];
  const found: Ranked[] = [];
  for (let n = 1; n < NAME_CHUNK_MAX; n++) { const p = await chunkAt(n); if (!p) break; found.push(...rankIn(p, n, qk)); }
  return found.sort(byRelevance).slice(0, limit).map(hitOf);
}
const tailMemo = new Map<string, Promise<NameHit[]>>();
let tailRef = "";
/** P nm/<k> beyond the hot chunk; the tail loader (<= 24 hits), remembered per data commit and folded query (M, at most 200 queries). */
export async function getNameTail(qn: string): Promise<NameHit[]> {
  const { ptr } = await planeSource(), ref = memoKey(ptr), key = fold(qn);
  if (tailRef !== ref) { tailMemo.clear(); tailRef = ref; }
  let hit = tailMemo.get(key);
  if (!hit) {
    if (tailMemo.size >= TAIL_CACHE_MAX) tailMemo.delete(tailMemo.keys().next().value as string);
    hit = readNameTail(key); tailMemo.set(key, hit); hit.catch(() => { if (tailMemo.get(key) === hit) tailMemo.delete(key); });
  }
  return hit;
}

/** Ranked oracles for a folded query, hot table first and the tail only when the hot answer is thin (fewer than `limit` hits, or no exact or prefix match). A nickname adds its card; it never removes a result. */
async function rankedNames(qk: string, limit: number): Promise<NameHit[]> {
  if (!qk) return [];
  const hot = await chunkAt(0), found = hot ? rankIn(hot, 0, qk).sort(byRelevance) : [];
  let hits = found.map(hitOf);
  if (found.length < limit || (found[0]?.tier ?? 9) > 1) {
    const tail = await getNameTail(qk), seen = new Set(hits.map((h) => h.oracleNo));
    hits = [...hits, ...tail.filter((h) => !seen.has(h.oracleNo))];
    hits = hits.map((h, i) => ({ h, i })).sort((a, b) => tierOfHit(a.h, qk) - tierOfHit(b.h, qk) || a.i - b.i).map((x) => x.h);
  }
  const have = new Set(hits.map((h) => h.oracleNo));
  for (const target of nicknameTargets(qk)) {
    const t = (hot ? hot.keys.indexOf(target) : -1);
    if (t >= 0) { const row = hot!.rows[t]!; if (!have.has(row[0])) hits.unshift(hitOf({ row, tier: 0, via: "name", at: t, chunk: 0 })); }
    else { const tail = (await getNameTail(target)).find((h) => fold(h.name) === target); if (tail && !have.has(tail.oracleNo)) hits.unshift(tail); }
  }
  return hits.slice(0, limit);
}
const tierOfHit = (h: NameHit, qk: string): number => Math.min(nameTier(fold(h.name), qk) ?? 9, h.alt ? (nameTier(fold(h.alt), qk) ?? 9) + 0.25 : 9, ...fold(h.name).split(" // ").map((x) => (nameTier(x, qk) ?? 9) + 0.5));

/** Typeahead: hot index scan in memory, then getNameTail. One hit per ORACLE (never 159 Sol Rings), best match first, hottest first among equals. A query of fewer than two letters has no hits. */
export async function searchNames(q: string, limit = 8): Promise<NameHit[]> {
  const qk = fold(q).slice(0, 60);
  if (qk.replace(/ /g, "").length < 2) return [];
  return rankedNames(qk, Math.max(1, Math.min(CANDIDATES, Math.floor(limit) || 8)));
}

// ── the planner ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Lower-case Scryfall codes plus Set.tok values: what parseSearch may take for a set. */
function setCodes(): Promise<ReadonlySet<string>> {
  return planeSource().then(({ ptr }) => memoByRef("search:codes", memoKey(ptr), async () => {
    const [scry, sets] = await Promise.all([getScrySets(), getSets()]), out = new Set<string>(Object.keys(scry).map((c) => c.toLowerCase()));
    for (const s of sets) { if (s.tok) out.add(s.tok.toLowerCase()); }
    return out;
  }));
}
/** The parse of a typed query against the published set codes (pure parseSearch + the codes of this data commit). */
export async function parseQuery(q: string): Promise<ParsedSearch> { return parseSearch(q, { setCodes: await setCodes() }); }

const emptyPage = (page: number, per: number): CardPage => pageOf([], 0, page, per);

/** How a set code reaches the engine: the Scryfall code when printings carry it, else the TCGplayer group through its token or code. */
async function setFilter(ix: Awaited<ReturnType<typeof getBrowseIndex>>, code: string): Promise<Pick<CardQuery, "sc" | "setIds"> | null> {
  const c = code.toLowerCase();
  if (ix.dict.sc.includes(c)) return { sc: c };
  const set = await getSetByCode(c);
  return set ? { setIds: [set.id] } : null;
}

/** The oracles whose printings in one set match the name words, best match first: a direct pass over the rows of the set (a few hundred), so "bolt m11" finds Lightning Bolt however many cards have "bolt" in the name. */
function oraclesInSet(ix: Awaited<ReturnType<typeof getBrowseIndex>>, f: Pick<CardQuery, "sc" | "setIds">, qk: string): number[] {
  const scIdx = f.sc ? ix.dict.sc.indexOf(f.sc) : -1, sets = f.setIds ? new Set(f.setIds) : null, best = new Map<number, number>();
  for (let i = 0; i < ix.n; i++) {
    if (!ix.or[i]) continue;
    if (f.sc ? ix.sc[i] !== scIdx : !sets!.has(ix.setId[i]!)) continue;
    const key = fold(ix.name[i]), alt = ix.alt.get(ix.id[i]!);
    const t = Math.min(nameTier(key, qk) ?? 9, ...key.split(" ").length > 1 ? [] : [], alt ? (nameTier(fold(alt), qk) ?? 9) + 0.25 : 9, ...(ix.name[i]!.includes(" // ") ? ix.name[i]!.split(" // ").map((h) => (nameTier(fold(h), qk) ?? 9) + 0.5) : []));
    if (t < 9) { const had = best.get(ix.or[i]!); if (had === undefined || t < had) best.set(ix.or[i]!, t); }
  }
  return [...best].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([no]) => no);
}

interface Plan { query: Partial<CardQuery>; direct?: CardLite[]; parsed: ParsedSearch }
/**
 * Resolves a typed query to a CardQuery the engine can answer (or to the 1 to 3 products of a set + number). `o` carries the filters of the page (sort, page, rarities, price range ...); the typed words add to them. Exposed for the tests.
 * Words the grammar took for a finish or a treatment are a REQUEST, not part of a name: when they leave nothing, the whole text is tried as a name ("scroll rack", "inverted iceberg", "judge of currents").
 */
export async function planSearch(q: string, o: Partial<CardQuery> = {}): Promise<Plan> {
  const parsed = await parseQuery(q), base: Partial<CardQuery> = { ...o, q: undefined };
  const ix = await getBrowseIndex();
  if (parsed.set && parsed.number) {
    const key = `${parsed.set.toLowerCase()}|${fold(parsed.number).replace(/ /g, "")}`;
    const pairs = [{ set: parsed.set, number: parsed.number }], got = await resolveBySetNumber(pairs);
    const rows = [...got.values()].flat();
    if (rows.length || !parsed.text) return { query: base, direct: rows, parsed };
    void key;
  }
  const query: Partial<CardQuery> = { ...base };
  if (parsed.set) { const f = await setFilter(ix, parsed.set); if (!f) return { query: base, direct: [], parsed }; Object.assign(query, f); }
  if (parsed.finish) query.finish = parsed.finish;
  if (parsed.treat.length) query.treats = parsed.treat;
  if (parsed.text) {
    const nos = query.sc || query.setIds ? oraclesInSet(ix, { sc: query.sc, setIds: query.setIds }, parsed.text) : (await rankedNames(parsed.text, CANDIDATES)).map((h) => h.oracleNo!).filter((n) => !!n);
    query.oracleNos = nos.slice(0, CANDIDATES);
    if (!nos.length) return { query: { ...query, oracleNos: undefined }, direct: [], parsed };
  }
  return { query, parsed };
}

/** parseSearch (pure), then the engine: `q` is the TYPED text (not folded: `khc-29`, `231★` and `mh3:6` keep their shape), `o` the page's own filters. The result of a search is sorted by `o.sort` (default: market value); there is no relevance order across printings. */
export async function searchCards(q: string, o: Partial<CardQuery> = {}): Promise<CardPage> {
  const cq = canonicalQuery({ ...o, q: undefined }), typed = String(q ?? "").slice(0, 120);
  if (!fold(typed)) return (await getBrowseIndex()).query(cq);
  const run = async (text: string, allowWords: boolean): Promise<CardPage> => {
    const plan = await planSearch(text, { ...o });
    if (!allowWords && (plan.parsed.treat.length || plan.parsed.finish)) { /* the caller asked for the plain-name reading */ }
    if (plan.direct) return pageOf(plan.direct.slice(0, cq.per), plan.direct.length, 1, cq.per);
    return (await getBrowseIndex()).query(canonicalQuery(plan.query));
  };
  const first = await run(typed, true);
  if (first.total > 0) return first;
  const plan = await planSearch(typed, o);
  if (plan.parsed.treat.length || plan.parsed.finish || plan.parsed.etched) {                       // the words were part of the name after all
    const name = fold(typed), ix = await getBrowseIndex(), nos = (await rankedNames(name, CANDIDATES)).map((h) => h.oracleNo!).filter((n) => !!n);
    if (nos.length) {
      const again: Partial<CardQuery> = { ...o, q: undefined, oracleNos: nos };
      if (plan.parsed.set) { const f = await setFilter(ix, plan.parsed.set); if (f) Object.assign(again, f); }
      return ix.query(canonicalQuery(again));
    }
  }
  return emptyPage(cq.page, cq.per);
}

/** "Did you mean": up to three real names close to what was typed, from the hot table. [] when the query already finds something to the eye or is too short. */
export async function suggestNames(typed: string, n = 3): Promise<string[]> {
  const p = await chunkAt(0);
  return p ? didYouMean(typed, p.rows.map((r) => r[1]), n) : [];
}
