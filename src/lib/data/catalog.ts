// owner: WP02
// src/lib/data/catalog.ts: the section "catalog.ts" of api.ts (contract 7.12). Sets, the card and oracle pages, the by-id and by-slug lookups, the browse index. Every function reads PUBLISHED FILES through the PlaneSource of the request (pinned to one
// data commit by getDataRef) and nothing else: no database, no unstable_cache (kinds P and M of contract 7.5). The names, arguments, result types and cache kinds are FROZEN (7.12).
import { PRICE_MASK, fold, nkey } from "../constants";
import type { Finish } from "../constants";
import { MARKETS } from "../country";
import { SHIM_MEMO_MS, CatalogShimError, buildCatalog, shimAllowed } from "./catalog-shim";
import { canonicalQuery } from "./core";
import { detailFromPlane, familyMembers, liteFromRow, miniFromBoard, miniOf, oracleFromRow, oracleMiniOf, rowFromPlane } from "./lite";
import { BrowseIndex } from "./plane/browse-index";
import type { BoardFile, CatFile, CatRow, NameFile, OfferFile, OracleShard, PointerFile, PxFile, PxRow, ScShard, ScrySetsFile, SealedListFile, SetRow, SetsFile, SlugShard, StoreRunsFile, UnFile, UnRow } from "./plane/formats";
import { bucketList, indexById, memoByRef, memoKey, optionalOf, peekByRef, planeSource, type BucketList } from "./plane/runtime";
import { PlaneError, type PlaneSource } from "./plane/source";
import { boardPath, bucketPath, cardBucket, nameChunkPath, oracleShard, scPath, sealedListPath, slugPath } from "./plane/shards";
import type { StatusFile } from "./plane/status";
import type { Catalog, CardDetail, CardLite, CardLookup, CardMini, CatalogStats, FamilyMember, OracleDetail, OracleMini, ScrySetLite, SetIndex, SetLite } from "./types";

type Ctx = { src: PlaneSource; ptr: PointerFile };
const sealedChunkMax = 16;                                                                            // sl/list has at most 12 files (FILE_BUDGETS); a runaway `chunks` field never loops forever
/** More distinct buckets than this and getCardsByIds reads the browse index instead of the bucket files (a random 300-card collection would need 738 files; contract 7.6). */
const FANIN_MAX_BUCKETS = 9;

// ── sets (P meta/sets.json, M the derived maps) ─────────────────────────────────────────────────────────────────────────────
interface SetsView { list: SetLite[]; byId: Map<number, SetLite>; bySlug: Map<string, SetLite>; byTok: Map<string, SetLite>; byCode: Map<string, SetLite> }
const setOfRow = (r: SetRow): SetLite => ({ id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[5] || r[4], kind: r[6] as SetLite["kind"], releasedOn: r[7] || null, bucket: r[8] === 1, cardCount: r[10], trackedCount: r[11], sealedCount: r[12] });
function setsView({ src, ptr }: Ctx): Promise<SetsView> {
  return memoByRef("sets", memoKey(ptr), async () => {
    const f = await src.json<SetsFile>("meta/sets.json"), list = f.sets.map(setOfRow), byCode = new Map<string, SetLite>();
    // tok first, then the display code, then the Scryfall code: when two sets claim one string the first claim wins, and a set's own token is always its own
    for (const pick of [(r: SetRow) => r[2], (r: SetRow) => r[3], (r: SetRow) => r[9]]) f.sets.forEach((r, i) => { const k = String(pick(r) || "").toLowerCase(); if (k && !byCode.has(k)) byCode.set(k, list[i]!); });
    return { list, byId: new Map(list.map((s) => [s.id, s] as const)), bySlug: new Map(list.map((s) => [s.slug, s] as const)), byTok: new Map(list.map((s) => [s.tok, s] as const)), byCode };
  });
}
export async function getSets(): Promise<SetLite[]> { return [...(await setsView(await planeSource())).list]; }
function scryView({ src, ptr }: Ctx): Promise<Record<string, ScrySetLite>> {
  return memoByRef("scrysets", memoKey(ptr), async () => {
    const f = await src.json<ScrySetsFile>("meta/scrysets.json"), out: Record<string, ScrySetLite> = {};
    for (const [code, name, setType, releasedOn, parent] of f.sets) out[code] = { code, name, setType, releasedOn: releasedOn || null, parent: parent || null };
    return out;
  });
}
export async function getScrySets(): Promise<Record<string, ScrySetLite>> { return { ...(await scryView(await planeSource())) }; }
export async function getSetIndex(): Promise<SetIndex> { const v = await setsView(await planeSource()); return { sets: [...v.list], byId: v.byId, bySlug: v.bySlug, byTok: v.byTok }; }
export async function getSetBySlug(slug: string): Promise<SetLite | null> { return (await setsView(await planeSource())).bySlug.get(String(slug ?? "").toLowerCase()) ?? null; }
/** Accepts Set.tok, Set.code and the Scryfall code of the set, in any case. */
export async function getSetByCode(code: string): Promise<SetLite | null> { return (await setsView(await planeSource())).byCode.get(String(code ?? "").trim().toLowerCase()) ?? null; }
/** The counts a page quotes. units from the pointer, the rest from status.json at the pointed commit; pricedByMarket reads status `counts.pricedByMarket` (MARKETS order) once the publisher writes it (REQ-WP02-1) and otherwise knows only the US figure (every listed card has a TCGplayer price). */
export async function getCatalogStats(): Promise<CatalogStats> {
  const c = await planeSource(), sets = await setsView(c), st = await optionalOf<StatusFile>(c.src, "status.json"), k = st?.counts, p = c.ptr.counts;
  const priced = (k as (typeof k & { pricedByMarket?: number[] }) | undefined)?.pricedByMarket;
  return {
    cards: k?.cards ?? p.cards, tracked: k?.tracked ?? 0, units: p.units, oracles: k?.oracles ?? 0, sets: sets.list.length, sealed: k?.sealed ?? 0,
    pricedByMarket: Object.fromEntries(MARKETS.map((m, i) => [m, priced?.[i] ?? (m === "US" ? (k?.listed ?? p.cards) : 0)])) as CatalogStats["pricedByMarket"], pricesAt: c.ptr.publishedAt,
  };
}

// ── bucket fan-in ────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface BucketRows { cat: Map<number, CatRow>; px: Map<number, PxRow>; un: Map<number, UnRow>; catRows: readonly CatRow[] }
/** cat + px (+ un when the bucket holds tracked units) of one bucket. A bucket the list rules out is empty; a file that is absent is empty; a failing host throws. */
async function readBucket(src: PlaneSource, b: number, list: BucketList | null, withUn: boolean): Promise<BucketRows> {
  if (list && !list.cat.has(b)) return { cat: new Map(), px: new Map(), un: new Map(), catRows: [] };
  const [cat, px, un] = await Promise.all([optionalOf<CatFile>(src, bucketPath("cat", b)), optionalOf<PxFile>(src, bucketPath("px", b)), withUn && (!list || list.tracked.has(b)) ? optionalOf<UnFile>(src, bucketPath("un", b)) : Promise.resolve(null)]);
  return { cat: cat ? indexById(cat, cat.c) : new Map(), px: px ? indexById(px, px.p) : new Map(), un: un ? indexById(un, un.u) : new Map(), catRows: cat?.c ?? [] };
}
const unRowsOf = (r: BucketRows, id: number): UnRow[] => [r.un.get(id * 2), r.un.get(id * 2 + 1)].filter((u): u is UnRow => u !== undefined);

async function fanIn(c: Ctx, sets: SetsView, ids: readonly number[], o: { stores: boolean; unit?: Finish }, out: Map<number, CardLite>): Promise<void> {
  const list = await bucketList(c.src, c.ptr), by = new Map<number, number[]>();
  for (const id of ids) (by.get(cardBucket(id)) ?? by.set(cardBucket(id), []).get(cardBucket(id))!).push(id);
  await Promise.all([...by].map(async ([b, bids]) => {
    const rows = await readBucket(c.src, b, list, o.stores);
    for (const id of bids) { const cat = rows.cat.get(id); if (cat) out.set(id, liteFromRow(rowFromPlane(cat, rows.px.get(id), sets.byId.get(cat[4])?.tok ?? "", unRowsOf(rows, id), o.unit))); }
  }));
}
/** Fan-in by bucket: P cat/px (+ un) of the distinct buckets (floor(id / 256)); more than 9 buckets reads the browse index (M), and only the ids the index does not hold (unlisted rows) go back to the bucket files, when those fit in 9 buckets. Misses are absent from the map.
 *  <= 2,000 ids. Per-user class: /api/* and account pages. `stores` (default true) adds the store aggregates of tracked units (un); `unit` shows every card in that finish instead of its headline (the movers feed). */
export async function getCardsByIds(ids: readonly number[], opts: { stores?: boolean; unit?: Finish } = {}): Promise<Map<number, CardLite>> {
  const want = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 2000), out = new Map<number, CardLite>();
  if (!want.length) return out;
  const c = await planeSource(), [sets, list] = await Promise.all([setsView(c), bucketList(c.src, c.ptr)]);
  const known = list ? want.filter((id) => list.cat.has(cardBucket(id))) : want, stores = opts.stores !== false;
  if (new Set(known.map(cardBucket)).size <= FANIN_MAX_BUCKETS) { await fanIn(c, sets, known, { stores, unit: opts.unit }, out); return out; }
  const ix = await getBrowseIndex({ withStores: stores, withOracle: false });
  for (const [id, card] of ix.lookup(known, opts.unit)) out.set(id, card);
  const missing = known.filter((id) => !out.has(id));
  if (missing.length && new Set(missing.map(cardBucket)).size <= FANIN_MAX_BUCKETS) await fanIn(c, sets, missing, { stores, unit: opts.unit }, out);
  return out;
}
/** <= 500 ids + 500 slugs; never throws on a miss (a failing host still throws: the route answers 503). */
export async function getCardLookup(q: { ids?: readonly number[]; slugs?: readonly string[] }): Promise<CardLookup> {
  const c = await planeSource(), slugs = [...new Set((q.slugs ?? []).map((s) => String(s)).filter(Boolean))].slice(0, 500), ids = new Set((q.ids ?? []).slice(0, 500));
  const shards = new Map<string, string[]>(); for (const s of slugs) (shards.get(slugPath(s)) ?? shards.set(slugPath(s), []).get(slugPath(s))!).push(s);
  await Promise.all([...shards].map(async ([rel, want]) => {
    const f = await optionalOf<SlugShard>(c.src, rel); if (!f) return;
    const have = new Map(f.s); for (const s of want) { const id = have.get(s); if (id !== undefined) ids.add(id); }
  }));
  const [byId, sets] = await Promise.all([getCardsByIds([...ids]), setsView(c)]);
  return { byId, bySlug: new Map([...byId.values()].map((x) => [x.slug, x] as const)), setById: sets.byId };
}

// ── the card page ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The other products of the card's Scryfall printing. A card with no family (`rootId` 0) costs nothing. Otherwise the candidates are the rows of its own bucket, the root, and the products the set + number shard lists for the printing (a Foil Etched twin sits in another
 *  TCGplayer group, so another bucket: Counterspell 238617 and its etched product 240803 are 8 buckets apart); only the buckets that hold a candidate are read. Symmetric: from the root, from the twin and from a sibling the same members are found. */
async function familyOfCard(c: Ctx, cat: CatRow, home: BucketRows, list: BucketList | null, setTok: string): Promise<FamilyMember[]> {
  if (!cat[16]) return [];
  const want = new Set<number>([cat[16]]), code = cat[5] || setTok, key = nkey(cat[6] || null);
  if (code && key) { const f = await optionalOf<ScShard>(c.src, scPath(code)); for (const id of f?.s[code]?.[key] ?? []) want.add(id); }
  want.delete(cat[0]);
  const rows = new Map<number, { cat: CatRow; px: PxRow | undefined }>(); for (const r of home.catRows) rows.set(r[0], { cat: r, px: home.px.get(r[0]) });
  await Promise.all([...new Set([...want].filter((id) => !home.cat.has(id)).map(cardBucket))].map(async (b) => { const far = await readBucket(c.src, b, list, false); for (const r of far.catRows) rows.set(r[0], { cat: r, px: far.px.get(r[0]) }); }));
  return familyMembers(cat, [...rows.values()].map((r) => r.cat), (id) => rows.get(id)?.px);
}
/** P slug/<h> -> cat/<b>, px/<b> (+ un/<b>, of/<b> when the mask says tracked) + or/<n> + meta/sets + ss/runs: 6 to 8 files, 139 KB median cold. null for an unknown slug; a miss is never cached. Works for unlisted rows.
 *  Rounds after the pointer: slug + sets + runs + bucket list, then cat + px, then un + of + oracle + Scryfall sets (+ the family when the card has one). */
export async function getCardDetail(slug: string): Promise<CardDetail | null> {
  const s = String(slug ?? "").trim(); if (!s || s.length > 200) return null;
  const c = await planeSource(), { src, ptr } = c;
  const [shard, sets, runs, list] = await Promise.all([optionalOf<SlugShard>(src, slugPath(s)), setsView(c), optionalOf<StoreRunsFile>(src, "ss/runs.json"), bucketList(src, ptr)]);
  const id = shard?.s.find((e) => e[0] === s)?.[1]; if (id === undefined) return null;
  const b = cardBucket(id), home = await readBucket(src, b, list, false), cat = home.cat.get(id); if (!cat) return null;
  const px = home.px.get(id), mask = px?.[5] ?? 0, tracked = (mask & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)) !== 0 && (!list || list.tracked.has(b));
  const set = sets.byId.get(cat[4]); if (!set) throw new PlaneError("meta/sets.json", "parse", `set ${cat[4]} of card ${id} is not in the set list`);
  const [unf, off, orf, scry, family] = await Promise.all([
    tracked ? optionalOf<UnFile>(src, bucketPath("un", b)) : null, tracked ? optionalOf<OfferFile>(src, bucketPath("of", b)) : null,
    cat[14] ? optionalOf<OracleShard>(src, `or/${oracleShard(cat[14])}.json`) : null, cat[5] ? scryView(c) : null, familyOfCard(c, cat, home, list, set.tok),
  ]);
  const oracle = orf?.o.find((r) => r[0] === cat[14]) ?? null;
  const unIdx = unf ? indexById(unf, unf.u) : new Map<number, UnRow>(), un = [unIdx.get(id * 2), unIdx.get(id * 2 + 1)].filter((u): u is UnRow => u !== undefined);
  return detailFromPlane({ cat, px, un, of: off?.o ?? [], set, origin: scry ? (scry[cat[5]] ?? null) : null, oracle, family, runs, pricesAt: ptr.publishedAt });
}

// ── oracles ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function oracleRows(src: PlaneSource, nos: readonly number[]): Promise<Map<number, OracleDetail>> {
  const by = new Map<string, number[]>(); for (const no of new Set(nos)) (by.get(oracleShard(no)) ?? by.set(oracleShard(no), []).get(oracleShard(no))!).push(no);
  const out = new Map<number, OracleDetail>();
  await Promise.all([...by].map(async ([h, want]) => {
    const f = await optionalOf<OracleShard>(src, `or/${h}.json`); if (!f) return;
    const idx = indexById(f, f.o); for (const no of want) { const r = idx.get(no); if (r) out.set(no, oracleFromRow(r)); }
  }));
  return out;
}
/** P slug/<h> (oracle part) -> or/<no % 512>; about 0.5 KB */
export async function getOracleBySlug(slug: string): Promise<OracleDetail | null> {
  const s = String(slug ?? "").trim(); if (!s || s.length > 200) return null;
  const { src } = await planeSource(), shard = await optionalOf<SlugShard>(src, slugPath(s)), no = shard?.o.find((e) => e[0] === s)?.[1];
  return no === undefined ? null : ((await oracleRows(src, [no])).get(no) ?? null);
}
/** M engine: cls 0 and LISTED, marketUsd desc, nulls last. The page is the engine's `per` rows of printing `page`. */
export async function getOraclePrintings(oracleNo: number, page = 1, per: 24 | 48 = 24): Promise<{ total: number; items: CardMini[] }> {
  if (!Number.isInteger(oracleNo) || oracleNo <= 0) return { total: 0, items: [] };
  const r = (await getBrowseIndex({ withOracle: false })).query(canonicalQuery({ oracleNo, sort: "value", page, per }));
  return { total: r.total, items: r.items.map(miniOf) };
}
/** P st/<setId>.json (every chunk of the board); n <= 12. The dearest listed class-0 cards of the set by the market of their headline unit. */
export async function getSetHighlights(setId: number, n = 12): Promise<CardMini[]> {
  const c = await planeSource(), set = (await setsView(c)).byId.get(setId); if (!set) return [];
  const first = await optionalOf<BoardFile>(c.src, boardPath(setId)); if (!first) return [];
  const more = await Promise.all(Array.from({ length: Math.max(0, Math.min(first.chunks, 8) - 1) }, (_, k) => optionalOf<BoardFile>(c.src, boardPath(setId, k + 1))));
  const mkt = (r: BoardFile["c"][number]): number => ((r[14] & PRICE_MASK.HEADF) !== 0 ? r[11] : r[10]) ?? -1;
  return [first, ...more].flatMap((f) => f?.c ?? []).filter((r) => r[5] === 0 && (r[14] & PRICE_MASK.LISTED) !== 0).sort((a, b) => mkt(b) - mkt(a) || a[0] - b[0]).slice(0, Number.isFinite(n) ? Math.max(1, Math.min(12, Math.floor(n))) : 12).map((r) => miniFromBoard(r, set));
}

// ── names, set + number, existence ───────────────────────────────────────────────────────────────────────────────────────────
/** The keys one name chunk answers: STRONG = the folded full name; WEAK = the front face, each face and the reskin name (a key two oracles share is dropped: an ambiguous name is skipped, never guessed). */
interface NameKeys { strong: Map<string, number>; weak: Map<string, number> }
const nameKeysMemo = new WeakMap<NameFile, NameKeys>();
function nameKeysOf(f: NameFile): NameKeys {
  let k = nameKeysMemo.get(f); if (k) return k;
  const strong = new Map<string, number>(), weak = new Map<string, number>();
  for (const r of f.r) {
    const full = fold(r[1]); if (full && !strong.has(full)) strong.set(full, r[0]);
    for (const w of [...r[1].split(" // "), r[6] || ""]) { const key = fold(w); if (!key || key === full) continue; const had = weak.get(key); weak.set(key, had === undefined || had === r[0] ? r[0] : -1); }
  }
  nameKeysMemo.set(f, (k = { strong, weak })); return k;
}
/** P nm/<k> (the hot chunk first), <= 300 keys. A key is a folded name (constants.fold); the full name wins, a face or reskin name resolves only when exactly one oracle carries it. The map is keyed by the folded key. */
export async function resolveOracles(nameKeys: readonly string[]): Promise<Map<string, OracleMini>> {
  const keys = [...new Set(nameKeys.map((k) => fold(k)).filter(Boolean))].slice(0, 300), out = new Map<string, OracleMini>();
  if (!keys.length) return out;
  const { src } = await planeSource(), found = new Map<string, number>(), weak = new Map<string, number>(), chunks: NameKeys[] = [];
  for (let n = 0; found.size < keys.length; n++) {
    const f = await optionalOf<NameFile>(src, nameChunkPath(n)); if (!f) break;
    const k = nameKeysOf(f); chunks.push(k);
    for (const key of keys) { if (found.has(key)) continue; const no = k.strong.get(key); if (no !== undefined) found.set(key, no); }
  }
  for (const key of keys) {
    if (found.has(key)) continue;
    for (const k of chunks) { const no = k.weak.get(key); if (no === undefined) continue; const had = weak.get(key); weak.set(key, had === undefined || had === no ? no : -1); }
  }
  for (const [key, no] of weak) if (no > 0) found.set(key, no);
  const oracles = await oracleRows(src, [...found.values()]);
  for (const [key, no] of found) { const o = oracles.get(no); if (o) out.set(key, oracleMiniOf(o)); }
  return out;
}
/** P sc/<h> then cat/px; key "<sc>|<nkey>"; 1 to 3 cards per pair. `set` is a Scryfall set code (or the set token of an unjoined card), any case; `number` is a printed collector number (nkey: leading zeros, the "/281" total and trailing stars are not identity). */
export async function resolveBySetNumber(pairs: readonly { set: string; number: string }[]): Promise<Map<string, CardLite[]>> {
  const want = new Map<string, { code: string; nk: string }>();
  for (const p of pairs) { const code = String(p.set ?? "").trim().toLowerCase(), nk = nkey(p.number); if (code && nk) want.set(`${code}|${nk}`, { code, nk }); }
  const out = new Map<string, CardLite[]>(); if (!want.size) return out;
  const { src } = await planeSource(), by = new Map<string, { key: string; code: string; nk: string }[]>();
  for (const [key, w] of want) (by.get(scPath(w.code)) ?? by.set(scPath(w.code), []).get(scPath(w.code))!).push({ key, ...w });
  const ids = new Map<string, number[]>();
  await Promise.all([...by].map(async ([rel, list]) => {
    const f = await optionalOf<ScShard>(src, rel); if (!f) return;
    for (const w of list) { const got = f.s[w.code]?.[w.nk]; if (got?.length) ids.set(w.key, got.slice(0, 3)); }
  }));
  const cards = await getCardsByIds([...ids.values()].flat());
  for (const [key, list] of ids) { const rows = list.map((id) => cards.get(id)).filter((x): x is CardLite => !!x); if (rows.length) out.set(key, rows); }
  return out;
}
/** P cat/<b> for the buckets meta/buckets.json lists (an unknown id costs no request): user-state validation, replaces a foreign key. A product that left the catalogue keeps its row (GONE), so a stored id keeps resolving. */
export async function cardExists(ids: readonly number[]): Promise<Set<number>> {
  const want = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))], out = new Set<number>(); if (!want.length) return out;
  const { src, ptr } = await planeSource(), list = await bucketList(src, ptr), by = new Map<number, number[]>();
  for (const id of want) { const b = cardBucket(id); if (list && !list.cat.has(b)) continue; (by.get(b) ?? by.set(b, []).get(b)!).push(id); }
  await Promise.all([...by].map(async ([b, bids]) => { const f = await optionalOf<CatFile>(src, bucketPath("cat", b)); if (!f) return; const idx = indexById(f, f.c); for (const id of bids) if (idx.has(id)) out.add(id); }));
  return out;
}
/** P sl/list-<k>. Every sealed row counts, GONE ones too (a watch on a retired product keeps resolving). */
export async function sealedExists(ids: readonly number[]): Promise<Set<number>> {
  const want = new Set(ids.filter((n) => Number.isInteger(n) && n > 0)), out = new Set<number>(); if (!want.size) return out;
  const { src } = await planeSource(), first = await optionalOf<SealedListFile>(src, sealedListPath(0)); if (!first) return out;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.min(first.chunks, sealedChunkMax) - 1) }, (_, k) => optionalOf<SealedListFile>(src, sealedListPath(k + 1))));
  for (const f of [first, ...rest]) for (const r of f?.s ?? []) if (want.has(r[0])) out.add(r[0]);
  return out;
}

// ── the browse index (M) and the transition shim ────────────────────────────────────────────────────────────────────────────
/** Server-only: the typed-array engine, one per instance and ref (M). The replacement for every "scan cat.cards" caller. Resolve it BEFORE a closure that an unstable_cache wraps. Both column groups are loaded by default (ix/s and ix/o together are 2.7 MB of the 13.2);
 *  pass false to skip one. An index of this ref that already holds more serves a request for less. A build that fails is not remembered. */
export async function getBrowseIndex(o: { withStores?: boolean; withOracle?: boolean } = {}): Promise<BrowseIndex> {
  const withStores = o.withStores !== false, withOracle = o.withOracle !== false, c = await planeSource(), name = (s: boolean, r: boolean): string => `ix:${s}:${r}`;
  for (const [s, r] of [[withStores, withOracle], [true, true], [withStores, true], [true, withOracle]] as const) { const hit = peekByRef<BrowseIndex>(name(s, r), memoKey(c.ptr)); if (hit) return hit; }
  return memoByRef(name(withStores, withOracle), memoKey(c.ptr), async () => BrowseIndex.load(c.src, (await setsView(c)).list, { withStores, withOracle }));
}
let shimWarned = false; let shimMemo: { ref: string; at: number; v: Promise<Catalog> } | null = null;
/** @deprecated TRANSITION SHIM (src/lib/data/catalog-shim.ts): every LISTED class-0 row from the browse index, 5-minute memo, one console.warn per process, REFUSES in a production deployment. Deleted at M3 (ratchet: tests/no-get-catalog.test.ts). */
export async function getCatalog(): Promise<Catalog> {
  if (!shimAllowed()) throw new CatalogShimError();
  const c = await planeSource();
  if (shimMemo && shimMemo.ref === memoKey(c.ptr) && Date.now() - shimMemo.at < SHIM_MEMO_MS) return shimMemo.v;
  if (!shimWarned) { shimWarned = true; console.warn("getCatalog() is a transition shim (contract 7.9): it holds every listed card in memory and is deleted at M3; use getCardPage, getCardsByIds, getCardLookup or getSetIndex"); }
  const v = Promise.all([getBrowseIndex({ withOracle: false }), setsView(c)]).then(([ix, sets]) => buildCatalog(ix, sets.list, c.ptr.publishedAt));
  const entry = { ref: memoKey(c.ptr), at: Date.now(), v }; shimMemo = entry; v.catch(() => { if (shimMemo === entry) shimMemo = null; });
  return v;
}
