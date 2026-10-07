import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRY_LIST, type Country } from "../src/lib/country";
import { usdCentsToCountry } from "../src/lib/fx";
import {
  assembleRisingCards,
  buildRiseFile,
  growthSpanLabel,
  parseRiseScope,
  riseInputsFor,
  weeklySeries,
  MAX_WEEKS,
  RISE_SCOPES,
  SCAN,
  type RiseHistory,
  type RiseInputs,
  type UniverseCard,
} from "../src/lib/rise-predictor";
import type { DemandDayFile } from "../src/lib/demand-snapshot";
import type { Point } from "../src/lib/history";

// ─────────────────────────────────────────────────────────────────────────────
// Rising Cards (RiftCompare's tests/rising-cards.test.ts and
// rising-diagnostics.test.ts, for OP Compare): the pure assembly driven with
// synthetic inputs — no database — plus the page's access split and the egress
// shape (one cached feed, an uncached in-process assembly).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = "src/app/tools/rising/page.tsx";
const ADMIN = "src/app/admin/rising/page.tsx";

const DAY = 86400_000;
const eday = (m: number, d: number) => Math.round(Date.UTC(2026, m - 1, d) / DAY);
const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null } as Record<Country, number | null>;
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 } as Record<Country, number>;

function card(id: string, over: Partial<UniverseCard> & { lowIn?: Partial<Record<Country, number>>; storesIn?: Partial<Record<Country, number>> } = {}): UniverseCard {
  const { lowIn, storesIn, ...rest } = over;
  return {
    id, slug: `card-${id}`, name: `Card ${id}`, setCode: "OP01", number: "OP01-001", variant: null, hasImage: false, imageThumbUrl: null,
    searchCount: 100, viewCount: 10, marketUsd: null,
    low: { ...NONE, ...lowIn }, stores: { ...ZERO, ...storesIn },
    ...rest,
  };
}
const inputs = (universe: UniverseCard[], over: Partial<RiseInputs> = {}): RiseInputs => ({ universe, supply: {}, velocity: {}, snapshotDays: 30, ...over });
const history = (series: RiseHistory["series"]): RiseHistory => ({ series });

test("the scope parser accepts every COUNTRY_LIST market, any case, plus Global", () => {
  for (const c of COUNTRY_LIST) {
    assert.equal(parseRiseScope(c.code, "GLOBAL"), c.code);
    assert.equal(parseRiseScope(c.code.toLowerCase(), "GLOBAL"), c.code);
  }
  assert.equal(parseRiseScope("global", "US"), "GLOBAL");
  assert.deepEqual([...RISE_SCOPES].sort(), ["GLOBAL", ...COUNTRY_LIST.map((c) => c.code)].sort());
  for (const junk of [undefined, null, "", "NZ", "toString", "gl0bal"]) assert.equal(parseRiseScope(junk, "AU"), "AU");
});

test("the tool defaults to the visitor's market; the admin page to Global", () => {
  assert.match(code(PAGE), /parseRiseScope\(searchParams\.scope, country\)/);
  assert.match(code(ADMIN), /parseRiseScope\(searchParams\.country, "GLOBAL"\)/);
});

test("Global picks carry their own basis market's currency (US first), and the page renders it", () => {
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("us", { lowIn: { US: 1000, AU: 1700 }, searchCount: 500 }), card("au", { lowIn: { AU: 1500 } }), card("eu", { lowIn: { EU: 900 } })]),
    history({}),
    Date.UTC(2026, 9, 20),
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.deepEqual([by.get("us")!.currency, by.get("us")!.priceCents], ["USD", 1000], "OP Compare's home market first");
  assert.deepEqual([by.get("au")!.currency, by.get("au")!.priceCents], ["AUD", 1500]);
  assert.deepEqual([by.get("eu")!.currency, by.get("eu")!.priceCents], ["EUR", 900]);
  assert.match(code(PAGE), /formatMoney\(p\.priceCents, p\.currency\)/);
});

test("a single market prices the row from Card.low there, and the series and today's point in its currency", () => {
  const c = card("x", { lowIn: { AU: 1800 }, marketUsd: 1100 });
  const p = assembleRisingCards("AU", inputs([c]), history({ x: [[eday(10, 7), 1000], [eday(10, 14), 1000]] }), Date.UTC(2026, 9, 20)).picks[0];
  assert.equal(p.currency, "AUD");
  assert.equal(p.priceCents, 1800, "the Price column is AU's own cheapest listing");
  assert.deepEqual(p.spark, [usdCentsToCountry(1000, "AU"), usdCentsToCountry(1000, "AU"), usdCentsToCountry(1100, "AU")], "the GLOBAL basis is marketUsd, converted");
});

test("today's market price is the newest point, and 'vs last week' reads the point nearest 7 days back", () => {
  const c = card("x", { lowIn: { US: 990 }, marketUsd: 990 });
  const series = { x: [[eday(9, 9), 1300], [eday(9, 16), 1300], [eday(9, 23), 1000], [eday(9, 30), 1000], [eday(10, 7), 1000], [eday(10, 14), 900]] as [number, number][] };
  const p = assembleRisingCards("GLOBAL", inputs([c]), history(series), Date.UTC(2026, 9, 20, 12)).picks[0];
  assert.deepEqual(p.spark, [1300, 1300, 1000, 1000, 1000, 900, 990]);
  assert.equal(p.vsLastWeekPct, 10);
  assert.equal(p.priceSignals, true);
});

test("with enough weekly points the price signals switch on; without, a card is ranked on demand and supply and says so", () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("x", { lowIn: { US: 1000 }, marketUsd: 1000 }), card("y", { lowIn: { US: 500 } })]),
    history({ x: [[eday(9, 30), 1400], [eday(10, 7), 1300], [eday(10, 14), 1200], [eday(10, 21), 1100]] }),
    now,
  );
  const x = a.picks.find((q) => q.id === "x")!;
  assert.equal(x.priceSignals, true);
  assert.equal(x.posPct, 0);
  assert.match(x.reason, /^Near the low of its 4-week range/);
  assert.equal(a.qualifying, 1);
  assert.equal(a.withAnyHistory, 1, "withAnyHistory counts cards with ANY recorded series");
  assert.equal(a.deepestSeries, 5);

  const b = assembleRisingCards(
    "US",
    inputs([card("popular", { lowIn: { US: 1000 }, searchCount: 5000 }), card("quiet", { lowIn: { US: 1000 }, searchCount: 20 }), card("mid", { lowIn: { US: 1000 }, searchCount: 400 })], {
      supply: { popular: 2, quiet: 2, mid: 2 },
    }),
    history({}),
    now,
  );
  assert.deepEqual(b.picks.map((p) => p.id), ["popular", "mid", "quiet"]);
  for (const p of b.picks) {
    assert.deepEqual([p.components.room, p.components.momentum, p.components.volatility], [0, 0, 0]);
    assert.equal(p.posPct, 0.5);
    assert.equal(p.confidence, "Low");
    assert.match(p.reason, /^Not enough weekly prices yet to judge its range, ranked on demand and supply · .*2 stores in stock in US$/);
  }
});

test("search growth is quoted over the span the snapshots really cover, never over a few days", () => {
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("nine", { lowIn: { US: 1000 } }), card("two", { lowIn: { US: 1000 } }), card("none", { lowIn: { US: 1000 } })], {
      supply: { nine: 1, two: 1, none: 0 },
      velocity: {
        nine: { searchPerDay: 4, viewPerDay: 1, searchGrowthPct: 30, spanDays: 9, points: 9 },
        two: { searchPerDay: 50, viewPerDay: 1, searchGrowthPct: 400, spanDays: 2, points: 3 },
      },
    }),
    history({}),
    Date.UTC(2026, 8, 25, 12),
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.match(by.get("nine")!.reason, /searches \+30% in 9 days · /);
  assert.doesNotMatch(by.get("two")!.reason, /%/);
  assert.match(by.get("two")!.reason, /50 searches a day/);
  assert.match(by.get("none")!.reason, /100 searches all-time · no store has it in stock$/);
  assert.deepEqual([growthSpanLabel(21), growthSpanLabel(7), growthSpanLabel(9), growthSpanLabel(14, true)], ["3 weeks", "1 week", "9 days", "2 wk"]);
});

test("the universe is the most-searched cards PRICED in the scope; supply is that market's stores, Global sums them", () => {
  const searched = [
    card("a", { searchCount: 900, lowIn: { UK: 500 }, storesIn: { UK: 3, US: 2 } }),
    card("b", { searchCount: 800, lowIn: { US: 700 }, storesIn: { US: 4 } }),
    card("c", { searchCount: 0, lowIn: { UK: 100 } }),
  ];
  const uk = riseInputsFor("UK", searched, {}, 5);
  assert.deepEqual(uk.universe.map((c) => c.id), ["a"], "unpriced in the UK, or never searched, is out");
  assert.deepEqual(uk.supply, { a: 3 });
  const g = riseInputsFor("GLOBAL", searched, {}, 5);
  assert.deepEqual(g.universe.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(g.supply, { a: 5, b: 4 });
  assert.equal(SCAN, 400);
});

test("an empty universe is an empty analysis, not a failure", () => {
  const a = assembleRisingCards("SG", inputs([]), history({}), Date.now());
  assert.deepEqual([a.picks, a.failed, a.scope], [[], false, "SG"]);
});

test("rising.json: one point a week (the week's lowest market price) over 120 days, at most 18 weeks", () => {
  const pts: Point[] = [
    [20260601, 900, 800], // outside 120 days of 2026-10-20
    [20260929, 1200, 1100],
    [20260930, 1100, 1000], // same week as 09-29: the lower market price wins
    [20261006, null, 900], // no market price: not a point
    [20261013, 1000, 950],
  ];
  assert.deepEqual(weeklySeries(pts, "2026-10-20"), [
    [eday(9, 30), 1100],
    [eday(10, 13), 1000],
  ]);
  const long: Point[] = Array.from(
    { length: 30 },
    (_, i) => [Number(new Date(Date.UTC(2026, 9, 20) - i * 7 * DAY).toISOString().slice(0, 10).replace(/-/g, "")), 1000 + i, null] as Point,
  );
  assert.equal(weeklySeries(long, "2026-10-20").length, MAX_WEEKS);
});

test("rising.json carries velocity now and demand a week ago for the feed's cards only", () => {
  const f = (day: string, p: DemandDayFile["p"]): DemandDayFile => ({ v: 1, day, p });
  const files = [f("2026-10-01", { "1": [10, 5], "2": [3, 1] }), f("2026-10-10", { "1": [20, 9], "2": [4, 1] }), f("2026-10-20", { "1": [50, 20], "2": [9, 2], "3": [1, 0] })];
  const rise = buildRiseFile("2026-10-20", new Map([["1", [[20261013, 1000, null]] as Point[]]]), files, 3, new Set(["1", "2"]));
  assert.deepEqual(Object.keys(rise.series), ["1"]);
  assert.deepEqual(Object.keys(rise.velocity).sort(), ["1", "2"]);
  assert.equal(rise.velocity["1"].searchPerDay, Math.round(((50 - 10) / 19) * 100) / 100);
  assert.equal(rise.weekAgo?.asOf, "2026-10-13");
  assert.equal(rise.weekAgo?.cards["1"].searchCount, 20, "the totals on its last snapshot on or before that day");
  assert.equal(rise.weekAgo?.cards["3"], undefined, "a card outside the feed is not carried");
  assert.equal(rise.snapshotDays, 3);
  assert.equal(buildRiseFile("2026-10-20", new Map(), [f("2026-10-19", {})], 1).weekAgo, null, "no snapshot a week back: no week-ago ranking");
});

test("access: signed out sees no pick, a free or Plus account the top FREE_RISING_ROWS, Premium every row", () => {
  const src = code(PAGE);
  assert.match(src, /const premium = isPremium\(user, "premium"\);/, "the Premium minimum (owner, 2026-10-07)");
  assert.match(src, /const access: "full" \| "top3" \| "none" = premium \? "full" : user \? "top3" : "none";/);
  assert.match(src, /const FREE_PREVIEW_ROWS = FREE_RISING_ROWS;/);
  assert.match(src, /analysis\.picks\.slice\(0, FREE_PREVIEW_ROWS\)/);
  assert.match(src, /<PlanButton tier="premium" surface="gate:rising" \/>/);
  assert.doesNotMatch(src, /backtested|validated|invest/i);
  assert.doesNotMatch(src, /email/i, "email is off: nothing promises one");
});

test("a failed load reads 'temporarily unavailable', never 'no price history yet'", () => {
  const src = code(PAGE);
  assert.match(src, /analysis\.failed \?/);
  assert.match(src, /Rising Cards is temporarily unavailable/);
});

test("the feed is one cached loader keyed on the history ref; the assembly is uncached and never nested", () => {
  const data = read("src/lib/data.ts");
  const feed = data.slice(data.indexOf("const getRiseFeed = unstable_cache("), data.indexOf("async function riseParts"));
  assert.match(feed, /historyFileAtOrThrow<RiseFile>\(ref, "rising\.json"\)/);
  assert.doesNotMatch(feed, /getCatalog\(|getHistoryRef\(|getCachedRisingCards\(/, "no loader inside the cached callback");
  const entry = data.slice(data.indexOf("export function getCachedRisingCards"), data.indexOf("export async function getRisingWeekAgo"));
  assert.doesNotMatch(entry, /unstable_cache/);
  assert.match(entry, /\.catch\(/, "a failure is caught outside the cache");
  assert.doesNotMatch(read("src/lib/rise-predictor.ts"), /from "\.\/db"|unstable_cache/, "the predictor is pure");
});
