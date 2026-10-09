// owner: WP07
// src/lib/data/search.ts: the section "search.ts" of api.ts (contract 7.12). The name table (nm/<k>, hottest first), the typeahead and the search PLANNER: a typed query is parsed (src/lib/search.ts, pure), resolved to oracle numbers / a set / a collector number / treatments /
// a finish, and answered by the browse engine (plane/browse-index.ts), which does not interpret `q`. Every function reads PUBLISHED FILES through the PlaneSource of the request and holds only instance memory (kinds P and M of contract 7.5): no database, no unstable_cache.
// The names, arguments, result types and cache kinds are FROZEN (contract 7.12): this module only adds exports.
//
// Cost: nm/0 is the 8,000 hottest oracles (480 KB); a query that the hot table answers with an exact or prefix match reads nothing else. Otherwise the tail chunks nm/1.. are parsed once per data commit (about 4 files, 2 MB) and every later query is memory.
import { fold } from "../constants";
import { didYouMean, nameTier, nicknameTargets, parseSearch, type ParsedSearch } from "../search";
import { getBrowseIndex, getCardsByIds, getScrySets, getSetByCode, getSets, resolveBySetNumber } from "./catalog";
import { canonicalQuery } from "./core";
import { pageOf } from "./lite";
import type { BrowseIndex } from "./plane/browse-index";
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

/** Every oracle row by number, from all of nm/: built once per data commit, and only when a printed (reskin) name has to be put back to its card. */
const rowsByNo = (): Promise<Map<number, NameRow>> =>
  planeSource().then(({ ptr }) => memoByRef("nm:by-no", memoKey(ptr), async () => {
    const out = new Map<number, NameRow>();
    for (let n = 0; n < NAME_CHUNK_MAX; n++) { const p = await chunkAt(n); if (!p) break; for (const r of p.rows) out.set(r[0], r); }
    return out;
  }));

/** Printed (reskin) names live on the PRINTING (ix/k `alt`: "Khan, Engineered Evil" is a Sheoldred, the Apocalypse), a few hundred in all: the oracles whose printings carry one that matches, best match first. */
async function altOracles(qk: string): Promise<NameHit[]> {
  const ix = await getBrowseIndex({ withOracle: false }), best = new Map<number, { tier: number; id: number; alt: string }>();
  for (const [id, alt] of ix.alt) {
    const t = nameTier(fold(alt), qk); if (t == null) continue;
    const row = ix.rowOf(id), no = row < 0 ? 0 : ix.or[row]!; if (!no) continue;
    const had = best.get(no); if (!had || t < had.tier) best.set(no, { tier: t, id, alt });
  }
  if (!best.size) return [];
  const rows = await rowsByNo(), out: NameHit[] = [];
  for (const [no, b] of [...best].sort((x, y) => x[1].tier - y[1].tier || x[0] - y[0])) {
    const r = rows.get(no); if (!r) continue;
    out.push({ oracleNo: no, name: r[1], alt: b.alt, oracleSlug: r[2], topSlug: ix.slug[ix.rowOf(b.id)] ?? (r[3] ? String(r[3]) : ""), nPrint: r[4], topCents: r[5] });
  }
  return out;
}

/** Ranked oracles for a folded query, hot table first and the tail only when the hot answer is thin (fewer than `limit` hits, or no exact or prefix match). A printed name and a nickname ADD their card; they never remove a result. */
async function rankedNames(qk: string, limit: number): Promise<NameHit[]> {
  if (!qk) return [];
  const hot = await chunkAt(0), found = hot ? rankIn(hot, 0, qk).sort(byRelevance) : [];
  let hits = found.map(hitOf);
  if (found.length < limit || (found[0]?.tier ?? 9) > 1) {
    const tail = await getNameTail(qk), seen = new Set(hits.map((h) => h.oracleNo));
    hits = [...hits, ...tail.filter((h) => !seen.has(h.oracleNo))];
  }
  const have = new Set(hits.map((h) => h.oracleNo));
  for (const h of await altOracles(qk)) if (!have.has(h.oracleNo)) { hits.push(h); have.add(h.oracleNo); }
  const nick = new Set<number>();
  for (const target of nicknameTargets(qk)) {
    const t = hot ? hot.keys.indexOf(target) : -1;
    const hit = t >= 0 ? hitOf({ row: hot!.rows[t]!, tier: 0, via: "name", at: t, chunk: 0 }) : (await getNameTail(target)).find((h) => fold(h.name) === target);
    if (hit?.oracleNo != null) { nick.add(hit.oracleNo); if (!have.has(hit.oracleNo)) { hits.push(hit); have.add(hit.oracleNo); } }
  }
  const tier = (h: NameHit, i: number): number => (nick.has(h.oracleNo!) ? -1 : tierOfHit(h, qk)) + i * 1e-9;
  return hits.map((h, i) => ({ h, t: tier(h, i) })).sort((a, b) => a.t - b.t).map((x) => x.h).slice(0, limit);
}
const tierOfHit = (h: NameHit, qk: string): number => Math.min(nameTier(fold(h.name), qk) ?? 9, h.alt ? (nameTier(fold(h.alt), qk) ?? 9) + 0.25 : 9, ...fold(h.name).split(" // ").map((x) => (nameTier(x, qk) ?? 9) + 0.5));

/** Typeahead: hot index scan in memory, then getNameTail. One hit per ORACLE (never 159 Sol Rings), best match first, hottest first among equals. A query of fewer than two letters has no hits. */
export async function searchNames(q: string, limit = 8): Promise<NameHit[]> {
  const qk = fold(q).slice(0, 60);
  if (qk.replace(/ /g, "").length < 2) return [];
  return rankedNames(qk, Math.max(1, Math.min(CANDIDATES, Math.floor(limit) || 8)));
}

// ── the planner ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The identity, keyword and format filters and the `popular` sort read the oracle columns; every other list leaves them out (the index serves a request for less than it holds). */
export const needsOracleColumns = (q: Partial<CardQuery>): boolean => !!(q.identity || q.keyword || q.format || q.sort === "popular");
export const indexFor = (q: Partial<CardQuery>): Promise<BrowseIndex> => getBrowseIndex({ withOracle: needsOracleColumns(q) });

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

/** How a set code reaches the engine: the Scryfall code when printings carry it, else the TCGplayer group through its token or code. */
async function setFilter(ix: BrowseIndex, code: string): Promise<Pick<CardQuery, "sc" | "setIds"> | null> {
  const c = code.toLowerCase();
  if (ix.dict.sc.includes(c)) return { sc: c };
  const set = await getSetByCode(c);
  return set ? { setIds: [set.id] } : null;
}

/** The best tier at which a printing's name, a face of it or its printed (reskin) name matches. */
function printingTier(name: string, alt: string | undefined, qk: string): number {
  let t = nameTier(fold(name), qk) ?? 9;
  if (name.includes(" // ")) for (const h of name.split(" // ")) t = Math.min(t, (nameTier(fold(h), qk) ?? 9) + 0.5);
  if (alt) t = Math.min(t, (nameTier(fold(alt), qk) ?? 9) + 0.25);
  return t;
}
/** The oracles whose printings in one set match the name words, best match first: a direct pass over the rows of the set (a few hundred), so "bolt m11" finds Lightning Bolt however many cards have "bolt" in the name. */
function oraclesInSet(ix: BrowseIndex, f: Pick<CardQuery, "sc" | "setIds">, qk: string): number[] {
  const scIdx = f.sc ? ix.dict.sc.indexOf(f.sc) : -1, sets = f.setIds ? new Set(f.setIds) : null, best = new Map<number, number>();
  for (let i = 0; i < ix.n; i++) {
    if (!ix.or[i] || (f.sc ? ix.sc[i] !== scIdx : !sets!.has(ix.setId[i]!))) continue;
    const t = printingTier(ix.name[i]!, ix.alt.get(ix.id[i]!), qk), had = best.get(ix.or[i]!);
    if (t < 9 && (had === undefined || t < had)) best.set(ix.or[i]!, t);
  }
  return [...best].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([no]) => no);
}

/** A name typed in full is that card: when some oracle matches exactly (its name, a face of it, its printed name or a nickname) only those are searched, so "fire ice" is Fire // Ice and not every card with both words. Otherwise every candidate is. */
function exactOrAll(hits: readonly NameHit[], qk: string): number[] {
  const ok = hits.filter((h) => h.oracleNo != null), exact = ok.filter((h) => tierOfHit(h, qk) < 1 || nicknameTargets(qk).includes(fold(h.name)));
  return (exact.length ? exact : ok).map((h) => h.oracleNo!);
}

interface Plan { query: Partial<CardQuery>; direct?: CardLite[]; parsed: ParsedSearch }
/**
 * Resolves a typed query to a CardQuery the engine can answer (or to the 1 to 3 products of a set + number). `o` carries the filters of the page (sort, page, rarities, price range ...); the typed words add to them. Exposed for the tests.
 * A set and a number are exact: they name the 1 to 3 products of one printing (sc/<h>), not a filter.
 */
export async function planSearch(q: string, o: Partial<CardQuery> = {}): Promise<Plan> {
  const parsed = await parseQuery(q), base: Partial<CardQuery> = { ...o, q: undefined };
  const ix = await indexFor(o);
  if (parsed.set && parsed.number) {
    const rows = [...(await resolveBySetNumber([{ set: parsed.set, number: parsed.number }])).values()].flat();
    if (rows.length || !parsed.text) return { query: base, direct: rows, parsed };
  }
  const query: Partial<CardQuery> = { ...base };
  if (parsed.set) { const f = await setFilter(ix, parsed.set); if (!f) return { query: base, direct: [], parsed }; Object.assign(query, f); }
  if (parsed.finish) query.finish = parsed.finish;
  if (parsed.treat.length) query.treats = parsed.treat;
  if (parsed.text) {
    let text = parsed.text, nos = query.sc || query.setIds ? oraclesInSet(ix, { sc: query.sc, setIds: query.setIds }, text) : exactOrAll(await rankedNames(text, CANDIDATES), text);
    if (!nos.length && !parsed.set) {                                    // nothing is called that: an all-letter code at either end ("black lotus lea") was a set after all. Tried only on a miss, so "fire ice" and "war room" keep their words.
      const words = text.split(" "), codes = await setCodes();
      for (const [code, rest] of [[words[words.length - 1]!, words.slice(0, -1)], [words[0]!, words.slice(1)]] as const) {
        if (!rest.length || !codes.has(code)) continue;
        const f = await setFilter(ix, code); if (!f) continue;
        const inSet = oraclesInSet(ix, f, rest.join(" "));
        if (inSet.length) { nos = inSet; text = rest.join(" "); Object.assign(query, f); break; }
      }
    }
    if (!nos.length) return { query, direct: [], parsed };
    query.oracleNos = nos.slice(0, CANDIDATES);
  }
  return { query, parsed };
}

/**
 * parseSearch (pure), then the engine. `q` is the TYPED text (not folded: `khc-29`, `231★` and `mh3:6` keep their shape), `o` the page's own filters. The result of a search is sorted by `o.sort` (default: market value); there is no relevance order across printings.
 * Words the grammar took for a finish or a treatment are a REQUEST, not part of a name: when they leave nothing, the whole text is tried as a name ("scroll rack", "inverted iceberg", "judge of currents").
 */
export async function searchCards(q: string, o: Partial<CardQuery> = {}): Promise<CardPage> {
  const typed = String(q ?? "").slice(0, 120), ix = await indexFor(o), cq = canonicalQuery({ ...o, q: undefined });
  if (!fold(typed)) return ix.query(cq);
  const plan = await planSearch(typed, o);
  if (plan.direct) {
    const unit = plan.parsed.finish, rows = unit && plan.direct.length ? [...(await getCardsByIds(plan.direct.map((c) => c.id), { unit })).values()] : plan.direct;
    return pageOf(rows.slice(0, cq.per), rows.length, 1, cq.per);
  }
  const page = ix.query(canonicalQuery(plan.query));
  if (page.total > 0 || !(plan.parsed.treat.length || plan.parsed.finish)) return page;
  const nos = (await rankedNames(fold(typed), CANDIDATES)).map((h) => h.oracleNo!).filter((n) => !!n);
  if (!nos.length) return page;
  const again: Partial<CardQuery> = { ...o, q: undefined, oracleNos: nos };
  if (plan.parsed.set) { const f = await setFilter(ix, plan.parsed.set); if (f) Object.assign(again, f); }
  return ix.query(canonicalQuery(again));
}

/** "Did you mean": up to three real names close to what was typed, from the hot table. [] when the query already finds something to the eye or is too short. */
export async function suggestNames(typed: string, n = 3): Promise<string[]> {
  const p = await chunkAt(0);
  return p ? didYouMean(typed, p.rows.map((r) => r[1]), n) : [];
}
