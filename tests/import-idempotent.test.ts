// Publishing is idempotent (contract C18, Annex C check 15), owner WP01b. A second run on the same price day writes byte-identical shards and moves only the same-day history point; a run killed at any point and run again, a retry of a finished day and a corrected
// republish of the day never extend a history run; a missed day is a null run. The pipeline tests run the real importer over the mini day (the 57 real products of tests/fixtures/magic-products.json, no network); the property test kills and re-runs S10 for 60 days.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { bootstrap } from "../scripts/bootstrap";
import { runImport } from "../scripts/import";
import { recordHistory, type CardPriceRow, type CardRow, type ImportContext } from "../src/lib/import";
import { loadPrevState, type PrevState } from "../src/lib/data/plane/prevstate";
import { cloneToMem, fsTree, memTree, type MutableTree } from "../src/lib/data/plane/tree";
import { seriesOf } from "../src/lib/data/plane/history-delta";
import { decodeDense, endDayOf, spanOf, type SeriesV4 } from "../src/lib/data/plane/history-codec";
import { PRICE_MASK } from "../src/lib/constants";
import { TRACK_DEFAULTS } from "../src/lib/track";
import { importEnv, magicFixtures, miniMagicDay, sh, tmpRoot } from "./helpers/publish-harness";

const quiet = (): void => undefined;
const NOW = (): Date => new Date("2026-10-08T01:00:00Z");
const readTree = (dir: string): Map<string, string> => { const t = fsTree(path.join(dir, "v1")); return new Map(t.files().map((f) => [f, t.read(f)] as const)); };
const changed = (a: Map<string, string>, b: Map<string, string>): string[] => [...new Set([...a.keys(), ...b.keys()])].filter((f) => a.get(f) !== b.get(f)).sort();
const family = (f: string): string => f.split("/")[0]!;

// ── the pipeline ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("Annex C check 15: the second bootstrap of the same price day changes ONE file, status.json, and not a byte of any shard", async () => {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root); const env = { ...importEnv(t.root, day), PLANE_DIR: path.join(t.root, "plane") };
    const a = await bootstrap(env, NOW); const first = readTree(a.dir);
    assert.deepEqual(a.problems, [], "the validator and the write-once rules pass"); assert.ok(a.files > 300 && a.cards >= 40, `${a.files} files, ${a.cards} cards`); assert.equal(a.seq, 1);
    const b = await bootstrap(env, () => new Date("2026-10-08T01:30:00Z")); const second = readTree(b.dir);
    assert.deepEqual(b.problems, []); assert.equal(b.seq, 2, "the pointer moved"); assert.deepEqual(changed(first, second), ["status.json"], "nothing but the admin record moved");
    assert.equal(b.written, 1); assert.equal(b.unchanged, b.files - 1);
    const sa = JSON.parse(first.get("status.json")!), sb = JSON.parse(second.get("status.json")!);
    assert.equal(sa.counts.files, sb.counts.files); assert.equal(sa.counts.cards, sb.counts.cards); assert.equal(sb.runs.length, 2, "the run is recorded, the data is not rewritten");
  } finally { t.done(); }
});

test("two independent first runs over the same files build the same tree, byte for byte (no clock, no random, no directory order in a shard)", async () => {
  const t = tmpRoot(); try {
    const day = miniMagicDay(t.root); const e1 = { ...importEnv(path.join(t.root, "a"), day), PLANE_DIR: path.join(t.root, "plane-a") }, e2 = { ...importEnv(path.join(t.root, "b"), day), PLANE_DIR: path.join(t.root, "plane-b") };
    const a = await bootstrap(e1, NOW), b = await bootstrap(e2, () => new Date("2026-10-09T09:00:00Z"));
    const ta = readTree(a.dir), tb = readTree(b.dir); ta.delete("status.json"); tb.delete("status.json");
    assert.deepEqual(changed(ta, tb), []); assert.equal(ta.get("manifest.json"), tb.get("manifest.json"), "the manifest lists the same sha-256 prefixes");
  } finally { t.done(); }
});

test("a corrected republish of the day (TCGCSV fixed a price) replaces the same-day history point: the series does not grow, no identity file moves", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane"); const d1 = miniMagicDay(path.join(t.root, "d1")); const e1 = { ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane };
    const a = await bootstrap(e1, NOW); const before = readTree(a.dir); const ser0 = seriesOf(fsTree(path.join(a.dir, "v1")));
    const fixed = 2831;                                                                                                                     // Birds of Paradise (7th Edition): +10% on both finishes
    const d2 = miniMagicDay(path.join(t.root, "d2"), { scale: (id) => (id === fixed ? 1.1 : 1) }); const e2 = { ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane };
    const b = await bootstrap(e2, () => new Date("2026-10-08T02:00:00Z")); const after = readTree(b.dir); assert.deepEqual(b.problems, []);
    const ser1 = seriesOf(fsTree(path.join(b.dir, "v1")));
    const moved = changed(before, after); const fams = new Set(moved.map(family));
    for (const never of ["slug", "sc", "or", "meta"]) assert.ok(!fams.has(never), `${never}/ is write-once identity: ${moved.filter((f) => family(f) === never).join(", ")}`);
    assert.ok(moved.includes("status.json") && moved.some((f) => f.startsWith("px/")), `the price moved: ${moved.join(", ")}`);
    let compared = 0;
    for (const uid of [fixed * 2, fixed * 2 + 1]) {
      const s0 = ser0.get(uid), s1 = ser1.get(uid); if (!s0) continue; assert.ok(s1); compared++;
      assert.equal(spanOf(s1!), spanOf(s0), `unit ${uid}: the series is still ${spanOf(s0)} day(s) long`); assert.equal(endDayOf(s1!), endDayOf(s0));
      const last0 = decodeDense(s0).at(-1)!.cents!, last1 = decodeDense(s1!).at(-1)!.cents!; assert.ok(last1 > last0, `unit ${uid}: the corrected value replaced the old one (${last0} -> ${last1})`);
    }
    assert.ok(compared >= 1);
    for (const [uid, s] of ser0) if (Math.floor(uid / 2) !== fixed) assert.deepEqual(ser1.get(uid), s, `unit ${uid} did not move`);
  } finally { t.done(); }
});

test("the next price day appends one history point to every tracked unit and moves no slug, set token, oracle ordinal or identity shard", async () => {
  const t = tmpRoot(); try {
    const plane = path.join(t.root, "plane");
    const d1 = miniMagicDay(path.join(t.root, "d1")); const a = await bootstrap({ ...importEnv(path.join(t.root, "e1"), d1), PLANE_DIR: plane }, NOW); const before = readTree(a.dir); const ser0 = seriesOf(fsTree(path.join(a.dir, "v1")));
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: "2026-10-08T20:06:09Z", scale: (id, sub) => (id % 3 === 0 || sub === "Foil" ? 1.05 : 0.97) });
    const b = await bootstrap({ ...importEnv(path.join(t.root, "e2"), d2), PLANE_DIR: plane }, () => new Date("2026-10-09T01:00:00Z")); const after = readTree(b.dir); assert.deepEqual(b.problems, []);
    const fams = new Set(changed(before, after).map(family));
    for (const never of ["slug", "sc", "or"]) assert.ok(!fams.has(never), `${never}/ is unchanged`); const idCols = (t: Map<string, string>): unknown[] => (JSON.parse(t.get("meta/sets.json")!) as { sets: unknown[][] }).sets.map((r) => r.slice(0, 5)); assert.deepEqual(idCols(after), idCols(before), "set ids, slugs, tokens, codes and names are unchanged (the counts beside them follow the prices)");
    const ser1 = seriesOf(fsTree(path.join(b.dir, "v1"))); let grew = 0;
    for (const [uid, s] of ser0) { const n = ser1.get(uid); assert.ok(n, `unit ${uid} keeps its series`); if (spanOf(n!) === spanOf(s) + 1) grew++; }
    assert.ok(ser0.size >= 20 && grew === ser0.size, `${grew} of ${ser0.size} series gained exactly one day`);
    const idx = JSON.parse(after.get("hist/index.json")!) as { days: [string, number][] }; assert.deepEqual(idx.days.map((d) => d[0]), ["2026-10-07", "2026-10-08"], "the market index chains one row per price day");
  } finally { t.done(); }
});

test("runImport over a bare repository: the gate stops a published day, a forced re-run moves only status.json, the next day is a new data commit", async () => {
  const t = tmpRoot(); try {
    const remote = path.join(t.root, "remote.git"); sh(t.root, "init", "-q", "--bare", remote);
    const d1 = miniMagicDay(path.join(t.root, "d1")); const base = { PLANE_REMOTE: remote, PLANE_REPO: "o/mtg-data" };
    const e1 = { ...importEnv(path.join(t.root, "e1"), d1), ...base };
    const r1 = await runImport({ phase: "catalog", env: e1, skipHook: true }); assert.equal(r1.outcome === "already-published" || r1.outcome === "skipped", false); assert.equal((r1.outcome as { kind: string }).kind, "published");
    const head1 = sh(t.root, "--git-dir", remote, "rev-parse", "data"); const ptr1 = JSON.parse(sh(t.root, "--git-dir", remote, "show", "data:latest.json")) as { seq: number; ref: string; priceDay: string; phase: string };
    assert.equal(ptr1.seq, 1); assert.equal(ptr1.priceDay, "2026-10-07"); assert.equal(ptr1.phase, "catalog");
    // the same day again: the build's gate refuses, nothing is pushed
    const r2 = await runImport({ phase: "catalog", env: e1, skipHook: true }); assert.equal(r2.outcome, "already-published"); assert.equal(sh(t.root, "--git-dir", remote, "rev-parse", "data"), head1, "no commit");
    // forced: a new seq whose data differs from the first in the admin record only
    const r3 = await runImport({ phase: "catalog", env: { ...e1, IMPORT_FORCE: "1" }, skipHook: true }); assert.equal((r3.outcome as { kind: string }).kind, "published");
    const ptr3 = JSON.parse(sh(t.root, "--git-dir", remote, "show", "data:latest.json")) as { seq: number; ref: string };
    assert.equal(ptr3.seq, 2); const diff = sh(t.root, "--git-dir", remote, "diff", "--name-only", ptr1.ref, ptr3.ref).split("\n").filter(Boolean);
    assert.deepEqual(diff.filter((f) => f !== "latest.json"), ["status.json", "v1/status.json"], `the forced re-run of the same day changed: ${diff.join(", ")}`);
    // the next price day
    const d2 = miniMagicDay(path.join(t.root, "d2"), { stamp: "2026-10-08T20:06:09Z" });
    const r4 = await runImport({ phase: "catalog", env: { ...importEnv(path.join(t.root, "e2"), d2), ...base }, skipHook: true }); assert.equal((r4.outcome as { kind: string }).kind, "published");
    const ptr4 = JSON.parse(sh(t.root, "--git-dir", remote, "show", "data:latest.json")) as { seq: number; priceDay: string }; assert.equal(ptr4.seq, 3); assert.equal(ptr4.priceDay, "2026-10-08");
    const log = sh(t.root, "--git-dir", remote, "log", "--format=%s", "data"); assert.match(log, /data 2026-10-08 3 catalog/); assert.ok(!/\[deploy\]/i.test(log), "no commit subject of the data repository carries the deploy marker");
  } finally { t.done(); }
});

// ── S10: recordHistory ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A unit is (product, finish): its value is the real TCGplayer market price of a fixture product; the simulation only decides which days are published and how a price moves between them.
const REAL = (() => { const out: { uid: number; cents: number }[] = []; for (const f of magicFixtures()) for (const [sub, bit] of [["Normal", 0], ["Foil", 1]] as const) { const m = f.prices[sub]?.market; if (m && m > 0) out.push({ uid: f.productId * 2 + bit, cents: Math.round(m * 100) }); } return out.sort((a, b) => a.uid - b.uid); })();
const cardStub = (id: number): CardRow => ({ id, slug: `s${id}`, name: `n${id}`, alt: null, tcgName: `n${id}`, setId: 1, sc: null, number: null, tn: null, fnum: null, nkey: null, nsort: 0, rarity: "C", cls: 0, treat: "", label: null, flags: 0, link: 0, oracleNo: null, scryId: null, rootId: null, colors: 0, mv: 0, ptype: 0 }) as CardRow;
const prevOf = (histCut: string | null): PrevState => ({ ...loadPrevState(memTree()), empty: histCut === null, histCut });
/** The context S10 sees: one card row per product with a price per finish, `tracked` the set of units the day tracks (F7 compares the priced ones against it). */
function histCtx(tree: MutableTree, day: string, histCut: string | null, values: ReadonlyMap<number, number>, tracked: ReadonlySet<number>): ImportContext {
  const ids = [...new Set([...values.keys()].map((u) => Math.floor(u / 2)))].sort((a, b) => a - b);
  const prices: CardPriceRow[] = ids.map((id) => { const n = values.get(id * 2) ?? null, f = values.get(id * 2 + 1) ?? null; return { cardId: id, marketN: n, marketF: f, lowN: n, lowF: f, mask: PRICE_MASK.LISTED | (n ? PRICE_MASK.TRACKN | PRICE_MASK.HASN : 0) | (f ? PRICE_MASK.TRACKF | PRICE_MASK.HASF : 0) }; });
  return { log: quiet, day, cfg: TRACK_DEFAULTS, prev: prevOf(histCut), phase: "catalog", work: tree, snapshot: { day, sets: [], oracles: [], cards: ids.map(cardStub), prices, sealed: [], units: [] }, match: [], joined: new Map(), tracked };
}
const isoOf = (n: number): string => { const d = new Date(Date.UTC(2026, 9, 7 + n)); return d.toISOString().slice(0, 10); };       // day 0 is 2026-10-07, a Wednesday
const numOf = (iso: string): number => Number(iso.replace(/-/g, ""));

test("S10 rules: the same day twice writes nothing new, a corrected day replaces its point, a missed day is a null run, an older day is refused", async () => {
  const tree = memTree(); const vals = new Map(REAL.slice(0, 20).map((r) => [r.uid, r.cents] as const)); const tracked = new Set(vals.keys());
  const r0 = await recordHistory(histCtx(tree, "2026-10-07", null, vals, tracked)); assert.equal(r0.cut, true, "the first run is a cut: it writes the base"); assert.equal(r0.units, 20);
  const snap1 = new Map(tree.files().map((f) => [f, tree.read(f)] as const));
  const again = await recordHistory(histCtx(tree, "2026-10-07", "2026-10-07", vals, tracked)); assert.equal(again.cut, true, "a re-run of the cut day is still the cut day");
  assert.deepEqual(changed(snap1, new Map(tree.files().map((f) => [f, tree.read(f)] as const))), [], "the retry is byte-identical");
  const uid = REAL[0]!.uid, was = REAL[0]!.cents; const bumped = new Map(vals); bumped.set(uid, was + 25);
  await recordHistory(histCtx(tree, "2026-10-07", "2026-10-07", bumped, tracked)); const s = seriesOf(tree).get(uid)!; assert.equal(spanOf(s), 1); assert.deepEqual(decodeDense(s).map((p) => p.cents), [was + 25], "the correction replaced the point");
  await recordHistory(histCtx(tree, "2026-10-08", "2026-10-07", vals, tracked)); await recordHistory(histCtx(tree, "2026-10-11", "2026-10-07", vals, tracked));              // 10-09 and 10-10 were never published
  assert.deepEqual(decodeDense(seriesOf(tree).get(uid)!).map((p) => p.cents), [was + 25, was, null, null, was], "a missed day is a null run, never a held price");
  const old = await recordHistory(histCtx(tree, "2026-10-08", "2026-10-07", new Map(vals).set(uid, 1), tracked)); assert.equal(old.cut, false);
  assert.deepEqual(decodeDense(seriesOf(tree).get(uid)!).map((p) => p.cents), [was + 25, was, null, null, was], "a day older than the end of the series is refused: history is append-only");
  const idx = JSON.parse(tree.read("hist/index.json")) as { days: [string, number][] }; assert.deepEqual(idx.days.map((d) => d[0]), ["2026-10-07", "2026-10-08", "2026-10-11"], "one market index row per published day");
});

test("S10 F7: under 80% of the tracked units priced, or over 30% of them moving more than 50%, skips the history and leaves every file untouched", async () => {
  const many = (n: number): [number, number][] => { const out: [number, number][] = []; for (let k = 0; out.length < n; k++) for (const r of REAL) { if (out.length >= n) break; out.push([r.uid + 2_000_000 * k, r.cents]); } return out; };
  const base = new Map(many(160)); const tracked = new Set(base.keys()); const tree = memTree();
  await recordHistory(histCtx(tree, "2026-10-07", null, base, tracked)); const files = new Map(tree.files().map((f) => [f, tree.read(f)] as const));
  const half = new Map([...base].slice(0, 100)); const lowCov = await recordHistory(histCtx(tree, "2026-10-08", "2026-10-07", half, tracked));
  assert.match(lowCov.skipped ?? "", /^F7: only 100 of 160 tracked units are priced today \(under 80%\)/); assert.deepEqual(changed(files, new Map(tree.files().map((f) => [f, tree.read(f)] as const))), []);
  const crash = new Map([...base].map(([u, c], i) => [u, i % 2 === 0 ? Math.round(c * 0.3) + 1 : c] as const)); const moved = await recordHistory(histCtx(tree, "2026-10-08", "2026-10-07", crash, tracked));
  assert.match(moved.skipped ?? "", /^F7: 80 of 160 tracked units moved more than 50%/); assert.deepEqual(changed(files, new Map(tree.files().map((f) => [f, tree.read(f)] as const))), [], "the prices still publish elsewhere; the history stays as it was");
  const ok = new Map([...base].map(([u, c], i) => [u, i % 4 === 0 ? Math.round(c * 0.3) + 1 : c] as const)); const fine = await recordHistory(histCtx(tree, "2026-10-08", "2026-10-07", ok, tracked));
  assert.equal(fine.skipped, undefined, "a quarter of the units moving is a market, not a defect");
});

test("a cut day (a Sunday, 28 days after the last cut) merges base and tail into a fresh base and empties the tail; the series are unchanged by it", async () => {
  const tree = memTree(); const vals = new Map(REAL.slice(0, 30).map((r) => [r.uid, r.cents] as const)); const tracked = new Set(vals.keys()); let cut = "2026-10-07"; const model = new Map<number, (number | null)[]>();
  for (let d = 0; d <= 32; d++) {
    const iso = isoOf(d); const v = new Map([...vals].map(([u, c], i) => [u, c + ((d * 7 + i * 3) % 11) * 5] as const));
    const r = await recordHistory(histCtx(tree, iso, d === 0 ? null : cut, v, tracked)); if (r.cut) cut = iso;
    for (const [u, c] of v) { const a = model.get(u) ?? []; a.push(c); model.set(u, a); }
    if (d === 4 + 28 - 1 || d === 32) {
      const hasTail = tree.files().some((f) => f.startsWith("hist/t/"));
      if (r.cut) assert.equal(hasTail, false, `${iso} is a cut day: the tail is emptied`);
    }
  }
  assert.equal(cut, isoOf(32), "2026-11-08 is the first Sunday 28 days after 2026-10-07"); assert.equal(new Date(`${cut}T00:00:00Z`).getUTCDay(), 0);
  for (const [u, vs] of model) assert.deepEqual(decodeDense(seriesOf(tree).get(u)!).map((p) => p.cents), vs, `unit ${u}`);
});

// ── the property ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lcg = (seed: number): (() => number) => { let st = seed >>> 0; return () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296); };
interface Sim { published: number; runs: number; kills: number; skippedF7: number; cuts: number }
/** 60 days of a publisher that dies at random points and is run again. The committed tree is what the data repository holds: a run works on a COPY and lands whole or not at all (a kill discards the copy). Per day: a missed day (no run), a clean run, a run
 *  killed after S10 and run again, a retry of a finished day, a corrected republish (TCGCSV fixed prices: the last run wins), or a half-priced day (F7 skips the history). Units enter and leave tracking from day to day. The decoded series must equal the model. */
async function simulate(seed: number): Promise<Sim> {
  const rnd = lcg(seed), ri = (n: number): number => Math.floor(rnd() * n); const U = 36, DAYS = 60;
  const units = REAL.filter((_, i) => i % Math.max(1, Math.floor(REAL.length / U)) === 0).slice(0, U);
  const price: number[][] = units.map((u) => { let v = u.cents; return Array.from({ length: DAYS }, () => { if (rnd() < 0.35) v = Math.max(5, Math.round(v * (0.8 + rnd() * 0.4))); return v; }); });
  const active: boolean[][] = units.map(() => { let on = rnd() < 0.75; return Array.from({ length: DAYS }, () => { if (rnd() < 0.08) on = !on; return on; }); });
  let committed: MutableTree = memTree(); let histCut: string | null = null; const model: (number | null | undefined)[][] = units.map(() => []);
  const sim: Sim = { published: 0, runs: 0, kills: 0, skippedF7: 0, cuts: 0 };
  const run = async (d: number, vals: Map<number, number>, tracked: Set<number>, land: boolean): Promise<{ skipped?: string; cut: boolean }> => {
    const copy = cloneToMem(committed); const r = await recordHistory(histCtx(copy, isoOf(d), histCut, vals, tracked)); sim.runs++;
    if (land) { committed = copy; if (r.cut && !r.skipped) { histCut = isoOf(d); sim.cuts++; } } else sim.kills++;
    return r;
  };
  for (let d = 0; d < DAYS; d++) {
    if (rnd() < 0.1) continue;                                                                                                  // a red run: nothing is published that day
    const todays = units.map((_, i) => i).filter((i) => active[i]![d]); if (todays.length < 5) continue;
    const valsOf = (tweak: boolean): Map<number, number> => new Map(todays.map((i) => [units[i]!.uid, tweak && rnd() < 0.4 ? price[i]![d]! + 7 : price[i]![d]!] as const));
    const tracked = new Set(todays.map((i) => units[i]!.uid)); const mode = rnd(); let finalVals: Map<number, number> | null = null; let published = true;
    if (mode < 0.15) { await run(d, valsOf(false), tracked, false); finalVals = valsOf(false); await run(d, finalVals, tracked, true); }          // killed after S10, run again
    else if (mode < 0.3) { finalVals = valsOf(false); await run(d, finalVals, tracked, true); await run(d, finalVals, tracked, true); }          // the 22:25 retry of a finished day
    else if (mode < 0.42) { await run(d, valsOf(false), tracked, true); finalVals = valsOf(true); await run(d, finalVals, tracked, true); }       // corrected prices: the last run wins
    else if (mode < 0.5) {                                                                                                      // a half-priced day: F7 keeps the history as it was
      const keep = new Map([...valsOf(false)].filter((_, k) => k % 2 === 0)); const r = await run(d, keep, tracked, true); assert.ok(r.skipped, `seed ${seed} day ${d}: ${keep.size} of ${tracked.size} priced must be skipped`); sim.skippedF7++; published = false;
    } else { finalVals = valsOf(false); await run(d, finalVals, tracked, true); }
    if (published && finalVals) { sim.published++; units.forEach((u, i) => { const v = finalVals!.get(u.uid); if (v !== undefined) model[i]![d] = v; }); }
  }
  const got = seriesOf(committed);
  units.forEach((u, i) => {
    const pub = model[i]!.map((v, d) => (v !== undefined ? d : -1)).filter((d) => d >= 0);
    const s = got.get(u.uid); if (!pub.length) { assert.equal(s, undefined, `seed ${seed} unit ${u.uid}: never published`); return; }
    assert.ok(s, `seed ${seed} unit ${u.uid}: has a series`); const first = pub[0]!, last = pub[pub.length - 1]!; const expect: (number | null)[] = []; for (let d = first; d <= last; d++) expect.push(model[i]![d] ?? null);
    assert.equal((s as SeriesV4)[0], numOf(isoOf(first)), `seed ${seed} unit ${u.uid}: start day`); assert.deepEqual(decodeDense(s as SeriesV4).map((p) => p.cents), expect, `seed ${seed} unit ${u.uid}: the decoded series differs from the model`);
    assert.equal(endDayOf(s as SeriesV4), numOf(isoOf(last)));
  });
  // the market index: one row per published day, in order, never twice
  const ix = JSON.parse(committed.read("hist/index.json")) as { days: [string, number][] }; const days = ix.days.map((r) => r[0]);
  const pubDays = [...new Set(model.flatMap((m) => m.map((v, d) => (v !== undefined ? isoOf(d) : ""))).filter(Boolean))].sort();
  assert.deepEqual(days, pubDays, `seed ${seed}: the index has exactly the published days`);
  return sim;
}
// Mutation-tested: making S10 append a retried day as a NEW day (instead of replacing the last one) fails this test and "S10 rules" above.
test("PROPERTY: 60 days of kills, retries, corrections, missed days, half-priced days and units entering and leaving tracking decode to the model (S10, 40 seeds)", async () => {
  const tot: Sim = { published: 0, runs: 0, kills: 0, skippedF7: 0, cuts: 0 }; 
  for (let seed = 1; seed <= 40; seed++) { const s = await simulate(seed * 7919); tot.published += s.published; tot.runs += s.runs; tot.kills += s.kills; tot.skippedF7 += s.skippedF7; tot.cuts += s.cuts; }
  assert.ok(tot.runs > 2400 && tot.kills > 150 && tot.skippedF7 > 80 && tot.cuts >= 80, JSON.stringify(tot));       // every kind of event was exercised, and cut days among them
});
