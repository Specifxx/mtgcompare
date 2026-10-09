// src/lib/data/plane/browse-index.ts (owner WP02). THE IN-MEMORY BROWSE ENGINE: loads the ix/* files of ONE ref into typed arrays and answers CardQuery-shaped questions with no database. The draft's SQL list builder (buildCardPageSql) becomes these scans.
// Measured on the real S3 index (98,991 rows, 40 files, 13.2 MB): JSON.parse 78 ms + build 107 ms, heap +12 MB, RSS +54 MB; a query is 1 to 5 ms once the sort orders it needs are built (lazily, once per instance).
// MARKET ONLY (code critique 5): every sort key and every price range reads the market columns (mn, mf); a low-only row has mn = mf = -1 and so can never top `sort: value`, whatever its single listing costs
// (449401: a $203,067.70 low-only listing). The displayed value is liteFromRow's `valueUsd`.
// Server-only. Built per ref by getBrowseIndex(ref) (a module Map<ref, Promise<BrowseIndex>>); it must be RESOLVED before it is closed over by an unstable_cache callback (critique DP-06: a fetch inside the callback is force-no-store).
import { PRICE_MASK, PRIMARY_TYPES, isHiddenKind, isPlayable, type Finish } from "../../constants";
import { MARKETS } from "../../country";
import { liteFromRow, pageOf, type CardLiteRow } from "../lite";
import type { CardLite, CardPage, CardQuery, SetLite } from "../types";
import type { IxDict, IxK, IxO, IxOdict, IxP, IxS } from "./formats";
import { ixPath } from "./shards";
import { PlaneError, type PlaneSource } from "./source";

// Module bindings are getters once compiled, and the scans below read these masks per row: bind them once here (the default list is 2.5x slower reading PRICE_MASK.X inside the loop).
const { LISTED, HASN, HASF, HEADF, TRACKN, TRACKF } = PRICE_MASK;
/** Oracles per ix/o file (formats.ts IxO: dense by ordinal). */
const ORACLE_IX_CHUNK = 16_384;
export interface IndexStats { files: number; bytes: number; rows: number }
export class BrowseIndex {
  n = 0; id!: Int32Array; setId!: Int32Array; sc!: Uint16Array; ns!: Int32Array; rar!: Uint8Array; cls!: Uint8Array; fl!: Int32Array; or!: Int32Array; co!: Uint8Array; mv!: Float32Array; pt!: Uint8Array; tr!: Uint16Array; lb!: Uint16Array;
  slug: string[] = []; name: string[] = []; num: string[] = []; alt = new Map<number, string>(); scryId = new Map<number, string>();
  mn!: Int32Array; mf!: Int32Array; ln!: Int32Array; lf!: Int32Array; mk!: Int32Array;      // market and low per finish, -1 = none; mk = catalogue mask
  c7!: Float32Array; c30!: Float32Array;                                                      // [row * 2 + finish], NaN = untracked
  low!: Int32Array; stores!: Uint8Array;                                                      // [(row * 2 + finish) * 6 + market]: cheapest fresh in-stock listing (incl. TCGplayer's own low in the US), store counts; -1 / 0 = none or the store stage has not covered the unit
  smin!: Int32Array;                                                                          // same index: the cheapest fresh in-stock STORE listing, never TCGplayer's own low: the Deal Finder's buy side (a US row that TCGplayer itself undercuts is not a deal, so `low` cannot stand in); -1 = none
  dict!: IxDict; oCo = new Int32Array(0); oIdn = new Int32Array(0); oEd = new Int32Array(0); oLg = new Int32Array(0); oKw = new Int32Array(0); odict: IxOdict = { v: 1, legal: [""], keywords: [""] };
  /** true when the oracle columns (colours, identity, legality, EDHREC rank, keywords) were loaded: identity, keyword and format filters and the `popular` sort need them and refuse to run without. */
  hasOracle = false;
  private hidden = new Set<number>(); private hiddenRow = new Uint8Array(0); private rowOfId = new Map<number, number>(); private orders = new Map<string, Int32Array>(); private releaseOf = new Map<number, string>(); private setTok = new Map<number, string>();
  readonly stats: IndexStats = { files: 0, bytes: 0, rows: 0 };

  /** Load every ix chunk of the ref. `withStores` false skips ix/s (pages that need no store columns). The caller passes the sets (getSets) for the `newest` order and the display code. */
  static async load(src: PlaneSource, sets: readonly SetLite[], o: { withStores?: boolean; withOracle?: boolean } = {}): Promise<BrowseIndex> {
    const ix = new BrowseIndex(); const txt = async (rel: string): Promise<string> => { const s = await src.text(rel); ix.stats.files++; ix.stats.bytes += s.length; return s; };
    for (const s of sets) { ix.releaseOf.set(s.id, s.releasedOn ?? ""); ix.setTok.set(s.id, s.tok); if (isHiddenKind(s.kind)) ix.hidden.add(s.id); }
    const odictText = o.withOracle ? txt("ix/odict.json") : null; odictText?.catch(() => undefined);                    // issued with the dictionary: the first round is two files
    const dict = JSON.parse(await txt("ix/dict.json")) as IxDict; ix.dict = dict; const n = (ix.n = dict.rows); ix.stats.rows = n;
    ix.id = new Int32Array(n); ix.setId = new Int32Array(n); ix.sc = new Uint16Array(n); ix.ns = new Int32Array(n); ix.rar = new Uint8Array(n); ix.cls = new Uint8Array(n); ix.fl = new Int32Array(n); ix.or = new Int32Array(n);
    ix.co = new Uint8Array(n); ix.mv = new Float32Array(n); ix.pt = new Uint8Array(n); ix.tr = new Uint16Array(n); ix.lb = new Uint16Array(n); ix.mn = new Int32Array(n); ix.mf = new Int32Array(n); ix.ln = new Int32Array(n); ix.lf = new Int32Array(n); ix.mk = new Int32Array(n);
    ix.c7 = new Float32Array(n * 2).fill(NaN); ix.c30 = new Float32Array(n * 2).fill(NaN); ix.low = new Int32Array(n * 12).fill(-1); ix.smin = new Int32Array(n * 12).fill(-1); ix.stores = new Uint8Array(n * 12);
    ix.slug = new Array(n); ix.name = new Array(n); ix.num = new Array(n);
    const chunks = Math.ceil(n / dict.chunk), missing = (e: unknown): string => { if (e instanceof PlaneError && e.reason === "missing") return ""; throw e; };
    // every chunk file is requested at once and the reader's in-flight cap (8) paces them: 40 files are 5 rounds from raw, not 13+ (contract 12.7.4); the texts are held together (13 MB) until they are parsed in order
    const texts = await Promise.all(Array.from({ length: chunks }, (_, ch) => Promise.all([txt(ixPath("k", ch)), txt(ixPath("p", ch)), o.withStores === false ? Promise.resolve("") : txt(ixPath("s", ch)).catch(missing)])));   // ix/s is a phase-2 family: absent before the first store stage, then every store column reads "none"
    for (let ch = 0; ch < chunks; ch++) {
      const off = ch * dict.chunk, [ks, ps, ss] = texts[ch]!; texts[ch] = ["", "", ""];
      const K = JSON.parse(ks) as IxK, P = JSON.parse(ps) as IxP, S = ss ? (JSON.parse(ss) as IxS) : null;
      for (let r = 0; r < K.n; r++) {
        const i = off + r;
        ix.id[i] = K.id[r]!; ix.setId[i] = K.set[r]!; ix.sc[i] = K.sc[r]!; ix.ns[i] = K.ns[r]!; ix.rar[i] = K.rar.charCodeAt(r); ix.cls[i] = K.cls.charCodeAt(r) - 48; ix.fl[i] = K.fl[r]!; ix.or[i] = K.or[r]!; ix.co[i] = K.co[r]!; ix.mv[i] = K.mv[r]!; ix.pt[i] = K.pt.charCodeAt(r) - 48;
        ix.tr[i] = K.tr[r]!; ix.lb[i] = K.lb[r]!; ix.slug[i] = K.slug[r]!; ix.name[i] = K.name[r]!; ix.num[i] = K.num[r]!;
        ix.mn[i] = P.mn[r]!; ix.mf[i] = P.mf[r]!; ix.ln[i] = P.ln[r]!; ix.lf[i] = P.lf[r]!; ix.mk[i] = P.mk[r]!; ix.rowOfId.set(ix.id[i]!, i);
      }
      for (const [r, a] of Object.entries(K.alt)) ix.alt.set(ix.id[off + Number(r)]!, a); for (const [r, a] of Object.entries(K.sid)) ix.scryId.set(ix.id[off + Number(r)]!, a);
      for (const [r, f, c7, c30] of P.t) { ix.c7[(off + r) * 2 + f] = c7 / 10; ix.c30[(off + r) * 2 + f] = c30 / 10; }
      if (S) for (const u of S.u) { const base = ((off + u[0]!) * 2 + u[1]!) * 6; for (let m = 0; m < 6; m++) { ix.low[base + m] = u[2 + m]!; ix.stores[base + m] = u[8 + m]!; ix.smin[base + m] = u[14 + m] ?? -1; } }
    }
    ix.hiddenRow = new Uint8Array(n); if (ix.hidden.size) for (let i = 0; i < n; i++) ix.hiddenRow[i] = ix.hidden.has(ix.setId[i]!) ? 1 : 0;      // one pass here, one array read per row in query()
    if (o.withOracle) {
      ix.odict = JSON.parse(await odictText!) as IxOdict;
      let top = 0; for (let i = 0; i < ix.n; i++) if (ix.or[i]! > top) top = ix.or[i]!; const total = top + 1; ix.oCo = new Int32Array(total); ix.oIdn = new Int32Array(total); ix.oEd = new Int32Array(total).fill(-1); ix.oLg = new Int32Array(total); ix.oKw = new Int32Array(total); ix.hasOracle = true;
      const files = await Promise.all(Array.from({ length: Math.ceil(total / ORACLE_IX_CHUNK) }, (_, c) => txt(`ix/o-${c}.json`).catch(missing)));
      for (const s of files) { if (!s) continue; const O = JSON.parse(s) as IxO; O.no.forEach((no, r) => { if (no < total) { ix.oCo[no] = O.co[r]!; ix.oIdn[no] = O.idn[r]!; ix.oEd[no] = O.ed[r]!; ix.oLg[no] = O.lg[r]!; ix.oKw[no] = O.kw[r]!; } }); }
    }
    return ix;
  }
  finishOf(i: number, f?: Finish): 0 | 1 { return f === "N" ? 0 : f === "F" ? 1 : (this.mk[i]! & HEADF) ? 1 : 0; }
  /** The MARKET of the shown unit (-1 none). Never a low. */
  market(i: number, fi: 0 | 1): number { return fi === 0 ? this.mn[i]! : this.mf[i]!; }
  private val(i: number, f?: Finish): number { return this.market(i, this.finishOf(i, f)); }
  private order(sort: CardQuery["sort"], f?: Finish): Int32Array {
    const key = `${sort}:${f ?? "h"}`; let o = this.orders.get(key); if (o) return o;
    const idx = Array.from({ length: this.n }, (_, i) => i); const rel = (i: number) => this.releaseOf.get(this.setId[i]!) ?? "";
    const c7 = (i: number) => this.c7[i * 2 + this.finishOf(i, f)]!;
    const ed = (i: number) => { const e = this.oEd[this.or[i]!] ?? -1; return e > 0 ? e : 1e9; };
    const cmp: Record<CardQuery["sort"], (a: number, b: number) => number> = {
      value: (a, b) => this.val(b, f) - this.val(a, f) || a - b,
      "price-desc": (a, b) => this.val(b, f) - this.val(a, f) || a - b,
      "price-asc": (a, b) => (this.val(a, f) < 0 ? 1e12 : this.val(a, f)) - (this.val(b, f) < 0 ? 1e12 : this.val(b, f)) || a - b,
      name: (a, b) => (this.name[a]! < this.name[b]! ? -1 : this.name[a]! > this.name[b]! ? 1 : a - b),
      number: (a, b) => this.ns[a]! - this.ns[b]! || a - b,
      newest: (a, b) => (rel(a) < rel(b) ? 1 : rel(a) > rel(b) ? -1 : a - b),
      rising: (a, b) => ((Number.isNaN(c7(b)) ? -1e9 : c7(b)) - (Number.isNaN(c7(a)) ? -1e9 : c7(a))) || a - b,
      falling: (a, b) => ((Number.isNaN(c7(a)) ? 1e9 : c7(a)) - (Number.isNaN(c7(b)) ? 1e9 : c7(b))) || a - b,
      popular: (a, b) => ed(a) - ed(b) || this.val(b, f) - this.val(a, f) || a - b,
    };
    o = Int32Array.from(idx.sort(cmp[sort])); this.orders.set(key, o); return o;
  }
  private rowFor(i: number, unit?: Finish): CardLiteRow {
    const shown = unit ?? (this.finishOf(i) === 1 ? "F" : "N"), fi = shown === "N" ? 0 : 1, base = (i * 2 + fi) * 6; const nz = (v: number): number | null => (v < 0 ? null : v);
    const c7 = this.c7[i * 2 + fi]!, c30 = this.c30[i * 2 + fi]!;
    const tracked = !Number.isNaN(c7) || (this.mk[i]! & (fi === 0 ? TRACKN : TRACKF)) !== 0;
    const hasAgg = tracked && (this.low[base]! >= 0 || this.stores[base]! > 0 || this.low.slice(base, base + 6).some((v) => v >= 0));
    return {
      id: this.id[i]!, slug: this.slug[i]!, name: this.name[i]!, alt: this.alt.get(this.id[i]!) ?? null, setId: this.setId[i]!, sc: this.sc[i]! ? this.dict.sc[this.sc[i]!]! : null, number: this.num[i]! || null, rarity: String.fromCharCode(this.rar[i]!), cls: this.cls[i]!,
      treat: this.dict.tr[this.tr[i]!] ?? "", label: this.dict.lb[this.lb[i]!] || null, flags: this.fl[i]!, oracleNo: this.or[i]! || null, scryId: this.scryId.get(this.id[i]!) ?? null, colors: this.co[i]!, mv: this.mv[i]!, ptype: this.pt[i]!, setTok: this.setTok.get(this.setId[i]!) ?? "",
      marketN: nz(this.mn[i]!), marketF: nz(this.mf[i]!), lowN: nz(this.ln[i]!), lowF: nz(this.lf[i]!), mask: this.mk[i]!, shown,
      low: hasAgg ? Array.from({ length: 6 }, (_, m) => nz(this.low[base + m]!)) : null, stores: hasAgg ? Array.from({ length: 6 }, (_, m) => this.stores[base + m]!) : null,
      change7d: Number.isNaN(c7) ? null : decimal1(c7), change30d: Number.isNaN(c30) ? null : decimal1(c30), high90: null,
    };
  }
  liteAt(i: number, unit?: Finish): CardLite { return liteFromRow(this.rowFor(i, unit)); }
  /** The row of a product id in this index (-1 when it is not a listed row): the key from a flat offer (ix/f `uid` >> 1) or a user's product id to the columns above. */
  /** The ids of the `k` printings the most stores have in stock: the headline finish's store counts summed over the six markets, the dearest market first on a tie; class 0 only, `skip(name)` leaves rows out (basic lands). [] when no store stage has run. */
  mostStocked(k: number, skip: (name: string) => boolean = () => false): number[] {
    const top: { i: number; s: number; v: number }[] = [];
    const worse = (a: { s: number; v: number }, b: { s: number; v: number }): boolean => a.s < b.s || (a.s === b.s && a.v <= b.v);
    for (let i = 0; i < this.n; i++) {
      if (this.cls[i] !== 0 || skip(this.name[i] ?? "")) continue;
      const fi = this.finishOf(i), base = (i * 2 + fi) * 6;
      let s = 0;
      for (let m = 0; m < 6; m++) s += this.stores[base + m]!;
      if (s === 0) continue;
      const row = { i, s, v: this.market(i, fi) };
      if (top.length >= k && worse(row, top[top.length - 1]!)) continue;
      top.push(row);
      top.sort((a, b) => b.s - a.s || b.v - a.v || a.i - b.i);
      if (top.length > k) top.pop();
    }
    return top.map((t) => this.id[t.i]!);
  }
  rowOf(id: number): number { return this.rowOfId.get(id) ?? -1; }
  /** The rows of known ids (listed rows only: an unlisted or gone id is absent and the caller falls back to the bucket fan-in). */
  lookup(ids: readonly number[], unit?: Finish): Map<number, CardLite> { const out = new Map<number, CardLite>(); for (const id of ids) { const i = this.rowOfId.get(id); if (i !== undefined) out.set(id, this.liteAt(i, unit)); } return out; }

  /** Answers a CANONICAL CardQuery (core.ts canonicalQuery) by one pass over the rows and a walk down a presorted order. Not interpreted here: `q` (free text; the search planner of WP07 resolves it to oracleNos / sc / treats / finish first) and `rootId` (a family is read from the card's
   *  own bucket; asking the index for it throws). Hidden set kinds (art-series, oversized) are out unless `includeHidden` is set or the query names the set in `setIds`. A filter that needs the oracle columns throws on an index loaded without them. */
  query(q: CardQuery): CardPage {
    const m = this.match(q); if (!m) return pageOf([], 0, q.page, q.per);
    const { ok, total } = m, f = q.finish;
    const ord = this.order(q.sort, f), off = (q.page - 1) * q.per, items: CardLite[] = []; let seen = 0;
    for (let k = 0; k < ord.length && items.length < q.per; k++) { const i = ord[k]!; if (!ok[i]) continue; if (seen++ < off) continue; items.push(this.liteAt(i, f)); }
    return pageOf(items, total, q.page, q.per);
  }
  /** The rows a CANONICAL CardQuery matches, in index (id) order, unsorted and unpaged: for an order the presorted keys cannot express (the search planner's relevance, data/search.ts). Same filters, same errors as query(). */
  select(q: CardQuery): number[] {
    const m = this.match(q), out: number[] = []; if (!m) return out;
    for (let i = 0; i < this.n; i++) if (m.ok[i]) out.push(i);
    return out;
  }
  /** The one filter pass of query() and select(): ok[i] = 1 for every row the query keeps. null = nothing can match (an unknown Scryfall code). */
  private match(q: CardQuery): { ok: Uint8Array; total: number } | null {
    if (q.rootId != null) throw new Error("CardQuery.rootId is answered from the card's cat bucket (getCardDetail family), not by the browse index");
    if ((q.identity || q.keyword || q.format || q.sort === "popular") && !this.hasOracle) throw new Error("this browse index was loaded without the oracle columns: identity, keyword, format and the popular sort need withOracle");
    const n = this.n, ok = new Uint8Array(n); let total = 0; const f = q.finish;
    const trOk = q.treats?.length ? Uint8Array.from(this.dict.tr, (t) => (t.split(" ").some((w) => q.treats!.includes(w)) ? 1 : 0)) : null;
    const kwOk = q.keyword ? Uint8Array.from(this.odict.keywords, (k) => (k.split(" ").includes(q.keyword!) ? 1 : 0)) : null;
    const fmtOk = q.format ? Uint8Array.from(this.odict.legal, (l) => (isPlayable(l, q.format!.key) === q.format!.playable ? 1 : 0)) : null;
    const hide = !q.includeHidden && this.hidden.size > 0 && !(q.setIds?.length);
    const setSet = q.setIds?.length ? new Set(q.setIds) : null, rar = q.rarities?.length ? q.rarities.join("") : "", classes = q.classes ?? [0];
    const typeSet = q.types?.length ? new Set(q.types.map((t) => PRIMARY_TYPES.indexOf(t as never)).filter((x) => x >= 0)) : null;
    const scIdx = q.sc ? this.dict.sc.indexOf(q.sc) : -1; if (q.sc && scIdx < 0) return null;
    const oracles = q.oracleNos?.length ? new Set(q.oracleNos) : q.oracleNo != null ? new Set([q.oracleNo]) : null;
    const col = q.colors; const idn = q.identity;
    for (let i = 0; i < n; i++) {
      const mk = this.mk[i]!;
      if (!(mk & LISTED) && !q.includeUnlisted) continue;
      if (!classes.includes(this.cls[i]!)) continue;
      if (setSet && !setSet.has(this.setId[i]!)) continue;
      if (hide && this.hiddenRow[i]) continue;
      if (scIdx >= 0 && this.sc[i] !== scIdx) continue;
      if (rar && !rar.includes(String.fromCharCode(this.rar[i]!))) continue;
      if (typeSet && !typeSet.has(this.pt[i]!)) continue;
      if (trOk && !trOk[this.tr[i]!]) continue;
      if (oracles && !oracles.has(this.or[i]!)) continue;
      if (kwOk && !(this.or[i] && kwOk[this.oKw[this.or[i]!]!])) continue;
      if (fmtOk && !(this.or[i] && fmtOk[this.oLg[this.or[i]!]!])) continue;
      if (col) { if (!this.or[i]) continue; const c = this.co[i]!; const m = col.mask;
        if (col.mode === "any" && !(c & m)) continue; if (col.mode === "exact" && c !== m) continue; if (col.mode === "within" && (c & ~m) !== 0) continue; if (col.mode === "colorless" && c !== 0) continue; if (col.mode === "multi" && popcount(c) < 2) continue; }
      if (idn) { if (!this.or[i]) continue; const d = this.oIdn[this.or[i]!] ?? 0; if ((d & ~idn.mask) !== 0) continue; }
      if (f && !(mk & (f === "N" ? HASN : HASF))) continue;
      const fi = this.finishOf(i, f), v = this.market(i, fi);
      if (q.minCents != null && !(v >= q.minCents)) continue;                                  // MARKET only: a low-only unit (v = -1) matches no range
      if (q.maxCents != null && !(v >= 0 && v <= q.maxCents)) continue;
      if (q.tracked && !(mk & (f ? (f === "N" ? TRACKN : TRACKF) : TRACKN | TRACKF))) continue;
      if (q.pricedIn) { const mi = MARKETS.indexOf(q.pricedIn); if (this.low[(i * 2 + fi) * 6 + mi]! < 0) continue; }
      ok[i] = 1; total++;
    }
    return { ok, total };
  }
  /** One pass: counts of the listed class-0 rows by rarity, primary type and colour (the facet pages). */
  facetCounts(): { rarity: Record<string, number>; type: Record<string, number>; treat: Record<string, number>; color: Record<string, number> } {
    const rarity: Record<string, number> = {}, type: Record<string, number> = {}, treat: Record<string, number> = {}, color: Record<string, number> = {};
    for (let i = 0; i < this.n; i++) {
      if (!(this.mk[i]! & LISTED) || this.cls[i] !== 0) continue;
      const r = String.fromCharCode(this.rar[i]!); rarity[r] = (rarity[r] ?? 0) + 1; const t = PRIMARY_TYPES[this.pt[i]!] ?? "other"; type[t] = (type[t] ?? 0) + 1;
      for (const w of (this.dict.tr[this.tr[i]!] ?? "").split(" ")) if (w) treat[w] = (treat[w] ?? 0) + 1;
      const c = this.co[i]!; for (let b = 0; b < 5; b++) if (c & (1 << b)) color["WUBRG"[b]!] = (color["WUBRG"[b]!] ?? 0) + 1; if (!c && this.or[i]) color["C"] = (color["C"] ?? 0) + 1;
    }
    return { rarity, type, treat, color };
  }
}
/** The change columns are Float32Arrays (the sort orders and the scans want the memory); a tile must carry the published decimal (1.3), not the nearest single-precision value (1.2999999523162842), so both paths of a tile are equal. */
const decimal1 = (x: number): number => Math.round(x * 10) / 10;
const popcount = (x: number): number => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
