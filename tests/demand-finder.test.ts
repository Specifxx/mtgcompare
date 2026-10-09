// Demand Finder (RiftCompare's tests/demand-finder.test.ts, demand-movement and demand-snapshot-errors, for MTG Compare): the request shape, the chart movement rules, the snapshot arithmetic, the daily recorder and the
// shape of the loader (tier-neutral ranking, Neon only inside the cache, the clear slice for everyone else). Who sees how many rows is premium-demand-gate.test.ts. Owner WP07. Card ids are real TCGplayer product ids.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMAND_WINDOWS, FREE_DEMAND_ROWS, PREMIUM_DEMAND_ROWS, demandQueryFor, parseDemandList, parseDemandWindow, visibleDemandRows } from "../src/lib/demand-view";
import { compareDemand, chartMovement, movementFor, movementFromRanks, rankBy } from "../src/lib/demand-movement";
import { DEMAND_DAY_CARDS, buildDemandDay, dayMinus, daysBetween, demandAsOf, demandWindow, demandWindowOrThrow, diffTotals, latestDayAtOrBefore, velocityBetween, type DemandDayFile } from "../src/lib/demand-snapshot";
import { DEMAND_KEEP_DAYS, recordDemandDay, type DemandStore } from "../src/lib/tools-history";
import { rankDemandWindow } from "../src/lib/data/demand";
import { readDataModule } from "./helpers/data-source";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// real products: Sol Ring (Battle for Baldur's Gate promo), Counterspell (Modern Horizons 2), Birds of Paradise (7th Edition), Fire // Ice (Double Masters 2022)
const SOL = 594545, COUNTERSPELL = 238617, BIRDS = 2831, FIRE_ICE = 457193, KHAN = 706216;

// ── the request ──────────────────────────────────────────────────────────────

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

test("the page takes its access and its row count from premium-gates, asks the loader for no more, and is the Premium wall", () => {
  const page = code(read("src/app/tools/demand/page.tsx"));
  assert.match(page, /from "@\/lib\/premium-gates"/);
  assert.match(page, /accessFor\("demand", who\.viewer\)/);
  assert.match(page, /rowLimit\("demand", gate, who\.viewer\)/);
  assert.match(page, /getTopDemand\(query\.days, who,/);
  assert.match(page, /visibleDemandRows\(result, access, list\)/);
  assert.match(page, /<PlanButton surface=\{FEATURE_RULES\.demand\.surface\} tier="premium"/);
  assert.doesNotMatch(page, /isPremium\(|tierOf\(/, "the tier is decided in the gate module and the loader, never in the page");
  const movers = code(read("src/app/movers/page.tsx"));
  assert.match(movers, /getDemandStrip\(\)/, "/movers is the free strip: the clear slice, no entitlement");
  assert.doesNotMatch(movers, /getTopDemand/);
});

// ── chart movement ───────────────────────────────────────────────────────────

const row = (cardId: number, searches: number, views = 0) => ({ cardId, searches, views });

test("ties rank the same way every load: metric, then the other metric, then card id", () => {
  const rows = [row(BIRDS, 5, 1), row(SOL, 5, 1), row(COUNTERSPELL, 5, 9), row(FIRE_ICE, 0, 50)];
  assert.deepEqual(rows.sort(compareDemand("searches")).map((r) => r.cardId), [COUNTERSPELL, BIRDS, SOL, FIRE_ICE]);
  assert.deepEqual(rankBy(rows, "searches").get(BIRDS), 2, "equal searches and views: the lower product id first");
  assert.equal(rankBy(rows, "searches").has(FIRE_ICE), false, "no searches, no rank on that chart");
  assert.equal(rankBy(rows, "views").get(FIRE_ICE), 1);
});

test("movement: up and down by places, held, and new when the card had no rank before", () => {
  assert.deepEqual(movementFor(3, 10), { kind: "up", by: 7, prev: 10 });
  assert.deepEqual(movementFor(10, 3), { kind: "down", by: 7, prev: 3 });
  assert.deepEqual(movementFor(4, 4), { kind: "same", by: 0, prev: 4 });
  assert.deepEqual(movementFor(1, undefined), { kind: "new" });
  const prev = [row(SOL, 9), row(BIRDS, 8), row(COUNTERSPELL, 1)];
  const m = chartMovement([BIRDS, SOL, KHAN], prev, "searches");
  assert.deepEqual(m.get(BIRDS), { kind: "up", by: 1, prev: 2 });
  assert.deepEqual(m.get(SOL), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get(KHAN), { kind: "new" });
  assert.deepEqual(movementFromRanks([FIRE_ICE, KHAN], new Map([[KHAN, 1]])).get(KHAN), { kind: "down", by: 1, prev: 1 });
});

test("the whole previous field is ranked, so #73 to #40 reads as +33, not new", () => {
  const prev = Array.from({ length: 80 }, (_, i) => row(1000 + i, 1000 - i));
  const m = chartMovement([1072], prev, "searches");
  assert.deepEqual(m.get(1072), { kind: "up", by: 72, prev: 73 });
});

// ── snapshot arithmetic ──────────────────────────────────────────────────────

const day = (d: string, p: Record<string, [number, number]>): DemandDayFile => ({ v: 1, day: d, p });

test("a day snapshot keeps only cards with activity, the busiest DEMAND_DAY_CARDS of them", () => {
  const f = buildDemandDay("2026-10-01", [{ id: SOL, searchCount: 3, viewCount: 0 }, { id: BIRDS, searchCount: 0, viewCount: 0 }, { id: COUNTERSPELL, searchCount: 0, viewCount: 4 }]);
  assert.deepEqual(f, { v: 1, day: "2026-10-01", p: { [SOL]: [3, 0], [COUNTERSPELL]: [0, 4] } });
  const many = buildDemandDay("2026-10-01", Array.from({ length: DEMAND_DAY_CARDS + 50 }, (_, i) => ({ id: i + 1, searchCount: i + 1, viewCount: 0 })));
  assert.equal(Object.keys(many.p).length, DEMAND_DAY_CARDS);
  assert.ok(many.p[String(DEMAND_DAY_CARDS + 50)] && !many.p["1"], "the busiest stay, the quietest go");
});

test("day arithmetic is UTC and whole days", () => {
  assert.equal(dayMinus("2026-03-01", 1), "2026-02-28");
  assert.equal(dayMinus("2026-10-04", 7), "2026-09-27");
  assert.equal(daysBetween("2026-09-27", "2026-10-04"), 7);
  assert.equal(latestDayAtOrBefore(["2026-09-01", "2026-09-20", "2026-10-01"], "2026-09-25"), "2026-09-20");
  assert.equal(latestDayAtOrBefore(["2026-10-01"], "2026-09-25"), null);
});

test("a window is today's totals minus the baseline's; a card new since the baseline counts in full; a reset never goes negative", () => {
  const rows = diffTotals({ [SOL]: [10, 5], [BIRDS]: [4, 4], [COUNTERSPELL]: [2, 0], [FIRE_ICE]: [1, 1] }, { [SOL]: [4, 5], [BIRDS]: [9, 9], [FIRE_ICE]: [1, 1] });
  const by = Object.fromEntries(rows.map((r) => [r.cardId, [r.searches, r.views]]));
  assert.deepEqual(by, { [SOL]: [6, 0], [COUNTERSPELL]: [2, 0] }, "Birds reset backwards and Fire // Ice did not move: neither has window activity");
  assert.deepEqual(diffTotals({ junk: [5, 5], "0": [1, 1] } as never, {}), [], "a key that is no product id is ignored");
});

test("demandWindowOrThrow reports the REAL coverage, with the previous period when asked", async () => {
  const files: Record<string, DemandDayFile> = {
    "2026-09-13": day("2026-09-13", { [SOL]: [1, 0] }),
    "2026-09-27": day("2026-09-27", { [SOL]: [5, 1], [BIRDS]: [2, 0] }),
  };
  const deps = { days: Object.keys(files), live: { [SOL]: [9, 2], [BIRDS]: [2, 0], [COUNTERSPELL]: [3, 0] } as Record<string, [number, number]>, readDay: async (d: string) => files[d] ?? null, today: "2026-10-04" };
  const w = await demandWindowOrThrow(7, deps, { previous: true });
  assert.equal(w.baselineDay, "2026-09-27");
  assert.equal(w.coveredDays, 7);
  assert.deepEqual(w.rows.map((r) => [r.cardId, r.searches]).sort(), [[COUNTERSPELL, 3], [SOL, 4]].sort());
  assert.equal(w.previous?.startDay, "2026-09-13");
  assert.deepEqual(w.previous?.rows.map((r) => [r.cardId, r.searches]).sort(), [[SOL, 4], [BIRDS, 2]].sort());
  // A 30-day window has no snapshot old enough: empty, never a shorter window under a longer label.
  const w30 = await demandWindowOrThrow(30, deps);
  assert.equal(w30.baselineDay, null);
  assert.equal(w30.rows.length, 0);
  assert.equal(w30.totalDays, 2);
});

test("a failed read THROWS (so the cache never stores it as 'no demand'); only the display-only form swallows it", async () => {
  const deps = { days: ["2026-09-27"], live: { [SOL]: [1, 0] } as Record<string, [number, number]>, readDay: async (): Promise<DemandDayFile | null> => { throw new Error("connection refused"); }, today: "2026-10-04" };
  await assert.rejects(demandWindowOrThrow(7, deps), /connection refused/);
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
  const as = demandAsOf([day("2026-10-01", { [SOL]: [10, 2], [BIRDS]: [1, 1] }), day("2026-10-03", { [SOL]: [30, 6] }), day("2026-10-09", { [SOL]: [99, 9] })], "2026-10-03", 21);
  assert.equal(as[SOL]!.searchCount, 30, "a day after asOf is ignored");
  assert.equal(as[SOL]!.velocity?.searchPerDay, 10);
  assert.equal(as[BIRDS]!.velocity, null, "one snapshot: no velocity");
});

// ── the window as a ranking, and the daily recorder ───────────────────────────────

test("rankDemandWindow: both lists, ties by the other metric, movement against the previous period, honest coverage", async () => {
  const files: Record<string, DemandDayFile> = {
    "2026-09-13": day("2026-09-13", { [SOL]: [1, 0], [BIRDS]: [1, 0] }),
    "2026-09-27": day("2026-09-27", { [SOL]: [5, 1], [BIRDS]: [3, 0], [COUNTERSPELL]: [1, 1] }),
  };
  const w = await demandWindowOrThrow(7, { days: Object.keys(files), live: { [SOL]: [9, 2], [BIRDS]: [13, 5], [COUNTERSPELL]: [4, 9], [KHAN]: [2, 2] }, readDay: async (d) => files[d] ?? null, today: "2026-10-04" }, { previous: true });
  const r = rankDemandWindow(w);
  assert.deepEqual(r.bySearch.map((x) => [x.cardId, x.searches, x.views]), [[BIRDS, 10, 5], [SOL, 4, 1], [COUNTERSPELL, 3, 8], [KHAN, 2, 2]]);
  assert.deepEqual(r.byView.map((x) => x.cardId), [COUNTERSPELL, BIRDS, KHAN, SOL]);
  assert.deepEqual(r.bySearch[0]!.move, { kind: "up", by: 1, prev: 2 }, "Birds of Paradise was second on the previous chart (Sol Ring 4, Birds 2)");
  assert.deepEqual(r.bySearch[2]!.move, { kind: "same", by: 0, prev: 3 }, "Counterspell: third then (1 search), third now");
  assert.deepEqual(r.bySearch[3]!.move, { kind: "new" }, "the card nobody searched in the previous period is NEW");
  assert.deepEqual([r.windowUsable, r.coveredDays, r.totalDays, r.previous?.startDay], [true, 7, 2, "2026-09-13"]);
  const none = rankDemandWindow({ rows: [], baselineDay: null, coveredDays: null, totalDays: 1 });
  assert.deepEqual([none.windowUsable, none.bySearch, none.byView, none.previous], [false, [], [], null]);
});

function fakeStore(counters: { id: number; searchCount: number; viewCount: number }[], days: string[]): DemandStore & { written: DemandDayFile[]; prunedBefore: string[] } {
  const store = {
    written: [] as DemandDayFile[], prunedBefore: [] as string[],
    counters: async () => counters, days: async () => [...days, ...store.written.map((f) => f.day)], readDay: async () => null,
    writeDay: async (f: DemandDayFile) => { store.written.push(f); }, pruneBefore: async (d: string) => { store.prunedBefore.push(d); return 3; },
  };
  return store;
}
test("recordDemandDay writes today's running totals once and prunes the old rows", async () => {
  const store = fakeStore([{ id: SOL, searchCount: 40, viewCount: 90 }, { id: BIRDS, searchCount: 0, viewCount: 0 }], ["2026-10-06"]);
  const r = await recordDemandDay(store, "2026-10-07");
  assert.deepEqual(store.written.map((f) => [f.day, f.p]), [["2026-10-07", { [SOL]: [40, 90] }]]);
  assert.deepEqual(store.prunedBefore, [dayMinus("2026-10-07", DEMAND_KEEP_DAYS)]);
  assert.deepEqual(r, { day: "2026-10-07", cards: 1, snapshotDays: 2, pruned: 3 });
});

// ── egress and privacy shape ─────────────────────────────────────────────────────────────

test("getTopDemand: the viewer is looked at first, below Premium it reads the clear slice and never Neon, and a failure is an empty result outside the cache", () => {
  const d = code(readDataModule("demand"));
  const fn = /export async function getTopDemand[\s\S]*?\n\}\n/.exec(d)?.[0] ?? "";
  assert.match(fn, /const access = accessOf\("demand", who\)/);
  assert.match(fn, /if \(access !== "full"\)[\s\S]*readDemandPreview\(\)[\s\S]*return/, "the clear slice for everyone below full");
  assert.match(fn, /try \{[\s\S]*\} catch \{[\s\S]*failed|catch \{\s*return emptyDemand\(/, "a failed read is an empty result outside the cache");
  assert.match(d, /rankKey\("demand-v1", ref, window\)/, "tier-neutral key: the data commit and the window, never the viewer");
  const cached = /unstable_cache\(async \(\) => rankDemandWindow\(await readDemandWindow\(window, true\)\),[^)]*\)/.exec(fn)?.[0] ?? "";
  assert.ok(cached, "the cache holds the ranking of a Neon window");
  assert.doesNotMatch(cached, /who\b|getDataRef|getCardsByIds|fetch\(|planeJson|getTopDemand/, "nothing in the cache callback reads the plane, a loader or the viewer");
  assert.doesNotMatch(d, /who\.tier|=== "premium"/, "the tier is never compared here");
});

test("the counters are Neon rows, never files: DemandDay and CardStat exist, no demand table of the old kind, and the snapshot module stays pure", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model DemandDay \{/);
  assert.match(schema, /model CardStat \{/);
  assert.doesNotMatch(schema, /model DemandSnapshot/);
  assert.doesNotMatch(code(read("src/lib/demand-snapshot.ts")), /prisma|@\/lib\/db|from "\.\/db"/, "the snapshot module is pure");
  assert.match(read("scripts/publish-demand.ts"), /recordDemandDay\(store/);
  assert.doesNotMatch(read("scripts/import.ts"), /recordToolsHistory|tools-history|history-store/, "the importer reads nothing from Neon and writes no demand file");
});
