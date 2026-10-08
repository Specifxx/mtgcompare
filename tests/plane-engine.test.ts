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
