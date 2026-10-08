// Price history: the series maths of src/lib/history.ts (owner WP01a; OP's file merged with the v3 codec). Public history lives in the PRIVATE data repository as files, never in Postgres
// (contract 2.10 and 12); the v4 codec, the daily append and the weekly closes are pinned by tests/plane-history.test.ts. Here: day numbers, a day's point, the 7/30 day change, the 90 day high, the
// index chain, the chart window, the v1/v2 points, the v3 files, and the fact that no request path reads history from a table.
// The market cents are Lightning Bolt's real TCGplayer market prices of 2026-10-07 in five printings (Magic 2010 $1.87, Double Masters 2022 $2.16, Revised $2.30, Fourth Edition $2.58, Unlimited
// $23.31): a series needs several days and TCGCSV gives us today, so the printings stand in for successive days. Only the arithmetic is under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HISTORY_MARKETS, KEEP_DAYS, POINT_LEN, addDays, changeOver, chartSeries, dayIso, dayNum, daysBetween, decodeBucket, encodeBucket, highOver, nextIndex, normPoint, withPoint, type BucketFile, type Point } from "../src/lib/history";
import { histBucket, tailBucket } from "../src/lib/data/plane/shards";
import { unitKey } from "../src/lib/constants";

const M10 = 187, DM22 = 216, REVISED = 230, FOURTH = 258, UNLIMITED = 2331;
const ROOT = path.resolve(__dirname, "..");

test("day numbers are YYYYMMDD integers; dates add and subtract across months, years and leap days", () => {
  assert.equal(dayNum("2026-10-03"), 20261003);
  assert.equal(dayNum("2026-10-03T08:00:00Z"), 20261003, "only the date part counts");
  assert.equal(dayIso(20261003), "2026-10-03");
  assert.equal(addDays(20261003, -7), 20260926);
  assert.equal(addDays(20260301, -1), 20260228);
  assert.equal(addDays(20240301, -1), 20240229);
  assert.equal(addDays(20261231, 1), 20270101);
  assert.equal(daysBetween(20260926, 20261003), 7);
  assert.equal(daysBetween(20261231, 20270101), 1);
  assert.equal(daysBetween(20261003, 20261003), 0);
  assert.equal(KEEP_DAYS, 730);
});

test("a day's point replaces the same day, the series stays sorted, and old points age out after 730 days", () => {
  let s: Point[] = withPoint(undefined, [20261001, M10, null]);
  s = withPoint(s, [20261002, DM22, null]);
  s = withPoint(s, [20261002, REVISED, null]);                    // a second import the same day
  assert.deepEqual(s, [[20261001, M10, null], [20261002, REVISED, null]]);
  assert.deepEqual(withPoint(s, [20291001, FOURTH, null], 730).map((p) => p[0]), [20291001], "three years later nothing older than 730 days is left");
  assert.deepEqual(withPoint([[20261003, FOURTH, null]], [20261001, M10, null]).map((p) => p[0]), [20261001, 20261003], "a late point sorts into place");
});

test("7- and 30-day changes use the latest price 7–11 / 30–34 days back, in percent with one decimal", () => {
  const s: Point[] = [[20260920, M10, null], [20260925, REVISED, null], [20261003, FOURTH, null]];
  assert.equal(changeOver(s, 20261003, 7), 12.2, "against 2026-09-25 (8 days back, inside the window): $2.30 to $2.58");
  assert.equal(changeOver(s, 20261003, 30), null, "nothing 30–34 days back");
  assert.equal(changeOver([[20261003, FOURTH, null]], 20261003, 7), null, "no earlier point");
  assert.equal(changeOver([[20260926, UNLIMITED, null], [20261003, FOURTH, null]], 20261003, 7), -88.9, "Unlimited to Fourth Edition");
  assert.equal(changeOver([[20260920, REVISED, null]], 20261003, 7), null, "no point today");
  assert.equal(changeOver([[20260926, 0, null], [20261003, FOURTH, null]], 20261003, 7), null, "a zero price is no baseline");
  assert.equal(changeOver([[20260920, M10, null], [20260926, DM22, null], [20261003, FOURTH, null]], 20261003, 7), 19.4, "the LATEST point inside the window wins: $2.16, not $1.87");
});

test("90-day high is the highest market in the last 90 days", () => {
  const s: Point[] = [[20260601, UNLIMITED, null], [20260801, FOURTH, null], [20261003, REVISED, null]];
  assert.equal(highOver(s, 20261003, 90), FOURTH);
  assert.equal(highOver(s, 20261003, 200), UNLIMITED);
  assert.equal(highOver([], 20261003), null);
  assert.equal(highOver([[20261003, null, null]], 20261003), null);
});

test("the index is chained over the units priced on both days, 1,000 on day one, unchanged on a day with no pairs", () => {
  const first = nextIndex(null, [], 5000, 10, "2026-10-01");
  assert.deepEqual(first, { day: "2026-10-01", value: 1000, totalUsd: 5000, cardCount: 10 });
  const second = nextIndex(first, [[FOURTH, REVISED], [UNLIMITED, 2300]], 5300, 11, "2026-10-02");
  assert.equal(second.value, 1023.32, "(258 + 2331) / (230 + 2300) of 1,000");
  assert.equal(nextIndex(second, [], 0, 0, "2026-10-03").value, 1023.32);
  assert.equal(nextIndex(first, [], 3_000_000_000, 1, "2026-10-02").totalUsd, 2_000_000_000, "the total is capped");
});

test("the chart shows the last year; v1 points read as US only and v2 points carry every market's low", () => {
  const s: Point[] = [[20250101, M10, M10], [20261001, FOURTH, null]];
  assert.deepEqual(chartSeries(s, 20261003, 365), [{ day: "2026-10-01", marketUsd: FOURTH, lowUsd: null, lows: [null, null, null, null, null, null] }]);
  const v1: Point[] = [[20261001, REVISED, 104]];
  assert.deepEqual(chartSeries(v1, 20261003, 30)[0]!.lows, [104, null, null, null, null, null]);
  const v2: Point[] = [[20261002, FOURTH, 94, 140, 70, null, 120, 85]];
  const c = chartSeries(v2, 20261003, 30)[0]!;
  assert.deepEqual(c.lows, [94, 140, 70, null, 120, 85]);
  assert.equal(c.lowUsd, 94);
  assert.equal(normPoint([1, 2, 3]).length, POINT_LEN);
  assert.equal(normPoint([1, 2, 3, 4, 5, 6, 7, 8]).length, POINT_LEN);
  assert.deepEqual(HISTORY_MARKETS, ["US", "AU", "UK", "SG", "CA", "EU"]);
  assert.deepEqual(chartSeries(undefined, 20261003), []);
});

test("a day's v2 point replaces a v1 point of the same day and mixed series stay sorted", () => {
  let s: Point[] = [[20261001, M10, 90]];
  s = withPoint(s, [20261001, DM22, 95, 150, null, null, null, null]);
  s = withPoint(s, [20260930, REVISED, 92]);
  assert.deepEqual(s.map((p) => p[0]), [20260930, 20261001]);
  assert.equal(s[1]!.length, 8);
  assert.equal(s[1]![1], DM22);
});

test("v3 files: a unit's series is [start day, one cent value per calendar day]; a gap is null, only the market survives, the series is cut to its first and last priced day", () => {
  const key = unitKey(2831, "N");
  const file: BucketFile = { v: 2, p: { [key]: [[20261001, 2289, 1749, null, null, null, null, null], [20261003, 2301, 1800, null, null, null, null, null], [20261004, 2290, null, null, null, null, null, null]] } };
  const enc = encodeBucket(file);
  assert.deepEqual(enc, { v: 3, p: { [key]: [20261001, 2289, null, 2301, 2290] } }, "the 2nd of October has no price");
  const back = decodeBucket(enc);
  assert.deepEqual(back.p[key]!.map((p) => [p[0], p[1]]), [[20261001, 2289], [20261003, 2301], [20261004, 2290]], "a null day is dropped on the way back");
  assert.ok(back.p[key]!.every((p) => p.length === POINT_LEN && p.slice(2).every((x) => x === null)), "lows are not kept in v3");
  assert.deepEqual(encodeBucket({ v: 2, p: { [key]: [[20261001, null, 5, null, null, null, null, null]] } }), { v: 3, p: {} }, "a unit with no market on any day is not written");
  assert.deepEqual(decodeBucket(null), { v: 2, p: {} });
  const v2: BucketFile = { v: 2, p: { "1": [[20261001, 100, null, null, null, null, null, null]] } };
  assert.equal(decodeBucket(v2), v2, "a v2 file (OP) passes through untouched");
  assert.equal(decodeBucket({ v: 3, p: { [key]: [20261001, null, null] } }).p[key], undefined, "nothing but nulls");
});

test("marketLows follows MARKETS order", async () => {
  const { marketLows } = await import("../src/lib/import");
  assert.deepEqual(marketLows({ lowUS: 1, lowAU: 2, lowUK: 3, lowSG: 4, lowCA: 5, lowEU: 6 }), [1, 2, 3, 4, 5, 6]);
});

test("the bucket of a unit moved to the plane: 64 ids a base file, 512 a tail file (the REMOVED bucketOf)", () => {
  assert.deepEqual([histBucket(0), histBucket(63), histBucket(64), histBucket(2831)], [0, 0, 1, 44]);
  assert.deepEqual([tailBucket(0), tailBucket(511), tailBucket(512), tailBucket(2831)], [0, 0, 1, 5]);
  const history = fs.readFileSync(path.join(ROOT, "src/lib/history.ts"), "utf8");
  assert.ok(!/export (const|function) (bucketOf|HISTORY_BUCKETS)\b/.test(history));
});

test("no request path reads history from Postgres: no history table in the schema, no database import in the history loaders, files from the data host", () => {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.doesNotMatch(schema, /model (PriceDay|IndexDay|PriceHistory|UnitHistory)\b/);
  const loaders = fs.readFileSync(path.join(ROOT, "src/lib/data/history.ts"), "utf8");
  assert.doesNotMatch(loaders, /@\/lib\/db|from "\.\.\/db"|PrismaClient|prisma\./);
  assert.match(loaders, /hist\/p/, "the base files");
  assert.match(loaders, /hist\/t/, "and the tail files of the plane");
  const source = fs.readFileSync(path.join(ROOT, "src/lib/data/plane/source.ts"), "utf8");
  assert.match(source, /raw\.githubusercontent\.com/);
});
