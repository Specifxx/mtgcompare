// owner: WP07
// src/lib/data/lists.ts: the section "lists.ts" of api.ts (contract 7.12). The card lists: the page the browse engine answers for a CardQuery, the movers feed, the newest cards and the A-Z oracle index. Every function reads PUBLISHED FILES through the PlaneSource of the
// request (pinned to one data commit by getDataRef) and holds only instance memory: no database, no unstable_cache (kinds P and M of contract 7.5). The names, arguments, result types and cache kinds are FROZEN (7.12): this module only adds exports.
import { fold, type Finish } from "../constants";
import { getBrowseIndex, getCardsByIds } from "./catalog";
import { canonicalQuery } from "./core";
import { indexFor, searchCards } from "./search";
import type { IxO, IxOdict, MoversFile, NameFile } from "./plane/formats";
import { memoByRef, memoKey, optionalOf, planeSource } from "./plane/runtime";
import { moversPath, nameChunkPath } from "./plane/shards";
import type { CardLite, CardPage, CardQuery, OracleMini } from "./types";

const NAME_CHUNK_MAX = 64;
const ORACLE_IX_CHUNK = 16_384;
const MOVERS_MAX = 100;
const clampInt = (n: unknown, lo: number, hi: number, d: number): number => { const v = Math.floor(Number(n)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

/**
 * M engine: canonicalQuery(q) -> BrowseIndex.query, 1 to 5 ms once the sort order is built (the first query of a sort is 50 to 130 ms, then it is kept). MARKET ONLY: sorts and price ranges read the market of the shown unit, so a low-only unit never tops `value` and matches no range.
 * Free text (`q`) goes through the search planner (data/search.ts), which resolves it to oracles, a set, a collector number, treatments and a finish before the engine is asked; `/browse?q=` and `/search?q=` share it. `rootId` is not a list filter (a family is read from the card's bucket).
 */
export async function getCardPage(q: Partial<CardQuery>): Promise<CardPage> {
  if (typeof q.q === "string" && fold(q.q)) return searchCards(q.q, q);
  return (await indexFor(q)).query(canonicalQuery(q));
}

/** P mv/<dir>-<w>-<a|n|f>.json when setId is absent (n <= 100), else the engine. `minCents` is on the unit's market. A view that has not enough history to rank yet is an empty list, never an error. */
export async function getMovers(o: { dir: "up" | "down"; window: 7 | 30; finish?: Finish; minCents?: number; setId?: number; n?: number }): Promise<CardLite[]> {
  const n = clampInt(o.n, 1, MOVERS_MAX, 50), window: 7 | 30 = o.window === 30 ? 30 : 7, min = o.minCents != null && o.minCents > 0 ? Math.floor(o.minCents) : null;
  const moves = (c: CardLite): number | null => (window === 30 ? c.change30d : c.change7d);
  const rightWay = (c: CardLite): boolean => { const m = moves(c); return m != null && (o.dir === "up" ? m > 0 : m < 0); };
  if (o.setId != null) {                                                    // the engine: the set's dearest cards (a mover worth reading has a price), ranked by the window's change
    const unit = o.finish, ix = await getBrowseIndex(), rows: CardLite[] = [];
    for (let page = 1; page <= 4; page++) {
      const r = ix.query(canonicalQuery({ setIds: [o.setId], finish: unit, minCents: min ?? undefined, sort: window === 7 ? (o.dir === "up" ? "rising" : "falling") : "value", page, per: 100 }));
      rows.push(...r.items); if (page >= r.pages || (window === 7 && r.items.some((c) => !rightWay(c)))) break;
    }
    const sign = o.dir === "up" ? -1 : 1;
    return rows.filter(rightWay).sort((a, b) => sign * ((moves(a) ?? 0) - (moves(b) ?? 0)) || a.id - b.id).slice(0, n);
  }
  const { src } = await planeSource(), view = o.finish === "N" ? "n" : o.finish === "F" ? "f" : "a";
  const f = await optionalOf<MoversFile>(src, moversPath(o.dir, window, view));
  const rows = (f?.r ?? []).filter((r) => min == null || r[8] >= min).slice(0, n);
  if (!rows.length) return [];
  const byFinish: Record<Finish, number[]> = { N: [], F: [] };
  for (const r of rows) byFinish[r[1] === 1 ? "F" : "N"].push(r[0]);
  const found = new Map<number, CardLite>();
  for (const unit of ["N", "F"] as const) if (byFinish[unit].length) for (const [id, c] of await getCardsByIds(byFinish[unit], { stores: false, unit })) found.set(id * 2 + (unit === "N" ? 0 : 1), c);
  return rows.flatMap((r) => { const c = found.get(r[0] * 2 + r[1]); return c ? [c] : []; });
}

/** M engine, newest set first; n <= 100. Cards of one set keep the engine's tie order (id), so a page is stable. */
export async function getNewestCards(n = 24): Promise<CardLite[]> {
  const want = clampInt(n, 1, 100, 24), per = want <= 24 ? 24 : want <= 48 ? 48 : 100;
  return (await getBrowseIndex()).query(canonicalQuery({ sort: "newest", page: 1, per })).items.slice(0, want);
}

// ── the A-Z oracle index ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface OracleCols { co: number; idn: number; legal: string; fl: number }
const letterOf = (name: string): string => { const c = fold(name).charAt(0); return c >= "a" && c <= "z" ? c.toUpperCase() : "#"; };
/** Every oracle name by first letter (A to Z, # for a digit or symbol), sorted by folded name, built once per data commit from all of nm/ (about 5 files). */
function azTable(): Promise<Map<string, { key: string; row: NameFile["r"][number] }[]>> {
  return planeSource().then(({ src, ptr }) => memoByRef("oracle-az", memoKey(ptr), async () => {
    const out = new Map<string, { key: string; row: NameFile["r"][number] }[]>();
    for (let n = 0; n < NAME_CHUNK_MAX; n++) {
      const f = await optionalOf<NameFile>(src, nameChunkPath(n)); if (!f) break;
      for (const row of f.r) { const L = letterOf(row[1]); (out.get(L) ?? out.set(L, []).get(L)!).push({ key: fold(row[1]), row }); }
    }
    for (const list of out.values()) list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.row[0] - b.row[0]));
    return out;
  }));
}
/** Colours, identity, legality and flags of every oracle, from ix/o: the columns an OracleMini carries beyond the name table. */
function oracleCols(): Promise<Map<number, OracleCols>> {
  return planeSource().then(({ src, ptr }) => memoByRef("oracle-cols", memoKey(ptr), async () => {
    const odict = await optionalOf<IxOdict>(src, "ix/odict.json"), out = new Map<number, OracleCols>();
    for (let c = 0; c < NAME_CHUNK_MAX; c++) {
      const f = await optionalOf<IxO>(src, `ix/o-${c}.json`); if (!f) break;
      f.no.forEach((no, r) => out.set(no, { co: f.co[r]!, idn: f.idn[r]!, legal: odict?.legal[f.lg[r]!] ?? "", fl: f.fl[r]! }));
      if (f.no.length < ORACLE_IX_CHUNK) break;
    }
    return out;
  }));
}
/** P nm/<k>; 100 per page. `letter` is A to Z or #; a page past the end is empty and the total is still the letter's. The type line is not in the name table: it is "" here (the card hub has it). */
export async function getOracleAZ(letter: string, page: number): Promise<{ total: number; items: OracleMini[] }> {
  const L = String(letter ?? "").trim().toUpperCase().charAt(0) || "A", key = L >= "A" && L <= "Z" ? L : "#", p = clampInt(page, 1, 1000, 1);
  const list = (await azTable()).get(key) ?? [];
  const slice = list.slice((p - 1) * 100, p * 100), cols = slice.length ? await oracleCols() : new Map<number, OracleCols>();
  return {
    total: list.length,
    items: slice.map(({ key: nameKey, row }): OracleMini => {
      const c = cols.get(row[0]);
      return { no: row[0], slug: row[2], name: row[1], nameKey, colors: c?.co ?? 0, identity: c?.idn ?? 0, typeLine: "", nPrint: row[4], legal: c?.legal ?? "", flags: c?.fl ?? 0 };
    }),
  };
}
