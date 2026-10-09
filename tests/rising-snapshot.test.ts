import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Country } from "../src/lib/country";
import { assembleRisingCards, weekAgoRanks, type RiseInputs, type UniverseCard } from "../src/lib/rise-predictor";
import { movementAgainst, weekAgoLabel } from "../src/lib/rising-movement";
import {
  chartStory,
  generateRisingSubtitle,
  generateRisingTitle,
  hotListName,
  isLegacySnapshot,
  rankedFromCount,
  toSnapshotData,
  weekMove,
  type RisingSnapshotData,
  type RisingSnapshotPick,
} from "../src/lib/rising-snapshot";
import type { Movement } from "../src/lib/demand-movement";

// ─────────────────────────────────────────────────────────────────────────────
// The Hot 40 snapshot and chart movement (RiftCompare's tests/rising-movement
// and rising-snapshot, for MTG Compare): the title is DERIVED from measured
// numbers and never overclaims; movement is against the ranking rebuilt a week
// earlier from the data, never against a stored snapshot.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pick = (id: number, over: Partial<RisingSnapshotPick> = {}): RisingSnapshotPick => ({
  id, slug: `card-${id}`, displayName: `Card ${id}`, setCode: "MH2", collectorNumber: "267", imageThumbUrl: null, score: 50, priceCents: 1000, currency: "USD",
  trend7: 0, trend30: 0, posPct: 0.5, listings: 3, spark: [1, 2], confidence: "Medium", vsLastWeekPct: null, priceSignals: true, ...over,
});
const data = (picks: RisingSnapshotPick[], over: Partial<RisingSnapshotData> = {}): RisingSnapshotData => ({
  scope: "US", generatedAt: "2026-10-04T08:00:00.000Z", picks, universeSize: 120, qualifying: 0, minPointsRequired: 4, version: 2, weekAgo: { asOf: "2026-09-27" }, ...over,
});
const NOW = new Date("2026-10-04T12:00:00Z");
const up = (prev: number, by: number): Movement => ({ kind: "up", by, prev });

test("the list is named for its real count: forty cards are the Hot 40, twelve the Hot 12", () => {
  assert.equal(hotListName(40), "MTG Compare Hot 40");
  assert.equal(hotListName(12), "MTG Compare Hot 12");
});

test("two payload shapes: legacy ranked the qualifying set, v2 ranks the universe and may have no weekly move", () => {
  assert.equal(isLegacySnapshot({ version: undefined }), true);
  assert.equal(isLegacySnapshot({ version: 2 }), false);
  assert.equal(rankedFromCount(data([pick(1)], { universeSize: 120, qualifying: 0 })), 120);
  assert.equal(rankedFromCount({ ...data([pick(1)], { version: undefined }), qualifying: 31 }), 31);
  assert.equal(weekMove(pick(1, { vsLastWeekPct: null, trend7: 0 })), null, "a v2 pick with nothing comparable is a dash, not 0.0%");
  assert.equal(weekMove(pick(1, { vsLastWeekPct: 7.5 })), 7.5);
  const legacy = { ...pick(1), trend7: 4.2 } as RisingSnapshotPick;
  delete legacy.vsLastWeekPct;
  assert.equal(weekMove(legacy), 4.2);
});

test("the title: a real move leads, then a range-low set-up, then breadth, then the bare fact", () => {
  assert.match(generateRisingTitle(data([pick(1, { displayName: "Sol Ring", vsLastWeekPct: 12.34 })]), NOW), /^MTG Compare Hot 1: Sol Ring is up 12\.3% this week \(US, 4 October 2026\)$/);
  assert.match(generateRisingTitle(data([pick(1, { posPct: 0.2 }), pick(2)]), NOW), /Card 1 leads 2 Magic cards near their range low/);
  assert.doesNotMatch(generateRisingTitle(data([pick(1, { posPct: 0.1, priceSignals: false }), pick(2)]), NOW), /range low/, "a neutral 0.5 says nothing");
  const breadth = data([pick(1), pick(2, { vsLastWeekPct: 2 }), pick(3, { vsLastWeekPct: 3 }), pick(4, { vsLastWeekPct: 1 })]);
  assert.match(generateRisingTitle(breadth, NOW), /3 of 4 cards gained ground this week/);
  assert.match(generateRisingTitle(data([pick(1), pick(2)]), NOW), /Card 1 tops the US ranking \(4 October 2026\)/);
  assert.equal(generateRisingTitle(data([]), NOW), "Magic rising cards — no ranked cards on 4 October 2026", "an empty run is never a 'Hot 0'");
});

test("the title never predicts: no 'will', no 'going to', no price targets", () => {
  for (const d of [data([pick(1, { vsLastWeekPct: 40 })]), data([pick(1, { posPct: 0.1 })]), data([pick(1)])]) {
    assert.doesNotMatch(generateRisingTitle(d, NOW), /\bwill\b|going to|guarantee|buy now/i);
  }
  assert.match(generateRisingSubtitle(data([pick(1)])), /A snapshot taken at one moment/);
  assert.match(generateRisingSubtitle(data([pick(1)])), /Ranked from the 120 most-searched priced cards in /);
});

test("the chart story: #1's fate first, then the one other movement most worth a headline", () => {
  const picks = (moves: (Movement | null)[]) => moves.map((m, i) => pick(i + 1, { move: m }));
  assert.equal(chartStory(picks([null, null])), null, "no movement, no chart story");
  assert.deepEqual(chartStory(picks([{ kind: "same", by: 0, prev: 1 }, null])), { lead: "Card 1 remains at #1", second: null });
  assert.equal(chartStory(picks([up(4, 3), null]))!.lead, "Card 1 climbs to #1 from #4");
  assert.equal(chartStory(picks([{ kind: "new" }, null]))!.lead, "Card 1 debuts at #1");
  // Into the top 3 beats a bigger climb lower down.
  const s = chartStory(picks([{ kind: "same", by: 0, prev: 1 }, null, up(9, 6), null, up(40, 30)]))!;
  assert.equal(s.second, "Card 3 moves into the top 3");
  // A fall of at least three places is the last resort.
  const f = chartStory(picks([{ kind: "same", by: 0, prev: 1 }, { kind: "down", by: 5, prev: 2 }]))!;
  assert.equal(f.second, "Card 2 falls 5 places to #2");
  // A small wobble is not a story.
  assert.equal(chartStory(picks([{ kind: "same", by: 0, prev: 1 }, { kind: "down", by: 1, prev: 1 }]))!.second, null);
});

test("a chart-story title falls back to the lead alone when the long form would be cut in a share preview", () => {
  const long = "A".repeat(60);
  const d = data([pick(1, { displayName: long, move: { kind: "same", by: 0, prev: 1 } }), pick(2, { displayName: long + "b", move: up(40, 38) }), pick(3, { move: null })]);
  const t = generateRisingTitle(d, NOW);
  assert.ok(t.length <= 150);
  assert.match(t, /remains at #1/);
});

// ── the week-ago ranking ─────────────────────────────────────────────────────

const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null } as Record<Country, number | null>;
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 } as Record<Country, number>;
const ucard = (id: number, searchCount: number): UniverseCard => ({
  id, slug: `c${id}`, name: `Card ${id}`, setCode: "MH2", number: "267", variant: null, hasImage: false, imageThumbUrl: null,
  searchCount, viewCount: 10, marketUsd: 1000, low: { ...NONE, US: 1000 }, stores: { ...ZERO, US: 3 },
});
const inputs = (universe: UniverseCard[]): RiseInputs => ({ universe, supply: {}, velocity: {}, snapshotDays: 30 });

test("weekAgoRanks re-ranks on that day's demand, drops cards not searched by then, and ranks the whole field", () => {
  const universe = [ucard(1, 900), ucard(2, 800), ucard(3, 700)];
  const past = {
    asOf: "2026-09-27",
    cards: { 1: { searchCount: 10, viewCount: 1, velocity: null }, 2: { searchCount: 500, viewCount: 1, velocity: null }, 3: { searchCount: 0, viewCount: 0, velocity: null } },
  };
  const w = weekAgoRanks("US", inputs(universe), { series: {} }, past, Date.UTC(2026, 9, 4))!;
  assert.equal(w.asOf, "2026-09-27");
  assert.deepEqual(w.ranks.map(([id]) => id).sort(), [1, 2], "card 3 had no searches a week ago, so it had no rank");
  assert.equal(weekAgoRanks("US", inputs(universe), { series: {} }, { asOf: "2026-09-27", cards: {} }, Date.UTC(2026, 9, 4)), null);
});

test("weekAgoRanks never uses today's price: it reads the series only up to that day", () => {
  const universe = [ucard(1, 900)];
  const day = (m: number, d: number) => Math.round(Date.UTC(2026, m - 1, d) / 86400_000);
  const series = { 1: [[day(9, 6), 1000], [day(9, 13), 1000], [day(9, 20), 1000], [day(9, 27), 1000], [day(10, 4), 9999]] as [number, number][] };
  const past = { asOf: "2026-09-27", cards: { 1: { searchCount: 100, viewCount: 5, velocity: null } } };
  assert.ok(weekAgoRanks("US", inputs(universe), { series }, past, Date.UTC(2026, 9, 4)));
});

test("movement against a week-ago ranking: climbs, falls, and 'new' for a card unranked then; none without one", () => {
  const weekAgo = { asOf: "2026-09-27", ranks: [[1, 1], [2, 2], [3, 3]] as [number, number][] };
  const m = movementAgainst([2, 1, 26], weekAgo)!;
  assert.deepEqual(m.get(2), { kind: "up", by: 1, prev: 2 });
  assert.deepEqual(m.get(1), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(m.get(26), { kind: "new" });
  assert.equal(movementAgainst([1], null), null);
  assert.equal(weekAgoLabel({ asOf: "2026-09-27" }), "27 September");
});

test("minting freezes each pick's move and the week-ago day, and never stores anything it can't draw", () => {
  const analysis = assembleRisingCards("US", inputs([ucard(1, 900), ucard(2, 800)]), { series: {} }, Date.UTC(2026, 9, 4));
  const weekAgo = { asOf: "2026-09-27", ranks: [[2, 1], [1, 2]] as [number, number][] };
  const snap = toSnapshotData(analysis, "US", NOW, weekAgo);
  assert.equal(snap.version, 2);
  assert.deepEqual(snap.weekAgo, { asOf: "2026-09-27" });
  assert.equal(snap.picks.length, analysis.picks.length);
  assert.ok(snap.picks.every((p) => p.move != null), "every pick carries its move");
  const bare = toSnapshotData(analysis, "US", NOW, null);
  assert.equal(bare.weekAgo, null);
  assert.ok(bare.picks.every((p) => p.move === null));
  assert.doesNotMatch(JSON.stringify(snap), /ebay/i, "the snapshot shows store prices only");
});

// ── the pages and routes ─────────────────────────────────────────────────────

test("the snapshot route is admin-only, POST, same-origin and logged; the public page is noindex and read through a loader", () => {
  const route = code("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(route, /requireAdminApi\(req, \{ mutation: true \}\)/);
  assert.match(route, /adminLog\(/);
  assert.doesNotMatch(route, /from "@\/lib\/db"/);
  const page = read("src/app/rising/[token]/page.tsx");
  assert.match(page, /index: false/, "a frozen share link stays out of search");
  assert.match(page, /getRisingSnapshot\(/);
  assert.doesNotMatch(page, /from "@\/lib\/db"/);
  assert.match(read("src/app/rising/[token]/opengraph-image.tsx"), /risingOg\(/);
});
