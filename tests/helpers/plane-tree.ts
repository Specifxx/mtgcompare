// tests/helpers/plane-tree.ts (owner WP01a). A SMALL, CONSISTENT published tree for the plane tests: every family the validator, the reconciler, the engine and the publisher touch, generated deterministically from (day index, options).
// It is the fixture generator, not a model of the real catalogue: 700 cards in 3 sets, about a third tracked, prices that drift each day so the tracked set MOVES (units cross the $5 line), a few low-only rows, foil-only rows and THIN rows.
import { PRICE_MASK } from "../../src/lib/constants";
import type { CatRow, PxRow, UnRow } from "../../src/lib/data/plane/formats";
import { bucketPath, cardBucket, fnv1a32, hex2, hex3, histBucket, ixPath, oracleShard, scShard, sealedDetailPath, slugShard, tailBucket } from "../../src/lib/data/plane/shards";
import { encodeRuns, appendDay } from "../../src/lib/data/plane/history-codec";
import { memTree, type MutableTree } from "../../src/lib/data/plane/tree";
import { addDays } from "../../src/lib/history";

export interface MiniOpts { cards?: number; day: number /* index: day 0 is the cut day */; phase?: "catalog" | "full"; cut?: number /* YYYYMMDD of the cut; day 0 */; withIx?: boolean }
export const MINI_CUT = 20260101;
const hash = (n: number): number => fnv1a32(`m${n}`);
const j = (v: unknown): string => JSON.stringify(v);
export const dayOf = (idx: number): number => addDays(MINI_CUT, idx);
export const isoOf = (d: number): string => `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`;

export interface MiniCard { id: number; set: number; oracleNo: number; slug: string; name: string; rar: string; mN: number | null; mF: number | null; lN: number | null; lF: number | null; mask: number }
export function miniCards(o: MiniOpts): MiniCard[] {
  const n = o.cards ?? 700; const out: MiniCard[] = [];
  for (let k = 0; k < n; k++) {
    const id = 1000 + k * 3 + (k % 5 === 0 ? 1 : 0), h = hash(id), set = 100 + (k % 3), oracleNo = 1 + (k % Math.max(1, Math.floor(n / 2)));
    const base = 40 + (h % 700);                                            // 40..739 cents: the $5 tracking line (500) is crossed by drift
    const drift = (h & 1 ? 1 : -1) * 18 * [0, 1, 2, 1][o.day % 4]!;       // a triangle wave in the day, at most 25 cents a day: the tracked set MOVES every day (about 20 units leave, 20 enter) but never collapses
    const kind = k % 29 === 0 ? "lowonly" : k % 17 === 0 ? "foilonly" : k % 7 === 0 ? "both" : "normal";
    const price = Math.max(5, base + drift);
    const mN = kind === "lowonly" || kind === "foilonly" ? null : price, mF = kind === "both" || kind === "foilonly" ? Math.round(price * 1.6) : null;
    const lN = kind === "lowonly" ? 20_306_770 : mN != null ? Math.round(mN * 0.9) : null, lF = mF != null ? Math.round(mF * 0.9) : null;
    let mask = PRICE_MASK.LISTED;
    if (mN != null || lN != null) mask |= PRICE_MASK.HASN; if (mF != null) mask |= PRICE_MASK.HASF;
    if (mN == null && mF != null) mask |= PRICE_MASK.HEADF;
    if (mN != null && mN >= 500) mask |= PRICE_MASK.TRACKN; if (mF != null && mF >= 500) mask |= PRICE_MASK.TRACKF;
    if (kind === "lowonly") mask |= PRICE_MASK.LOWN;
    if ((mN ?? mF ?? 0) < 50) mask |= PRICE_MASK.THIN;
    out.push({ id, set, oracleNo, slug: `card-${id}-s${set}`, name: `Card ${id}`, rar: "CURM"[k % 4]!, mN, mF, lN, lF, mask });
  }
  return out;
}
const uidsOf = (cs: MiniCard[]): number[] => cs.flatMap((c) => [...(c.mask & PRICE_MASK.TRACKN ? [c.id * 2] : []), ...(c.mask & PRICE_MASK.TRACKF ? [c.id * 2 + 1] : [])]);

/** Everything except the store families (un, of, ix/s, ix/f, sl/d, ss), which only phase 2 writes. */
export function miniCatalog(o: MiniOpts): MutableTree {
  const t = memTree(); const cs = miniCards(o); const tracked = new Set(uidsOf(cs)); const dayNum = dayOf(o.day);
  const byBucket = new Map<number, MiniCard[]>(); for (const c of cs) (byBucket.get(cardBucket(c.id)) ?? byBucket.set(cardBucket(c.id), []).get(cardBucket(c.id))!).push(c);
  for (const [b, list] of byBucket) {
    t.write(bucketPath("cat", b), j({ v: 1, b, c: list.map((c): CatRow => [c.id, c.slug, c.name, 0, c.set, "tst", String(c.id % 400), 0, c.rar, 0, "", 0, 1, 1, c.oracleNo, 0, 0, 0, 1 << (c.id % 5), 2 + (c.id % 4), c.id % 3]) }));
    t.write(bucketPath("px", b), j({ v: 1, b, p: list.map((c): PxRow => { const r: PxRow = [c.id, c.mN, c.mF, c.lN, c.lF, c.mask]; if (c.mask & PRICE_MASK.TRACKN) r.push(1.5, -2.5, 900); return r; }) }));
  }
  const slugs = new Map<string, MiniCard[]>(); for (const c of cs) (slugs.get(slugShard(c.slug)) ?? slugs.set(slugShard(c.slug), []).get(slugShard(c.slug))!).push(c);
  // the sealed products' slugs go in `z` of the same shards (getSealedDetail resolves a sealed slug there; with z empty every sealed page of the fixture was a 404)
  const sealedSlugs = new Map<string, [string, number][]>(); for (const r of miniSealed(o, false)) { const slug = r[1] as string; (sealedSlugs.get(slugShard(slug)) ?? sealedSlugs.set(slugShard(slug), []).get(slugShard(slug))!).push([slug, r[0] as number]); }
  const bySlug = (a: [string, number], b: [string, number]): number => (a[0] < b[0] ? -1 : 1);
  for (let h = 0; h < 256; h++) { const list = slugs.get(hex2(h)), z = sealedSlugs.get(hex2(h)); if (list || z) t.write(`slug/${hex2(h)}.json`, j({ v: 1, h, s: (list ?? []).map((c): [string, number] => [c.slug, c.id]).sort(bySlug), o: [], z: (z ?? []).sort(bySlug) })); }
  const scMap: Record<string, Record<string, number[]>> = { tst: {} }; for (const c of cs) (scMap.tst![String(c.id % 400)] ??= []).push(c.id);
  t.write(`sc/${scShard("tst")}.json`, j({ v: 1, h: Number.parseInt(scShard("tst"), 16), s: scMap }));
  const orcl = new Map<number, unknown[][]>(); const maxO = Math.max(...cs.map((c) => c.oracleNo));
  for (let no = 1; no <= maxO; no++) (orcl.get(no % 512) ?? orcl.set(no % 512, []).get(no % 512)!).push([no, `00000000-0000-0000-0000-${String(no).padStart(12, "0")}`, `oracle-${no}`, `Oracle ${no}`, "{1}", 1, "Creature", 1, 1, "NNNNNNNNNNNNNNNNNNNNNN", no, 0, 0, 0, 0, `Text ${no}`, "", 0, 3]);
  for (const [s, rows] of orcl) t.write(`or/${hex3(s)}.json`, j({ v: 1, h: s, o: rows }));
  t.write("nm/0.json", j({ v: 1, n: 0, r: [...Array(maxO)].map((_, i) => [i + 1, `Oracle ${i + 1}`, `oracle-${i + 1}`, 0, 1, null, 0]) }));
  t.write("meta/sets.json", j({ v: 1, at: "x", sets: [100, 101, 102].map((id) => [id, `set-${id}`, `s${id}`, `S${id}`, `Set ${id}`, 0, "expansion", "2026-01-01", 0, "tst", cs.filter((c) => c.set === id).length, 0, 0]) }));
  t.write("meta/scrysets.json", j({ v: 1, sets: [["tst", "Test", "expansion", 0, 0]] }));
  for (const sid of [100, 101, 102]) t.write(`st/${sid}.json`, j({ v: 1, set: sid, at: "x", n: cs.filter((c) => c.set === sid).length, chunk: 0, chunks: 1, c: cs.filter((c) => c.set === sid).map((c) => [c.id, c.slug, c.name, "1", c.rar, 0, "", 0, 0, "tst", c.mN, c.mF, c.lN, c.lF, c.mask, 0, 0, null]) }));
  t.write("sl/list-0.json", j({ v: 1, at: "x", chunk: 0, chunks: 1, s: miniSealed(o, false) }));
  // browse index: LISTED rows sorted by id
  const listed = cs.filter((c) => c.mask & PRICE_MASK.LISTED).sort((a, b) => a.id - b.id);
  t.write("ix/dict.json", j({ v: 1, chunk: 8192, rows: listed.length, sc: ["", "tst"], tr: [""], lb: [""] }));
  t.write(ixPath("k", 0), j({ v: 1, n: listed.length, id: listed.map((c) => c.id), slug: listed.map((c) => c.slug), name: listed.map((c) => c.name), set: listed.map((c) => c.set), sc: listed.map(() => 1), num: listed.map((c) => String(c.id % 400)), ns: listed.map((c) => c.id % 400), rar: listed.map((c) => c.rar).join(""), cls: "0".repeat(listed.length), tr: listed.map(() => 0), lb: listed.map(() => 0), fl: listed.map(() => 1), or: listed.map((c) => c.oracleNo), co: listed.map((c) => 1 << (c.id % 5)), mv: listed.map((c) => 2 + (c.id % 4)), pt: listed.map((c) => c.id % 3).join(""), alt: {}, sid: {} }));
  t.write(ixPath("p", 0), j({ v: 1, n: listed.length, mn: listed.map((c) => c.mN ?? -1), mf: listed.map((c) => c.mF ?? -1), ln: listed.map((c) => c.lN ?? -1), lf: listed.map((c) => c.lF ?? -1), mk: listed.map((c) => c.mask), t: listed.flatMap((c, r) => [...(c.mask & PRICE_MASK.TRACKN ? [[r, 0, 15, -25]] : []), ...(c.mask & PRICE_MASK.TRACKF ? [[r, 1, 20, -10]] : [])]) }));
  t.write("ix/odict.json", j({ v: 1, legal: ["", "NNNNNNNNNNNNNNNNNNNNNN"], keywords: [""] }));
  t.write("ix/o-0.json", j({ v: 1, n: maxO, no: [...Array(maxO)].map((_, i) => i + 1), co: [...Array(maxO)].map(() => 1), idn: [...Array(maxO)].map(() => 1), lg: [...Array(maxO)].map(() => 1), ed: [...Array(maxO)].map((_, i) => i + 1), fl: [...Array(maxO)].map(() => 0), kw: [...Array(maxO)].map(() => 0) }));
  // history: v4 base ending on the cut day (30 days), tail = the days after it, weekly closes
  const price = (c: MiniCard, fin: 0 | 1, d: number): number => Math.max(5, Math.round(((fin === 0 ? c.mN : c.mF) ?? 100) * (1 + 0.01 * ((d + c.id) % 5 - 2))));
  const baseF = new Map<number, Record<string, unknown>>(), tailF = new Map<number, Record<string, unknown>>();
  for (const u of tracked) { const id = Math.floor(u / 2), fin = (u % 2) as 0 | 1, c = cs.find((x) => x.id === id)!; const key = `${id}.${fin}`;
    (baseF.get(histBucket(id)) ?? baseF.set(histBucket(id), {}).get(histBucket(id))!)[key] = encodeRuns(addDays(MINI_CUT, -29), [...Array(30)].map((_, k) => price(c, fin, k - 29)));
    if (o.day > 0) { let s = undefined as ReturnType<typeof appendDay>["series"] | undefined; for (let d = 1; d <= o.day; d++) s = appendDay(s, addDays(MINI_CUT, d), price(c, fin, d)).series; (tailF.get(tailBucket(id)) ?? tailF.set(tailBucket(id), {}).get(tailBucket(id))!)[key] = s; } }
  for (const [b, p] of baseF) t.write(bucketPath("hist/p", b), j({ v: 4, p }));
  for (const [b, p] of tailF) t.write(bucketPath("hist/t", b), j({ v: 4, cut: MINI_CUT, p }));
  t.write("hist/index.json", j({ v: 1, days: [[isoOf(dayNum), 1000, 1_000_000, cs.length]] }));
  for (let s = 0; s < 8; s++) t.write(`hist/w/${s}.json`, j({ v: 1, end: isoOf(MINI_CUT), weeks: 18, k: [], c: [] }));
  // free views
  t.write("hm/home.json", j({ v: 1, at: "x", stats: { cards: cs.length, tracked: tracked.size, sets: 3, sealed: 0, oracles: maxO }, newest: [100], upcoming: [], chase: [], popular: [], up: [], down: [], dealCounts: [0, 0, 0, 0, 0, 0], dealsFree: [null, null, null, null, null, null] }));
  t.write("mk/overview.json", j({ v: 1, at: "x", basket: { n: 1, totalUsd: 1, avg: 1, median: 1 }, adv: 0, dec: 0, cons: [], sets: [] })); t.write("mk/records.json", j({ v: 1, at: "x", gaps: {}, highs: [], lows: [] }));
  for (const d of ["up", "down"]) for (const w of [7, 30]) for (const v of ["a", "n", "f"]) t.write(`mv/${d}-${w}-${v}.json`, j({ v: 1, at: "x", r: [] })); t.write("mv/recent.json", j({ v: 1, at: "x", r: [] }));
  t.write("sm/plan.json", j({ v: 1, sets: 1, sealed: 0, commanders: 0, names: 0, cards: 1, urls: { cards: cs.length } })); t.write("sm/cards-0.json", j(cs.map((c) => c.slug)));
  t.write("pv/demand.json", j({ v: 1, at: "x", days: 7, r: [[cs[0]!.id, 12]] })); t.write("pv/rising.json", j({ v: 1, at: "x", scopes: { GLOBAL: [{ id: cs[0]!.id, slug: cs[0]!.slug, name: cs[0]!.name, reason: "up" }] } }));
  // buckets.json is written by addStores / the caller (tracked = buckets with un files)
  t.write("meta/buckets.json", j({ v: 1, width: 256, cat: [...byBucket.keys()].sort((a, b) => a - b), tracked: [] }));
  return t;
}
/** Phase 2: the store families of the SAME day for every tracked unit (two offers each, stores 10 and 11, plus a feed store 8 on every fifth unit). */
export function addStores(t: MutableTree, o: MiniOpts): MutableTree {
  const cs = miniCards(o); const tracked = uidsOf(cs); const unB = new Map<number, UnRow[]>(), ofB = new Map<number, unknown[][]>();
  const flat = { uid: [] as number[], mk: "", st: [] as number[], pr: [] as number[] };
  const listed = cs.filter((c) => c.mask & PRICE_MASK.LISTED).sort((a, b) => a.id - b.id); const rowOf = new Map(listed.map((c, i) => [c.id, i] as const)); const sRows: number[][] = [];
  tracked.forEach((uid, k) => {
    const id = Math.floor(uid / 2), fin = uid % 2, c = cs.find((x) => x.id === id)!, m = (fin === 0 ? c.mN : c.mF) ?? 100, b = cardBucket(id);
    const row: UnRow = [uid, [Math.round(m * 0.9), null, null, null, null, null], [2, 0, 0, 0, 0, 0], [Math.round(m * 0.92), null, null, null, null, null]];
    (unB.get(b) ?? unB.set(b, []).get(b)!).push(row);
    const offers: unknown[][] = [[uid, 0, 10, Math.round(m * 0.92), 0, 1, `/p/${id}`], [uid, 0, 11, Math.round(m * 0.95), 1, 1, `/q/${id}`]]; if (k % 5 === 0) offers.push([uid, 0, 8, Math.round(m * 0.97), null, 1, `/f/${id}`]);
    (ofB.get(b) ?? ofB.set(b, []).get(b)!).push(...offers);
    for (const of of offers) { flat.uid.push(of[0] as number); flat.mk += String(of[1]); flat.st.push(of[2] as number); flat.pr.push(of[3] as number); }
    sRows.push([rowOf.get(id)!, fin, row[1][0] as number, -1, -1, -1, -1, -1, 2, 0, 0, 0, 0, 0, row[3][0] as number, -1, -1, -1, -1, -1]);
  });
  for (const [b, u] of unB) t.write(bucketPath("un", b), JSON.stringify({ v: 1, b, at: "x", u })); for (const [b, o2] of ofB) t.write(bucketPath("of", b), JSON.stringify({ v: 1, b, at: "x", o: o2 }));
  t.write(ixPath("s", 0), JSON.stringify({ v: 1, at: "x", u: sRows })); t.write(ixPath("f", 0), JSON.stringify({ v: 1, n: flat.uid.length, ...flat }));
  t.write("ss/runs.json", JSON.stringify({ v: 1, at: "x", r: [[10, 0, "x", 1, 100, 90, 80, 10, 5], [11, 0, "x", 1, 100, 90, 80, 10, 5]] }));
  t.write("sl/list-0.json", JSON.stringify({ v: 1, at: "x", chunk: 0, chunks: 1, s: miniSealed(o, true) }));
  // each product's detail row in ITS shard (sealedDetailPath): getSealedDetail reads exactly that file
  const det = new Map<string, unknown[][]>(); for (const p of [[900001, "sealed-900001", [[0, 10, 3500, null, 1, "/s/900001"], [0, 11, 3600, null, 1, "/t/900001"]], "36 packs; includes a promo"], [900002, "sealed-900002", [], 0]] as unknown[][]) (det.get(sealedDetailPath(p[1] as string)) ?? det.set(sealedDetailPath(p[1] as string), []).get(sealedDetailPath(p[1] as string))!).push(p);
  for (const [f, p] of det) t.write(f, JSON.stringify({ v: 1, h: Number.parseInt(f.replace(/^sl\/d\/|\.json$/g, ""), 16), p }));
  const b = JSON.parse(t.read("meta/buckets.json")); b.tracked = [...unB.keys()].sort((x, y) => x - y); t.write("meta/buckets.json", JSON.stringify(b));
  return t;
}
/** Five sealed products of set 100 and 101 (13 columns: section 2.9). `stores` true = the phase-2 form with per-market lows and store counts. Product 900003 is GONE (flag 2) and 900004 is a presale (flag 1). */
export function miniSealed(o: MiniOpts, stores: boolean): unknown[][] {
  return [900001, 900002, 900003, 900004, 900005].map((id, k) => {
    const market = 4000 + k * 1500 + (o.day % 3) * 20;
    return [id, `sealed-${id}`, `Sealed ${id}`, k < 3 ? 100 : 101, ["Booster Box", "Bundle", "Commander Deck", "Prerelease Kit", "Booster Pack"][k]!, k === 0 ? 36 : 0, isoOf(MINI_CUT), k === 2 ? 2 : k === 3 ? 1 : 0, market, Math.round(market * 0.9),
      stores && k !== 2 ? [Math.round(market * 0.88), null, null, null, null, null] : 0, stores && k !== 2 ? [2, 0, 0, 0, 0, 0] : 0, k === 4 ? null : 1.5 - k];
  });
}
export function miniFull(o: MiniOpts): MutableTree { return addStores(miniCatalog(o), o); }
export const trackedOf = (o: MiniOpts): Set<number> => new Set(uidsOf(miniCards(o)));
