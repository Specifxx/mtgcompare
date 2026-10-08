// The v4 history codec and the ONLY append rule (critique DP-12). Owner WP01a. The property test kills and re-runs a simulated publisher at random points for 60 days and compares every decoded series with the model.
import test from "node:test";
import assert from "node:assert/strict";
import { appendDay, decodeDense, decodeV3, encodeRuns, endDayOf, mergeTail, spanOf, toPoints, trimToWindow, type SeriesV4 } from "../src/lib/data/plane/history-codec";
import { addDays, daysBetween } from "../src/lib/history";

const D0 = 20260101, day = (k: number): number => addDays(D0, k);
const dense = (s: SeriesV4 | undefined): (number | null)[] => (s ? decodeDense(s).map((p) => p.cents) : []);

test("a first value starts a series; the same value the next day extends the run; a new value opens a run", () => {
  let r = appendDay(undefined, day(0), 500); assert.deepEqual(r.series, [day(0), 500, 1]); assert.equal(r.action, "new");
  r = appendDay(r.series, day(1), 500); assert.deepEqual(r.series, [day(0), 500, 2]); assert.equal(r.action, "extend");
  r = appendDay(r.series, day(2), 450); assert.deepEqual(r.series, [day(0), 500, 2, 450, 1]); assert.equal(r.action, "new-run");
  assert.equal(endDayOf(r.series), day(2)); assert.equal(spanOf(r.series), 3);
});
test("the same priceDay published twice (the 21:55 and 22:25 retries, a phase-2 re-run) never extends the run", () => {
  let s = appendDay(appendDay(undefined, day(0), 500).series, day(1), 500).series;          // [d0, 500, 2]
  const again = appendDay(s, day(1), 500); assert.equal(again.changed, false); assert.equal(again.action, "noop"); assert.deepEqual(again.series, s);
  const fix = appendDay(s, day(1), 480); assert.equal(fix.action, "replace"); assert.deepEqual(fix.series, [day(0), 500, 1, 480, 1]);   // TCGCSV republished a corrected price: the last day is REPLACED
  const back = appendDay(fix.series, day(1), 500); assert.deepEqual(back.series, [day(0), 500, 2], "replacing back merges with the previous run");
  assert.equal(spanOf(back.series), 2);
});
test("a missed day is a NULL run, never a held price; a gap after a null run grows the null run", () => {
  let s = appendDay(undefined, day(0), 500).series;
  const g = appendDay(s, day(3), 520); assert.equal(g.action, "gap"); assert.deepEqual(g.series, [day(0), 500, 1, null, 2, 520, 1]); assert.deepEqual(dense(g.series), [500, null, null, 520]);
  s = appendDay(s, day(1), null).series; assert.deepEqual(s, [day(0), 500, 1, null, 1]);                      // an explicit "no price today" is a null run too
  const g2 = appendDay(s, day(4), 530); assert.deepEqual(g2.series, [day(0), 500, 1, null, 3, 530, 1], "the gap extends the existing null run");
  assert.deepEqual(dense(g2.series), [500, null, null, null, 530]);
});
test("a day OLDER than the series end is refused (history is append-only); 0 and negatives are no price", () => {
  const s = appendDay(appendDay(undefined, day(5), 500).series, day(6), 510).series;
  const old = appendDay(s, day(2), 999); assert.equal(old.changed, false); assert.equal(old.action, "refused-older"); assert.deepEqual(old.series, s);
  assert.deepEqual(appendDay(undefined, day(0), 0).series, [day(0), null, 1]); assert.deepEqual(encodeRuns(day(0), [5, 0, -1, 5]), [day(0), 5, 1, null, 2, 5, 1]);
});
test("encodeRuns and decodeDense round-trip arbitrary series; v3 and v4 decode to the same points", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < 200; t++) {
    const n = 1 + Math.floor(rnd() * 120); const vals: (number | null)[] = []; let v = 100 + Math.floor(rnd() * 900);
    for (let i = 0; i < n; i++) { if (rnd() < 0.3) v = rnd() < 0.1 ? 0 : 50 + Math.floor(rnd() * 2000); vals.push(v > 0 ? v : null); }
    const s = encodeRuns(day(0), vals); assert.deepEqual(dense(s), vals); assert.equal(spanOf(s), n);
    assert.deepEqual(decodeV3([day(0), ...vals]).map((p) => p.cents), vals);
    assert.deepEqual(toPoints(s).map((p) => p[1]), vals.filter((x) => x != null));
  }
});
test("mergeTail: contiguous, with a gap, base-less (a unit that entered tracking after the cut), tail-less and overlapping", () => {
  const base = encodeRuns(day(-9), [1, 1, 2, 2, 2, 3, 3, 3, 3, 3]);                              // ends on day(0), the cut day
  const tail = encodeRuns(day(1), [3, 4, 4]);
  assert.deepEqual(dense(mergeTail(base, tail)), [1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4], "the equal values across the cut merge into one run");
  assert.deepEqual(mergeTail(base, tail), [day(-9), 1, 2, 2, 3, 3, 6, 4, 2]);
  const late = encodeRuns(day(3), [9, 9]); assert.deepEqual(dense(mergeTail(base, late)).slice(10), [null, null, 9, 9], "a tail that starts after a gap gets a null run");
  assert.deepEqual(mergeTail(undefined, tail), tail); assert.deepEqual(mergeTail(base, undefined), base); assert.equal(mergeTail(undefined, undefined), undefined);
  const overlap = encodeRuns(day(-1), [3, 3, 7]); assert.deepEqual(dense(mergeTail(base, overlap)).slice(8), [3, 3, 7], "an overlapping tail (a cut raced a tail write): the base wins up to its end, the rest appends");
});
test("trimToWindow keeps the last N days and re-encodes", () => {
  const s = encodeRuns(day(0), [...Array(100).keys()].map((i) => 100 + (i % 10))); const t = trimToWindow(s, 30);
  assert.equal(spanOf(t), 30); assert.equal(endDayOf(t), endDayOf(s)); assert.deepEqual(dense(t), dense(s).slice(70)); assert.equal(trimToWindow(s, 500), s);
});

// ── the property test: 60 days, a publisher that is killed and re-run at random points ─────────────────────────────────────────────────────────────
function simulate(seed: number): { units: number; appends: number } {
  let st = seed >>> 0; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296), ri = (n: number) => Math.floor(rnd() * n);
  const U = 30, DAYS = 60; const price: (number | null)[][] = []; const active: boolean[][] = [];
  for (let u = 0; u < U; u++) {
    const p: number[] = []; let v = 200 + ri(2000); const a: boolean[] = []; let on = rnd() < 0.7;
    for (let d = 0; d < DAYS; d++) { if (rnd() < 0.35) v = Math.max(5, Math.round(v * (0.8 + rnd() * 0.4))); p.push(v); if (rnd() < 0.08) on = !on; a.push(on); }
    price.push(p); active.push(a);
  }
  const state = new Map<number, SeriesV4>(); const model: (number | null | undefined)[][] = [...Array(U)].map(() => []);   // undefined = never published that day, null = published as no price
  let appends = 0;
  for (let d = 0; d < DAYS; d++) {
    if (rnd() < 0.1) continue;                                                                      // a missed day (red run): nothing is published
    const todays = [...Array(U).keys()].filter((u) => active[u]![d]);
    const run = (subset: number[], tweak: boolean) => { for (const u of subset) { const val = tweak && rnd() < 0.3 ? Math.max(5, price[u]![d]! + 7) : price[u]![d]!; const r = appendDay(state.get(u), addDays(D0, d), val); state.set(u, r.series); model[u]![d] = val; appends++; } };
    const mode = rnd();
    if (mode < 0.15) { run(todays.filter(() => rnd() < 0.5), false); run(todays, false); }       // killed halfway, then the retry completes the day
    else if (mode < 0.3) { run(todays, false); run(todays, false); }                                // the 22:25 retry of a finished day
    else if (mode < 0.4) { run(todays, false); run(todays, true); }                                 // TCGCSV republished with corrected prices: the LAST run wins
    else run(todays, false);
  }
  for (let u = 0; u < U; u++) {
    const s = state.get(u); const pubDays = model[u]!.map((v, d) => (v !== undefined ? d : -1)).filter((d) => d >= 0);
    if (!pubDays.length) { assert.equal(s, undefined); continue; }
    const first = pubDays[0]!, last = pubDays[pubDays.length - 1]!; const expect: (number | null)[] = []; for (let d = first; d <= last; d++) expect.push(model[u]![d] ?? null);
    assert.equal(s![0], addDays(D0, first), `seed ${seed} unit ${u}: start day`); assert.deepEqual(dense(s), expect, `seed ${seed} unit ${u}: decoded series differs from the model`);
    assert.equal(daysBetween(s![0], endDayOf(s!)) + 1, last - first + 1);
  }
  return { units: U, appends };
}
test("PROPERTY: 60 days of random kills, retries, corrections, missed days and units entering and leaving tracking decode to the model (200 seeds)", () => {
  let total = 0; for (let seed = 1; seed <= 200; seed++) total += simulate(seed * 7919).appends;
  assert.ok(total > 100_000, `exercised ${total} appends`);
});
test("a cut day: base + tail merged then trimmed to the window equals the model, and the new tail starts empty", () => {
  const model = [...Array(120)].map((_, i) => 100 + ((i * 7) % 13)); let base = encodeRuns(day(0), model.slice(0, 90)); let tail: SeriesV4 | undefined;
  for (let d = 90; d < 120; d++) tail = appendDay(tail, day(d), model[d]!).series;
  const merged = mergeTail(base, tail)!; assert.deepEqual(dense(merged), model);
  const cut = trimToWindow(merged, 100); assert.deepEqual(dense(cut), model.slice(20)); assert.equal(endDayOf(cut), day(119));
  base = cut; tail = undefined; assert.deepEqual(dense(mergeTail(base, appendDay(tail, day(120), 111).series)).slice(-2), [model[119], 111]);
});

// ── DP-17: the durable daily-delta copy of the history ────────────────────────────────────────────────────────────────────────────────────────────
import { deltaPath, historyDelta, rebuildSeries, seriesOf } from "../src/lib/data/plane/history-delta";
import { miniFull as miniFullD, dayOf as dayOfD } from "./helpers/plane-tree";
import { memTree as memTreeD } from "../src/lib/data/plane/tree";
test("daily delta files rebuild the live series day for day: a FULL file on the cut day lists every tracked unit, later days only the changes; a unit that leaves tracking ends with a null", () => {
  // ONE consistent tree (the mini generator derives a day's history from that day's drift, so trees of different days disagree about the past): the deltas of days 0..9 are cut from the tree of day 9, exactly what ten daily publishes would have recorded
  const tree = miniFullD({ day: 9 }); const live = seriesOf(tree); const deltas = [];
  for (let d = 0; d <= 9; d++) deltas.push(historyDelta(tree, dayOfD(d), d === 0, live));
  assert.equal(deltas[0]!.full, true); assert.ok(deltas[1]!.u.length > 0);
  const rebuilt = rebuildSeries(deltas); const from = dayOfD(0); let compared = 0;
  const after = (x: SeriesV4) => decodeDense(x).filter((p) => p.day >= from && p.cents != null).map((p) => [p.day, p.cents]);
  for (const [uid, s] of live) { const r = rebuilt.get(uid); assert.ok(r, `uid ${uid} is rebuilt`); compared++; assert.deepEqual(after(r!), after(s), `uid ${uid}`); }
  assert.ok(compared > 100, `${compared} series compared`);
  const small = memTreeD([["hist/p/0/0.json", JSON.stringify({ v: 4, p: { "1.0": [20260101, 500, 3, 600, 1], "2.0": [20260101, 900, 4], "3.0": [20260101, 700, 2] } })]]);
  assert.deepEqual(historyDelta(small, 20260104).u, [[2, 600]], "unit 1 (uid 2) changed; unit 2 (uid 4) held its price: not listed; unit 3 (uid 6) ended earlier");
  assert.deepEqual(historyDelta(small, 20260103).u, [[6, null]], "unit 3's series ended on 20260102: it has no value on 20260103, a null");
  assert.deepEqual(historyDelta(small, 20260104, true).u, [[2, 600], [4, 900]], "a full file lists every unit that has a value that day");
  assert.equal(deltaPath(20261007), "d/2026/10/2026-10-07.json");
  assert.deepEqual(rebuildSeries([{ v: 1, day: 20260101, u: [[2, 500]] }, { v: 1, day: 20260102, u: [[2, null]] }, { v: 1, day: 20260103, u: [] }]).get(2), [20260101, 500, 1, null, 2], "a unit that left tracking is null from then on (a trailing null run: harmless, charts drop null days)");
  assert.deepEqual(rebuildSeries([{ v: 1, day: 20260101, u: [[2, 500], [3, 700]] }, { v: 1, day: 20260102, full: true, u: [[3, 710]] }]).get(2), [20260101, 500, 1, null, 1], "a full file is the whole state of its day: unit 2 is not in it");
});
