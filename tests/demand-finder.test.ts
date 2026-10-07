import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEMAND_WINDOWS,
  FREE_DEMAND_ROWS,
  PREMIUM_DEMAND_ROWS,
  demandQueryFor,
  parseDemandList,
  parseDemandWindow,
  visibleDemandRows,
} from "../src/lib/demand-view";
import { compareDemand, chartMovement, movementFor, movementFromRanks, rankBy } from "../src/lib/demand-movement";
import {
  buildDemandDay,
  dayMinus,
  daysBetween,
  demandAsOf,
  demandWindow,
  demandWindowOrThrow,
  diffTotals,
  latestDayAtOrBefore,
  velocityBetween,
  withDemandDay,
  type DemandDayFile,
} from "../src/lib/demand-snapshot";

// ─────────────────────────────────────────────────────────────────────────────
// Demand Finder (RiftCompare's tests/demand-finder.test.ts, demand-movement and
// demand-snapshot-errors, for OP Compare): who sees what, the chart movement
// rules, and the snapshot arithmetic. OP keeps the snapshots as files on the
// data branch (history/demand/*.json), never a Prisma table, so the window
// maths runs over injected readers here and the egress shape is pinned below.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── who sees what ────────────────────────────────────────────────────────────

test("free is the /movers strip exactly: the top 10 searched over 7 days, whatever the query says", () => {
  assert.equal(FREE_DEMAND_ROWS, 10);
  assert.equal(PREMIUM_DEMAND_ROWS, 25);
  assert.deepEqual(demandQueryFor("free", 30), { days: 7, limit: 10 });
  assert.deepEqual(demandQueryFor("free", 7), { days: 7, limit: 10 });
  assert.deepEqual(demandQueryFor("full", 30), { days: 30, limit: 25 });
  const rows = { bySearch: Array.from({ length: 25 }, (_, i) => `s${i}`), byView: Array.from({ length: 25 }, (_, i) => `v${i}`) };
  assert.equal(visibleDemandRows(rows, "free", "viewed").length, 10, "free never sees the most-viewed list");
  assert.equal(visibleDemandRows(rows, "free", "viewed")[0], "s0");
  assert.equal(visibleDemandRows(rows, "full", "viewed")[0], "v0");
  assert.equal(visibleDemandRows(rows, "full", "searched").length, 25);
});

test("the query string can only ask for two windows and two lists", () => {
  assert.deepEqual([...DEMAND_WINDOWS], [7, 30]);
  assert.equal(parseDemandWindow("30"), 30);
  assert.equal(parseDemandWindow("365"), 7);
  assert.equal(parseDemandWindow(undefined), 7);
  assert.equal(parseDemandList("viewed"), "viewed");
  assert.equal(parseDemandList("../etc"), "searched");
});

test("the page gates on the premium minimum (Plus does not open it) and asks the loader for no more than the access allows", () => {
  const page = code(read("src/app/tools/demand/page.tsx"));
  assert.match(page, /isPremium\(user, "premium"\)/, "Plus must not open it");
  assert.match(page, /demandQueryFor\(access, days\)/);
  assert.match(page, /visibleDemandRows\(result, access, list\)/);
  assert.match(page, /<PlanButton surface="gate:demand" tier="premium"/);
  assert.match(code(read("src/app/movers/page.tsx")), /getTopDemand\(7, MOST_SEARCHED_ROWS\)/, "/movers is the free strip's one call");
  assert.match(code(read("src/app/movers/page.tsx")), /MOST_SEARCHED_ROWS = FREE_DEMAND_ROWS/);
});

// ── chart movement ───────────────────────────────────────────────────────────

const row = (cardId: string, searches: number, views = 0) => ({ cardId, searches, views });

test("ties rank the same way every load: metric, then the other metric, then card id", () => {
  const rows = [row("b", 5, 1), row("a", 5, 1), row("c", 5, 9), row("d", 0, 50)];
  assert.deepEqual(rows.sort(compareDemand("searches")).map((r) => r.cardId), ["c", "a", "b", "d"]);
  assert.deepEqual(rankBy(rows, "searches").get("a"), 2);
  assert.equal(rankBy(rows, "searches").has("d"), false, "no searches, no rank on that chart");
  assert.equal(rankBy(rows, "views").get("d"), 1);
});

test("movement: up and down by places, held, and new when the card had no rank before", () => {
  assert.deepEqual(movementFor(3, 10), { kind: "up", by: 7, prev: 10 });
  assert.deepEqual(movementFor(10, 3), { kind: "down", by: 7, prev: 3 });
  assert.deepEqual(movementFor(4, 4), { kind: "same", by: 0, prev: 4 });
  assert.deepEqual(movementFor(1, undefined), { kind: "new" });
  const prev = [row("a", 9), row("b", 8), row("c", 1)];
  const m = chartMovement(["b", "a", "z"], prev, "searches");
  assert.deepEqual(m.get("b"), { kind: "up", by: 1, prev: 2 });
  assert.deepEqual(m.get("a"), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get("z"), { kind: "new" });
  assert.deepEqual(movementFromRanks(["x", "y"], new Map([["y", 1]])).get("y"), { kind: "down", by: 1, prev: 1 });
});

test("the whole previous field is ranked, so #73 to #40 reads as +33, not new", () => {
  const prev = Array.from({ length: 80 }, (_, i) => row(`c${i}`, 1000 - i));
  const m = chartMovement(["c72"], prev, "searches");
  assert.deepEqual(m.get("c72"), { kind: "up", by: 72, prev: 73 });
});

// ── snapshot arithmetic ──────────────────────────────────────────────────────

const day = (d: string, p: Record<string, [number, number]>): DemandDayFile => ({ v: 1, day: d, p });

test("a day file keeps only cards with activity; the index is sorted and de-duplicated", () => {
  const f = buildDemandDay("2026-10-01", [{ id: 1, searchCount: 3, viewCount: 0 }, { id: 2, searchCount: 0, viewCount: 0 }, { id: 3, searchCount: 0, viewCount: 4 }]);
  assert.deepEqual(f, { v: 1, day: "2026-10-01", p: { "1": [3, 0], "3": [0, 4] } });
  assert.deepEqual(withDemandDay({ v: 1, days: ["2026-10-02", "2026-10-01"] }, "2026-10-02").days, ["2026-10-01", "2026-10-02"]);
  assert.deepEqual(withDemandDay(null, "2026-10-01").days, ["2026-10-01"]);
});

test("day arithmetic is UTC and whole days", () => {
  assert.equal(dayMinus("2026-03-01", 1), "2026-02-28");
  assert.equal(dayMinus("2026-10-04", 7), "2026-09-27");
  assert.equal(daysBetween("2026-09-27", "2026-10-04"), 7);
  assert.equal(latestDayAtOrBefore(["2026-09-01", "2026-09-20", "2026-10-01"], "2026-09-25"), "2026-09-20");
  assert.equal(latestDayAtOrBefore(["2026-10-01"], "2026-09-25"), null);
});

test("a window is today's totals minus the baseline's; a card new since the baseline counts in full; a reset never goes negative", () => {
  const rows = diffTotals({ a: [10, 5], b: [4, 4], c: [2, 0], d: [1, 1] }, { a: [4, 5], b: [9, 9], d: [1, 1] });
  const by = Object.fromEntries(rows.map((r) => [r.cardId, [r.searches, r.views]]));
  assert.deepEqual(by, { a: [6, 0], c: [2, 0] }, "b reset backwards and d did not move: neither has window activity");
});

test("demandWindowOrThrow reports the REAL coverage, with the previous period when asked", async () => {
  const files: Record<string, DemandDayFile> = {
    "2026-09-13": day("2026-09-13", { a: [1, 0] }),
    "2026-09-27": day("2026-09-27", { a: [5, 1], b: [2, 0] }),
  };
  const deps = { days: Object.keys(files), live: { a: [9, 2], b: [2, 0], c: [3, 0] } as Record<string, [number, number]>, readDay: async (d: string) => files[d] ?? null, today: "2026-10-04" };
  const w = await demandWindowOrThrow(7, deps, { previous: true });
  assert.equal(w.baselineDay, "2026-09-27");
  assert.equal(w.coveredDays, 7);
  assert.deepEqual(w.rows.map((r) => [r.cardId, r.searches]).sort(), [["a", 4], ["c", 3]]);
  assert.equal(w.previous?.startDay, "2026-09-13");
  assert.deepEqual(w.previous?.rows.map((r) => [r.cardId, r.searches]).sort(), [["a", 4], ["b", 2]]);
  // A 30-day window has no snapshot old enough: empty, never a shorter window under a longer label.
  const w30 = await demandWindowOrThrow(30, deps);
  assert.equal(w30.baselineDay, null);
  assert.equal(w30.rows.length, 0);
  assert.equal(w30.totalDays, 2);
});

test("a failed read THROWS (so the cache never stores it as 'no demand'); only the display-only form swallows it", async () => {
  const deps = {
    days: ["2026-09-27"],
    live: { a: [1, 0] } as Record<string, [number, number]>,
    readDay: async () => {
      throw new Error("HTTP 503");
    },
    today: "2026-10-04",
  };
  await assert.rejects(demandWindowOrThrow(7, deps), /HTTP 503/);
  const guarded = await demandWindow(7, deps);
  assert.deepEqual(guarded.rows, []);
  assert.equal(guarded.baselineDay, null);
});

test("velocity needs two snapshots a day apart; demandAsOf reads each card's last totals and slope", () => {
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  assert.equal(velocityBetween({ t: t("2026-10-01"), s: 10, v: 0 }, { t: t("2026-10-01"), s: 20, v: 0 }, 2), null);
  assert.equal(velocityBetween({ t: t("2026-10-01"), s: 10, v: 0 }, { t: t("2026-10-02"), s: 20, v: 0 }, 1), null);
  const v = velocityBetween({ t: t("2026-10-01"), s: 10, v: 2 }, { t: t("2026-10-03"), s: 30, v: 6 }, 3)!;
  assert.deepEqual([v.searchPerDay, v.viewPerDay, v.searchGrowthPct, v.spanDays], [10, 2, 200, 2]);
  const as = demandAsOf([day("2026-10-01", { a: [10, 2], z: [1, 1] }), day("2026-10-03", { a: [30, 6] }), day("2026-10-09", { a: [99, 9] })], "2026-10-03", 21);
  assert.equal(as.a.searchCount, 30, "a day after asOf is ignored");
  assert.equal(as.a.velocity?.searchPerDay, 10);
  assert.equal(as.z.velocity, null, "one snapshot: no velocity");
});

// ── egress shape ─────────────────────────────────────────────────────────────

test("getTopDemand is a self-cached loader that reads the files at a pinned ref and the live counters, and never throws", () => {
  const data = code(read("src/lib/data.ts"));
  const fn = /export async function getTopDemand[\s\S]*?\n\}/.exec(data)?.[0] ?? "";
  assert.match(fn, /try \{[\s\S]*catch/, "a failed read is an empty result outside the cache");
  assert.match(fn, /failed: true/);
  const cached = /const getDemandRanking = unstable_cache\(([\s\S]*?)\n\);/.exec(data)?.[1] ?? "";
  assert.match(cached, /demandWindowAtOrThrow\(ref, days/, "the cached callback uses the throwing read");
  assert.doesNotMatch(cached, /getHistoryRef|getCatalog|getTopDemand/, "no loader is called inside a cache callback");
  assert.match(cached, /PREMIUM_DEMAND_ROWS/, "computed once at the deepest list and sliced for every caller");
  assert.doesNotMatch(code(read("src/lib/demand-snapshot.ts")), /prisma|@\/lib\/db|from "\.\/db"/, "the snapshot module is pure");
});

test("no demand table exists: snapshots are files written by the import", () => {
  const schema = read("prisma/schema.prisma");
  assert.doesNotMatch(schema, /model DemandSnapshot/);
  const store = read("src/lib/history-store.ts");
  assert.match(store, /history", "demand"|"demand", `\$\{f\.day\}\.json`/);
  assert.match(read("src/lib/tools-history.ts"), /writeDemandDay\(dayFile\)/);
  assert.match(read("scripts/import.ts"), /recordToolsHistory\(log\)/);
});
