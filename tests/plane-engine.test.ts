// The browse engine and the hydrator (critique 5: market-only rankings; section 7.7). Owner WP02. The engine runs over the small deterministic tree of tests/helpers/plane-tree.ts and, with PLANE_SAMPLE_DIR, over the real 98,991-row index.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PRICE_MASK } from "../src/lib/constants";
import { BrowseIndex } from "../src/lib/data/plane/browse-index";
import { liteFromRow, rowFromPlane } from "../src/lib/data/lite";
import { PlaneError, type PlaneSource } from "../src/lib/data/plane/source";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { CardQuery, SetLite } from "../src/lib/data/types";
import type { CatFile, PxFile, SetsFile, UnFile } from "../src/lib/data/plane/formats";
import { miniCards, miniFull } from "./helpers/plane-tree";

const src = (t: TreeView): PlaneSource => ({ text: async (r) => { if (!t.has(r)) throw new PlaneError(r, "missing"); return t.read(r); }, json: async <T,>(r: string) => JSON.parse(await src(t).text(r)) as T });
const setsOf = (t: TreeView): SetLite[] => (JSON.parse(t.read("meta/sets.json")) as SetsFile).sets.map((s) => ({ id: s[0], slug: s[1], tok: s[2], code: s[3], name: s[4], tcgName: s[4], kind: s[6] as never, releasedOn: s[7] || null, bucket: false, cardCount: s[10], trackedCount: s[11], sealedCount: s[12] }));
const Q = (o: Partial<CardQuery>): CardQuery => ({ sort: "value", page: 1, per: 100, ...o });

test("a low-only listing (449401: $203,067.70) NEVER tops sort: value; it is shown with its value and flagged lowOnly", async () => {
  const t = miniFull({ day: 1 }); const ix = await BrowseIndex.load(src(t), setsOf(t), { withOracle: true });
  const low = miniCards({ day: 1 }).filter((c) => c.mN == null && c.lN === 20_306_770); assert.ok(low.length > 5, "the fixture has low-only rows");
  const top = ix.query(Q({ per: 100 })).items; assert.ok(top.length === 100 && top.every((x) => !x.lowOnly && x.marketUsd != null), "no low-only row among the dearest 100");
  const all: ReturnType<BrowseIndex["liteAt"]>[] = []; for (let p = 1; p <= 7; p++) all.push(...ix.query(Q({ page: p })).items);
  const lo = all.filter((x) => x.lowOnly); assert.equal(lo.length, low.length); for (const x of lo) { assert.equal(x.marketUsd, null); assert.equal(x.valueUsd, 20_306_770); assert.equal(all.indexOf(x) >= all.length - low.length - 150, true, "low-only rows sort with the unpriced, never with the dear"); }
  assert.equal(ix.query(Q({ minCents: 1000 })).total, miniCards({ day: 1 }).filter((c) => (c.mask & PRICE_MASK.HEADF ? c.mF : c.mN) != null && ((c.mask & PRICE_MASK.HEADF ? c.mF : c.mN) as number) >= 1000).length, "a price range matches the market only");
  assert.equal(ix.query(Q({ minCents: 1_000_000 })).total, 0, "a $203k low-only unit matches no range");
});
test("50 random queries equal a brute-force oracle over the same rows (filters, unit view, tracked, every sort, paging)", async () => {
  const t = miniFull({ day: 2 }); const ix = await BrowseIndex.load(src(t), setsOf(t)); const cards = miniCards({ day: 2 }); let s = 99; const rnd = (n: number) => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s % n);
  const mk = (c: (typeof cards)[number], f?: "N" | "F") => ((f ?? (c.mask & PRICE_MASK.HEADF ? "F" : "N")) === "N" ? c.mN : c.mF);
  for (let i = 0; i < 50; i++) {
    const q: CardQuery = { sort: (["value", "price-asc", "name", "number", "newest"] as const)[rnd(5)]!, page: 1 + rnd(2), per: ([24, 48] as const)[rnd(2)]!, setIds: rnd(3) === 0 ? [100 + rnd(3)] : undefined, rarities: rnd(3) === 0 ? ["R", "M"] : undefined, finish: rnd(4) === 0 ? "F" : undefined, tracked: rnd(4) === 0 ? true : undefined, minCents: rnd(3) === 0 ? 200 : undefined, maxCents: rnd(4) === 0 ? 600 : undefined };
    let want = cards.filter((c) => (!q.setIds || q.setIds.includes(c.set)) && (!q.rarities || q.rarities.includes(c.rar as never)));
    if (q.finish) want = want.filter((c) => (q.finish === "N" ? c.mask & PRICE_MASK.HASN : c.mask & PRICE_MASK.HASF)); if (q.tracked) want = want.filter((c) => c.mask & (q.finish === "F" ? PRICE_MASK.TRACKF : q.finish === "N" ? PRICE_MASK.TRACKN : PRICE_MASK.TRACKN | PRICE_MASK.TRACKF));
    if (q.minCents != null) want = want.filter((c) => (mk(c, q.finish) ?? -1) >= q.minCents!); if (q.maxCents != null) want = want.filter((c) => { const v = mk(c, q.finish); return v != null && v <= q.maxCents!; });
    const val = (c: (typeof cards)[number]) => mk(c, q.finish) ?? -1;
    const cmp: Record<string, (a: (typeof cards)[number], b: (typeof cards)[number]) => number> = { value: (a, b) => val(b) - val(a) || a.id - b.id, "price-asc": (a, b) => (val(a) < 0 ? 1e12 : val(a)) - (val(b) < 0 ? 1e12 : val(b)) || a.id - b.id, name: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id), number: (a, b) => (a.id % 400) - (b.id % 400) || a.id - b.id, newest: (a, b) => a.id - b.id };
    want.sort(cmp[q.sort]!); const page = ix.query(q); assert.equal(page.total, want.length, `query ${i} total`);
    if (q.sort !== "newest") assert.deepEqual(page.items.map((x) => x.id), want.slice((q.page - 1) * q.per, q.page * q.per).map((c) => c.id), `query ${i} ${JSON.stringify(q)}`);
  }
});
test("the unit view shows THAT finish everywhere; the headline is Normal first; lookup agrees with the page", async () => {
  const t = miniFull({ day: 1 }); const ix = await BrowseIndex.load(src(t), setsOf(t)); const both = miniCards({ day: 1 }).find((c) => c.mN != null && c.mF != null)!;
  const n = ix.query(Q({ finish: "N", setIds: [both.set], minCents: both.mN!, maxCents: both.mN! })).items.find((x) => x.id === both.id)!, f = ix.query(Q({ finish: "F", setIds: [both.set], minCents: both.mF!, maxCents: both.mF! })).items.find((x) => x.id === both.id)!;
  assert.equal(n.headFinish, "N"); assert.equal(n.marketUsd, both.mN); assert.equal(f.headFinish, "F"); assert.equal(f.marketUsd, both.mF); assert.equal(ix.lookup([both.id]).get(both.id)!.headFinish, "N", "Normal-first headline");
  const fo = miniCards({ day: 1 }).find((c) => c.mask & PRICE_MASK.HEADF)!; assert.equal(ix.lookup([fo.id]).get(fo.id)!.headFinish, "F", "a foil-only row heads with Foil"); assert.equal(ix.lookup([1, 2, 3]).size, 0, "unknown ids are absent");
});
test("a list tile (index row) and a card page (bucket rows) agree to the cent", async () => {
  const t = miniFull({ day: 1 }); const ix = await BrowseIndex.load(src(t), setsOf(t)); const sets = setsOf(t); let checked = 0;
  for (const c of miniCards({ day: 1 }).filter((x) => x.mask & PRICE_MASK.TRACKN).slice(0, 40)) {
    const b = Math.floor(c.id / 256), d = `${Math.floor(b / 64)}/${b}.json`; const cat = (JSON.parse(t.read(`cat/${d}`)) as CatFile).c.find((r) => r[0] === c.id)!, px = (JSON.parse(t.read(`px/${d}`)) as PxFile).p.find((r) => r[0] === c.id)!, un = (JSON.parse(t.read(`un/${d}`)) as UnFile).u;
    const page = liteFromRow(rowFromPlane(cat, px, sets.find((s) => s.id === c.set)!.tok, un, "N")), tile = ix.liteAt(ix.lookup([c.id]).size ? [...Array(ix.n).keys()].find((i) => ix.id[i] === c.id)! : 0, "N");
    for (const k of ["id", "slug", "name", "marketUsd", "valueUsd", "lowOnly", "headFinish", "tracked", "listed", "thin", "oracleNo", "colorMask", "mv", "ptype", "rarity", "setCode", "change7d", "change30d", "low", "stores"] as const) assert.deepEqual(tile[k], page[k], `${c.id}.${k}`);
    checked++;
  }
  assert.ok(checked >= 30);
});
test("liteFromRow: MARKET only in marketUsd, the displayed value separate; THIN and the OP-compatible aliases are derived", () => {
  const base = { id: 1, slug: "a", name: "A", alt: null, setId: 1, sc: "mh3", number: "6", rarity: "R", cls: 0, treat: "borderless showcase", label: null, flags: 1, oracleNo: 5, scryId: null, colors: 3, mv: 2.5, ptype: 0, setTok: "mh3", marketN: null, marketF: null, lowN: 20_306_770, lowF: null, mask: PRICE_MASK.LISTED | PRICE_MASK.HASN | PRICE_MASK.LOWN | PRICE_MASK.THIN, shown: "N" as const, low: null, stores: null, change7d: null, change30d: null, high90: null };
  const l = liteFromRow(base); assert.equal(l.marketUsd, null); assert.equal(l.valueUsd, 20_306_770); assert.equal(l.lowOnly, true); assert.equal(l.thin, true); assert.equal(l.setCode, "MH3"); assert.deepEqual(l.treat, ["borderless", "showcase"]); assert.equal(l.cost, 3); assert.equal(l.cardType, "Creature"); assert.deepEqual(l.colors, ["White", "Blue"]);
  const m = liteFromRow({ ...base, marketN: 500, lowN: 450, mask: PRICE_MASK.LISTED | PRICE_MASK.HASN }); assert.equal(m.marketUsd, 500); assert.equal(m.valueUsd, 500); assert.equal(m.lowOnly, false); assert.equal(m.thin, false);
  assert.equal(liteFromRow({ ...base, marketN: null, lowN: null, oracleNo: null }).valueUsd, null); assert.equal(liteFromRow({ ...base, oracleNo: null }).cost, null);
});
const SAMPLE = process.env.PLANE_SAMPLE_DIR;
test("REAL INDEX (PLANE_SAMPLE_DIR): 98,991 rows load, the default list's top 100 contain no low-only listing, queries take milliseconds", { skip: !SAMPLE || !fs.existsSync(`${SAMPLE}/ix/dict.json`) }, async () => {
  const t = fsTree(SAMPLE!); const t0 = performance.now(); const ix = await BrowseIndex.load(src(t), setsOf(t), { withOracle: true }); const load = performance.now() - t0;
  assert.ok(ix.n > 90_000); const q0 = performance.now(); const page = ix.query(Q({ per: 100 })); const qms = performance.now() - q0;
  assert.ok(page.items.every((x) => !x.lowOnly && x.marketUsd != null), "no low-only row in the top 100 by value"); assert.equal(page.items[0]!.id !== 449401, true, "449401 (a $203,067.70 single listing) is not first");
  console.log(`real index: ${ix.n} rows, ${ix.stats.files} files, ${(ix.stats.bytes / 1e6).toFixed(1)} MB, load ${load.toFixed(0)} ms, first value query ${qms.toFixed(1)} ms, top: ${page.items[0]!.name} ${page.items[0]!.marketUsd}`);
  const lowTop = ix.query(Q({ per: 100, minCents: 5_000_000 })); assert.ok(lowTop.items.every((x) => x.marketUsd != null && x.marketUsd >= 5_000_000), "a range filter matches market only");
});

// ══ the rest of CardQuery over the 57 real products of Annex A (realMiniTree): treatments, keywords, formats, hidden set kinds ═══════════════════════════════════════════════════════════════════════════════════════
import { FORMAT_INDEX, TREATMENT_KEYS } from "../src/lib/constants";
import { realMiniTree } from "./helpers/data-source";
import { memTree } from "../src/lib/data/plane/tree";
import type { IxDict, IxK, IxO, IxOdict } from "../src/lib/data/plane/formats";

const treatOf = (slug: string): string => [["borderless", "borderless"], ["showcase", "showcase"], ["retro-frame", "retro"], ["serial-numbered", "serial"], ["foil-etched", "etched"], ["extended-art", "extended"]].filter(([w]) => slug.includes(w!)).map(([, k]) => k!).filter((k) => TREATMENT_KEYS.includes(k as never)).join(" ");
/** The real tree with the treatment words of each slug in the index (dict.tr), two real keywords and the Modern/Legacy/Commander legality of four real oracles (the fixture carries neither; set here, stated in the test). */
function treated(): { tree: ReturnType<typeof memTree>; ids: Map<string, number> } {
  const src0 = realMiniTree(), t = memTree(src0.files().map((f) => [f, src0.read(f)] as [string, string]));
  const dict = JSON.parse(t.read("ix/dict.json")) as IxDict, k = JSON.parse(t.read("ix/k-0.json")) as IxK, words = [...new Set(k.slug.map(treatOf))]; dict.tr = words; k.tr = k.slug.map((s) => words.indexOf(treatOf(s)));
  t.write("ix/dict.json", JSON.stringify(dict)); t.write("ix/k-0.json", JSON.stringify(k));
  const od = JSON.parse(t.read("ix/odict.json")) as IxOdict, o = JSON.parse(t.read("ix/o-0.json")) as IxO, legalOf = (...f: string[]): string => Array.from({ length: 22 }, (_, i) => (f.some((x) => FORMAT_INDEX[x as never] === i) ? "L" : "N")).join("");
  const nameOf = (id: number): number => k.or[k.id.indexOf(id)]!; od.keywords = ["", "flying", "flash flying"]; od.legal = ["", legalOf("modern", "legacy", "vintage", "commander"), legalOf("legacy", "vintage", "commander")];
  o.lg = o.lg.map(() => 0);                                                  // every other oracle: legality unknown
  for (const [id, kw, lg] of [[2831, 1, 1], [3077, 1, 2], [513650, 2, 1], [238617, 0, 1], [609611, 0, 1]] as const) { const r = o.no.indexOf(nameOf(id)); o.kw[r] = kw; o.lg[r] = lg; }
  t.write("ix/odict.json", JSON.stringify(od)); t.write("ix/o-0.json", JSON.stringify(o));
  return { tree: t, ids: new Map(k.slug.map((s, i) => [s, k.id[i]!] as const)) };
}
const realSets = (t: TreeView): SetLite[] => (JSON.parse(t.read("meta/sets.json")) as SetsFile).sets.map((s) => ({ id: s[0], slug: s[1], tok: s[2], code: s[3], name: s[4], tcgName: s[4], kind: s[6] as never, releasedOn: null, bucket: false, cardCount: 0, trackedCount: 0, sealedCount: 0 }));
const idsOf = (page: { items: { id: number }[] }): number[] => page.items.map((x) => x.id).sort((a, b) => a - b);

test("treatments: ANY of the named words, matched on the words of a row (borderless, serial, etched); an unknown word matches nothing", async () => {
  const { tree } = treated(), ix = await BrowseIndex.load(src(tree), realSets(tree), { withOracle: true }), k = JSON.parse(tree.read("ix/k-0.json")) as IxK;
  const want = (...w: string[]): number[] => k.id.filter((_, i) => treatOf(k.slug[i]!).split(" ").some((x) => w.includes(x))).sort((a, b) => a - b);
  assert.deepEqual(idsOf(ix.query(Q({ treats: ["borderless"], classes: [0, 1, 2, 3, 4] }))), want("borderless")); assert.ok(want("borderless").length >= 4);
  assert.deepEqual(idsOf(ix.query(Q({ treats: ["serial", "etched"], classes: [0, 1, 2, 3, 4] }))), want("serial", "etched")); assert.ok(want("serial", "etched").includes(541332), "Ezio Auditore da Firenze (Foil Etched)");
  assert.equal(ix.query(Q({ treats: ["gilded"], classes: [0, 1, 2, 3, 4] })).total, 0);
});
test("keywords and formats come from the oracle columns: a keyword is a whole token, a format filter is playable or not playable, a printing without an oracle never matches either", async () => {
  const { tree } = treated(), ix = await BrowseIndex.load(src(tree), realSets(tree), { withOracle: true });
  assert.deepEqual(idsOf(ix.query(Q({ keyword: "flying" }))), [2831, 3077, 513650, 560662], "Birds of Paradise (7th Edition and the Secret Lair African Swallow printing: one oracle), Shivan Dragon, Brazen Borrower"); assert.deepEqual(idsOf(ix.query(Q({ keyword: "flash" }))), [513650]); assert.equal(ix.query(Q({ keyword: "fly" })).total, 0, "a token, not a prefix");
  const modern = idsOf(ix.query(Q({ format: { key: "modern", playable: true } }))), legacyOnly = idsOf(ix.query(Q({ format: { key: "modern", playable: false } })));
  assert.deepEqual(modern, [2831, 238617, 513650, 560662, 609611], "the four oracles patched as Modern-legal (five printings)"); assert.ok(legacyOnly.includes(3077), "Shivan Dragon is not Modern-legal here"); assert.ok(!legacyOnly.includes(2831));
  assert.deepEqual(idsOf(ix.query(Q({ format: { key: "legacy", playable: true } }))), [2831, 3077, 238617, 513650, 560662, 609611]);
  const unjoined = ix.lookup([485192]).get(485192)!; assert.equal(unjoined.oracleNo, null, "Sword of _ and _ (Un-Known Event playtest) has no Scryfall oracle"); assert.ok(![...modern, ...legacyOnly].includes(485192), "a row with no oracle is neither playable nor not playable");
});
test("hidden set kinds (art-series, oversized) are out unless includeHidden is set or the query names the set; the oracle filters refuse an index loaded without oracle columns; rootId is not an index question", async () => {
  const { tree } = treated(), sets = realSets(tree), ix = await BrowseIndex.load(src(tree), sets, { withOracle: true }), all = [0, 1, 2, 3, 4];
  const art = 718476, oversize = 174434, artSet = sets.find((s) => s.kind === "art-series")!, overSet = sets.find((s) => s.kind === "oversized")!; assert.ok(artSet && overSet);
  const def = idsOf(ix.query(Q({ classes: all }))); assert.ok(!def.includes(art) && !def.includes(oversize), "Flickering Hound Art Card and Rukh Egg (Box Topper) are hidden by default");
  const withHidden = idsOf(ix.query(Q({ classes: all, includeHidden: true }))); assert.ok(withHidden.includes(art) && withHidden.includes(oversize)); assert.equal(withHidden.length, def.length + 2);
  assert.deepEqual(idsOf(ix.query(Q({ classes: all, setIds: [artSet.id] }))), [art], "naming the set is asking for it");
  const lean = await BrowseIndex.load(src(tree), sets, { withStores: false }); assert.equal(lean.hasOracle, false);
  for (const q of [{ keyword: "flying" }, { format: { key: "modern" as const, playable: true } }, { identity: { mask: 3 } }, { sort: "popular" as const }]) assert.throws(() => lean.query(Q(q)), /oracle columns/);
  assert.throws(() => ix.query(Q({ rootId: 5 })), /rootId/); assert.equal(lean.query(Q({ per: 24 })).items.length, 24 < lean.n ? 24 : lean.n);
  assert.equal(lean.liteAt(0).low.US, null, "withStores false: no store columns");
});
test("ix/s is a phase-2 family: a tree published before the first store stage loads with every store column at 'none'", async () => {
  const full = realMiniTree(), t = memTree(full.files().filter((f) => !f.startsWith("ix/s-")).map((f) => [f, full.read(f)] as [string, string]));
  const ix = await BrowseIndex.load(src(t), realSets(t), { withStores: true, withOracle: true }); assert.equal(ix.n, (JSON.parse(full.read("ix/dict.json")) as IxDict).rows); const bird = ix.lookup([2831]).get(2831)!; assert.equal(bird.marketUsd, 2289); assert.deepEqual([bird.low.US, bird.stores.US], [null, 0]);
  const withS = await BrowseIndex.load(src(full), realSets(full), { withStores: true }); assert.equal(withS.lookup([2831]).get(2831)!.low.US, 1749, "and with the file the TCGplayer low of a tracked unit is the US low");
});

test("the engine carries the store-only minimum beside the all-source low: the Deal Finder's buy side is never TCGplayer's own listing (and rowOf maps a product id to its row)", async () => {
  const t = miniFull({ day: 1 }), sets = setsOf(t), ix = await BrowseIndex.load(src(t), sets), cards = miniCards({ day: 1 }); let checked = 0;
  for (const c of cards.filter((x) => x.mask & PRICE_MASK.TRACKN).slice(0, 40)) {
    const row = ix.rowOf(c.id), m = c.mN ?? 100, at = row * 2 * 6; assert.ok(row >= 0, `${c.id} is a listed row`); assert.equal(ix.id[row], c.id);
    assert.equal(ix.low[at], Math.round(m * 0.9), "the all-source low (the US one includes TCGplayer's own)"); assert.equal(ix.smin[at], Math.round(m * 0.92), "the cheapest STORE listing: dearer than that low here, so the two cannot stand in for each other");
    assert.equal(ix.smin[at + 1], -1, "no AU listing: none"); checked++;
  }
  assert.ok(checked >= 30);
  const untracked = cards.find((c) => !(c.mask & (PRICE_MASK.TRACKN | PRICE_MASK.TRACKF)) && (c.mask & PRICE_MASK.LISTED))!, r2 = ix.rowOf(untracked.id); assert.deepEqual([...ix.smin.slice(r2 * 12, r2 * 12 + 12)], Array(12).fill(-1), "an untracked card has no store minimum");
  assert.equal(ix.rowOf(-5), -1); assert.equal(ix.rowOf(1), -1, "an id that is not a listed row");
  const lean = await BrowseIndex.load(src(t), sets, { withStores: false }); assert.ok(lean.smin.every((v) => v === -1), "withStores false: no store columns");
});
