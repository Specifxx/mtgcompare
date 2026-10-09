// Rising Cards (RiftCompare's tests/rising-cards.test.ts and rising-diagnostics.test.ts, for MTG Compare): the pure assembly driven with synthetic inputs on real product ids and no database, the weekly closes (hist/w), the demand
// inputs, the page's access split and the shape of the loader (two tier-neutral caches, the clear slice below Premium). Who sees how many rows is premium-rising-gate.test.ts. Owner WP07.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRY_LIST, type Country } from "../src/lib/country";
import { usdCentsToCountry } from "../src/lib/fx";
import {
  assembleRisingCards,
  growthSpanLabel,
  parseRiseScope,
  riseInputsFor,
  weeklyPoints,
  MAX_WEEKS,
  RISE_SCOPES,
  SCAN,
  type RiseHistory,
  type RiseInputs,
  type UniverseCard,
} from "../src/lib/rise-predictor";
import type { DemandDayFile } from "../src/lib/demand-snapshot";
import { riseDemandFrom, riseEntryFrom, weeklyClosesOf } from "../src/lib/data/demand";
import { BrowseIndex } from "../src/lib/data/plane/browse-index";
import type { SetsFile, WeeklyFile } from "../src/lib/data/plane/formats";
import { PlaneError, type PlaneSource } from "../src/lib/data/plane/source";
import { readDataModule, realMiniTree } from "./helpers/data-source";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (p: string) => strip(read(p));
const PAGE = "src/app/tools/rising/page.tsx";
const ADMIN = "src/app/admin/rising/page.tsx";

const DAY = 86400_000;
const eday = (m: number, d: number) => Math.round(Date.UTC(2026, m - 1, d) / DAY);
const NONE = { US: null, AU: null, UK: null, SG: null, CA: null, EU: null } as Record<Country, number | null>;
const ZERO = { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 } as Record<Country, number>;
// real TCGplayer product ids of the fixtures: Sol Ring (babp), Birds of Paradise (7ed), Counterspell (mh2), Fire // Ice (dmr), Khan, Engineered Evil // Sheoldred (sds), Megatron (sld), Delver of Secrets (inr)
const SOL = 594545, BIRDS = 2831, COUNTERSPELL = 238617, FIRE_ICE = 457193, KHAN = 706216, MEGATRON = 456592, DELVER = 609611;

function card(id: number, over: Partial<UniverseCard> & { lowIn?: Partial<Record<Country, number>>; storesIn?: Partial<Record<Country, number>> } = {}): UniverseCard {
  const { lowIn, storesIn, ...rest } = over;
  return {
    id, slug: `card-${id}`, name: `Card ${id}`, setCode: "MH2", number: "267", variant: null, hasImage: false, imageThumbUrl: null,
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

test("the tool defaults to the visitor's market (only Premium may switch scope); the admin page to Global", () => {
  assert.match(code(PAGE), /access === "full" \? parseRiseScope\(searchParams\.scope, country\) : country/);
  assert.match(code(ADMIN), /parseRiseScope\(searchParams\.country, "GLOBAL"\)/);
});

test("Global picks carry their own basis market's currency (US first), and the page renders it", () => {
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card(SOL, { lowIn: { US: 1000, AU: 1700 }, searchCount: 500 }), card(BIRDS, { lowIn: { AU: 1500 } }), card(COUNTERSPELL, { lowIn: { EU: 900 } })]),
    history({}),
    Date.UTC(2026, 9, 20),
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.deepEqual([by.get(SOL)!.currency, by.get(SOL)!.priceCents], ["USD", 1000], "the US market first");
  assert.deepEqual([by.get(BIRDS)!.currency, by.get(BIRDS)!.priceCents], ["AUD", 1500]);
  assert.deepEqual([by.get(COUNTERSPELL)!.currency, by.get(COUNTERSPELL)!.priceCents], ["EUR", 900]);
  assert.match(code(PAGE), /formatMoney\(p\.priceCents, p\.currency\)/);
});

test("a single market prices the row from CardLite.low there, and the series and today's point in its currency", () => {
  const c = card(SOL, { lowIn: { AU: 1800 }, marketUsd: 1100 });
  const p = assembleRisingCards("AU", inputs([c]), history({ [SOL]: [[eday(10, 7), 1000], [eday(10, 14), 1000]] }), Date.UTC(2026, 9, 20)).picks[0];
  assert.equal(p.currency, "AUD");
  assert.equal(p.priceCents, 1800, "the Price column is AU's own cheapest listing");
  assert.deepEqual(p.spark, [usdCentsToCountry(1000, "AU"), usdCentsToCountry(1000, "AU"), usdCentsToCountry(1100, "AU")], "the GLOBAL basis is the market price, converted");
});

test("today's market price is the newest point, and 'vs last week' reads the point nearest 7 days back", () => {
  const c = card(BIRDS, { lowIn: { US: 990 }, marketUsd: 990 });
  const series = { [BIRDS]: [[eday(9, 9), 1300], [eday(9, 16), 1300], [eday(9, 23), 1000], [eday(9, 30), 1000], [eday(10, 7), 1000], [eday(10, 14), 900]] as [number, number][] };
  const p = assembleRisingCards("GLOBAL", inputs([c]), history(series), Date.UTC(2026, 9, 20, 12)).picks[0];
  assert.deepEqual(p.spark, [1300, 1300, 1000, 1000, 1000, 900, 990]);
  assert.equal(p.vsLastWeekPct, 10);
  assert.equal(p.priceSignals, true);
});

test("with enough weekly points the price signals switch on; without, a card is ranked on demand and supply and says so", () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card(BIRDS, { lowIn: { US: 1000 }, marketUsd: 1000 }), card(SOL, { lowIn: { US: 500 } })]),
    history({ [BIRDS]: [[eday(9, 30), 1400], [eday(10, 7), 1300], [eday(10, 14), 1200], [eday(10, 21), 1100]] }),
    now,
  );
  const x = a.picks.find((q) => q.id === BIRDS)!;
  assert.equal(x.priceSignals, true);
  assert.equal(x.posPct, 0);
  assert.match(x.reason, /^Near the low of its 4-week range/);
  assert.equal(a.qualifying, 1);
  assert.equal(a.withAnyHistory, 1, "withAnyHistory counts cards with ANY recorded series");
  assert.equal(a.deepestSeries, 5);

  const b = assembleRisingCards(
    "US",
    inputs([card(COUNTERSPELL, { lowIn: { US: 1000 }, searchCount: 5000 }), card(FIRE_ICE, { lowIn: { US: 1000 }, searchCount: 20 }), card(DELVER, { lowIn: { US: 1000 }, searchCount: 400 })], {
      supply: { [COUNTERSPELL]: 2, [FIRE_ICE]: 2, [DELVER]: 2 },
    }),
    history({}),
    now,
  );
  assert.deepEqual(b.picks.map((p) => p.id), [COUNTERSPELL, DELVER, FIRE_ICE]);
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
    inputs([card(SOL, { lowIn: { US: 1000 } }), card(BIRDS, { lowIn: { US: 1000 } }), card(KHAN, { lowIn: { US: 1000 } })], {
      supply: { [SOL]: 1, [BIRDS]: 1, [KHAN]: 0 },
      velocity: {
        [SOL]: { searchPerDay: 4, viewPerDay: 1, searchGrowthPct: 30, spanDays: 9, points: 9 },
        [BIRDS]: { searchPerDay: 50, viewPerDay: 1, searchGrowthPct: 400, spanDays: 2, points: 3 },
      },
    }),
    history({}),
    Date.UTC(2026, 8, 25, 12),
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.match(by.get(SOL)!.reason, /searches \+30% in 9 days · /);
  assert.doesNotMatch(by.get(BIRDS)!.reason, /%/);
  assert.match(by.get(BIRDS)!.reason, /50 searches a day/);
  assert.match(by.get(KHAN)!.reason, /100 searches all-time · no store has it in stock$/);
  assert.deepEqual([growthSpanLabel(21), growthSpanLabel(7), growthSpanLabel(9), growthSpanLabel(14, true)], ["3 weeks", "1 week", "9 days", "2 wk"]);
});

test("the universe is the most-searched cards PRICED in the scope; supply is that market's stores, Global sums them", () => {
  const searched = [
    card(SOL, { searchCount: 900, lowIn: { UK: 500 }, storesIn: { UK: 3, US: 2 } }),
    card(BIRDS, { searchCount: 800, lowIn: { US: 700 }, storesIn: { US: 4 } }),
    card(COUNTERSPELL, { searchCount: 0, lowIn: { UK: 100 } }),
  ];
  const uk = riseInputsFor("UK", searched, {}, 5);
  assert.deepEqual(uk.universe.map((c) => c.id), [SOL], "unpriced in the UK, or never searched, is out");
  assert.deepEqual(uk.supply, { [SOL]: 3 });
  const g = riseInputsFor("GLOBAL", searched, {}, 5);
  assert.deepEqual(g.universe.map((c) => c.id), [SOL, BIRDS]);
  assert.deepEqual(g.supply, { [SOL]: 5, [BIRDS]: 4 });
  assert.equal(SCAN, 400);
});

test("an empty universe is an empty analysis, not a failure", () => {
  const a = assembleRisingCards("SG", inputs([]), history({}), Date.now());
  assert.deepEqual([a.picks, a.failed, a.scope], [[], false, "SG"]);
});

// ── the public weekly closes (hist/w) ────────────────────────────────────────────────────────────────────────

test("hist/w: 18 weekly closes ending on a Sunday, oldest first; a week with no price is not a point", () => {
  const closes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1200, 0, 1100, 1000, 1050, 1000];
  assert.deepEqual(weeklyPoints(closes, "2026-10-04"), [[eday(8, 30), 1200], [eday(9, 13), 1100], [eday(9, 20), 1000], [eday(9, 27), 1050], [eday(10, 4), 1000]]);
  assert.equal(weeklyPoints(Array.from({ length: 30 }, (_, i) => 1000 + i), "2026-10-04").length, MAX_WEEKS, "at most the 18 weeks the file carries");
  assert.deepEqual(weeklyPoints([0, 0, 0], "2026-10-04"), []);
});

test("weeklyClosesOf joins the eight shards by unit and takes the newest Sunday", () => {
  const f = (end: string, k: number[], c: number[][]): WeeklyFile => ({ v: 1, end, weeks: 18, k, c });
  const w = weeklyClosesOf([f("2026-10-04", [BIRDS * 2], [[1, 2, 3]]), null, f("2026-10-04", [SOL * 2 + 1], [[7, 8, 9]]), f("2026-09-27", [KHAN * 2], [[4]])]);
  assert.equal(w.end, "2026-10-04");
  assert.deepEqual([...w.closes.keys()].sort((a, b) => a - b), [BIRDS * 2, KHAN * 2, SOL * 2 + 1].sort((a, b) => a - b));
  assert.deepEqual(w.closes.get(SOL * 2 + 1), [7, 8, 9]);
});

// ── the demand inputs and the entry of one scope ────────────────────────────────────────────────────────────────────

const day = (d: string, p: DemandDayFile["p"]): DemandDayFile => ({ v: 1, day: d, p });
test("riseDemandFrom: velocity now and demand a week ago for the most searched cards only", () => {
  const files = [day("2026-10-01", { [SOL]: [10, 5], [BIRDS]: [3, 1] }), day("2026-10-10", { [SOL]: [20, 9], [BIRDS]: [4, 1] }), day("2026-10-20", { [SOL]: [50, 20], [BIRDS]: [9, 2], [KHAN]: [1, 0] })];
  const d = riseDemandFrom(files, "2026-10-20", 3, 2);
  assert.deepEqual(Object.keys(d.now).map(Number).sort((a, b) => a - b), [BIRDS, SOL].sort((a, b) => a - b), "the two most searched");
  assert.equal(d.now[SOL]!.velocity!.searchPerDay, Math.round(((50 - 10) / 19) * 100) / 100);
  assert.equal(d.weekAgo?.asOf, "2026-10-13");
  assert.equal(d.weekAgo?.cards[SOL]!.searchCount, 20, "the totals on its last snapshot on or before that day");
  assert.equal(d.weekAgo?.cards[KHAN], undefined, "a card outside the inputs is not carried");
  assert.equal(d.snapshotDays, 3);
  assert.equal(riseDemandFrom([day("2026-10-19", { [SOL]: [1, 0] })], "2026-10-20", 1).weekAgo, null, "no snapshot a week back: no week-ago ranking");
});

test("riseEntryFrom over the real fixtures: the universe is read from the browse index, the series from hist/w, nothing from a file the viewer could reach", async () => {
  const tree = realMiniTree(), src: PlaneSource = { text: async (r) => { if (!tree.has(r)) throw new PlaneError(r, "missing"); return tree.read(r); }, json: async <T,>(r: string) => JSON.parse(await src.text(r)) as T };
  const sets = (JSON.parse(tree.read("meta/sets.json")) as SetsFile).sets.map((r) => ({ id: r[0], slug: r[1], tok: r[2], code: r[3], name: r[4], tcgName: r[4], kind: r[6] as never, releasedOn: r[7] || null, bucket: false, cardCount: r[10], trackedCount: r[11], sealedCount: r[12] }));
  const ix = await BrowseIndex.load(src, sets, { withOracle: false });
  const weekly = weeklyClosesOf([{ v: 1, end: "2026-10-04", weeks: 18, k: [BIRDS * 2], c: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2100, 2200, 2250, 2300, 2289, 2289]] }]);
  const d = riseDemandFrom([day("2026-10-01", { [BIRDS]: [10, 5], [MEGATRON]: [4, 4] }), day("2026-10-03", { [BIRDS]: [30, 8], [MEGATRON]: [6, 4] })], "2026-10-03", 2);
  const e = riseEntryFrom("US", d, ix, weekly, Date.UTC(2026, 9, 8));
  assert.deepEqual(e.analysis.picks.map((p) => p.id), [BIRDS, MEGATRON], "the two searched cards that are priced in the US, most searched first");
  const birds = e.analysis.picks[0]!;
  assert.equal(birds.displayName, "Birds of Paradise");
  assert.equal(birds.priceSignals, true, "five weekly closes and today's price");
  assert.equal(birds.currency, "USD");
  assert.equal(e.analysis.scope, "US");
  assert.equal(e.analysis.failed, false);
  assert.equal(e.weekAgo, null, "no snapshot a week back in this fixture");
  assert.ok(e.analysis.picks.every((p) => p.imageThumbUrl === null || /^https:\/\//.test(p.imageThumbUrl)));
  assert.equal(riseEntryFrom("AU", d, ix, weekly, Date.UTC(2026, 9, 8)).analysis.picks.length, 0, "nothing in the fixture has an Australian store listing yet");
});

// ── the page and the loader ────────────────────────────────────────────────────────────────────────────────────

test("access: signed out sees no pick, a free or Plus account the clear preview, Premium every row; the page takes it from premium-gates", () => {
  const src = code(PAGE);
  assert.match(src, /from "@\/lib\/premium-gates"/);
  assert.match(src, /const access = accessFor\("rising", who\.viewer\), limit = rowLimit\("rising", access, who\.viewer\);/);
  assert.match(src, /getCachedRisingCards\(scope, who\)/);
  assert.match(src, /<PlanButton tier="premium" surface=\{FEATURE_RULES\.rising\.surface\} \/>/);
  assert.doesNotMatch(src, /isPremium\(|slice\(0, FREE_PREVIEW_ROWS\)/, "the cut is the loader's, never the page's");
  assert.doesNotMatch(src, /backtested|validated|invest/i);
  assert.doesNotMatch(src, /email/i, "email is off: nothing promises one");
});

test("a failed load reads 'temporarily unavailable', never 'no price history yet'", () => {
  const src = code(PAGE);
  assert.match(src, /result\.failed \?/);
  assert.match(src, /Rising Cards is temporarily unavailable/);
});

test("the loader: two tier-neutral rank caches keyed on the data commit and the day, Neon only in the first, pure CPU in the second; the predictor is pure", () => {
  const d = strip(readDataModule("demand"));
  const entry = /async function riseEntry[\s\S]*?\n\}\n/.exec(d)?.[0] ?? "";
  assert.match(entry, /rankKey\("rise-v1", ref, day, "demand"\)/);
  assert.match(entry, /rankKey\("rise-v1", ref, day, scope\)/);
  const callbacks = [...entry.matchAll(/unstable_cache\(async \(\) => ([^,]*(?:\([^)]*\))?[^,]*),/g)].map((m) => m[1]!);
  assert.equal(callbacks.length, 2);
  for (const cb of callbacks) assert.doesNotMatch(cb, /get[A-Z]\w*\(|fetch\(|planeJson|readWeekly|\bwho\b/, `no loader, plane read or viewer inside a cache callback: ${cb}`);
  assert.match(entry, /const \[ix, weekly\] = await Promise\.all\(\[getBrowseIndex/, "the plane data is resolved BEFORE the closure");
  const g = /export async function getCachedRisingCards[\s\S]*?\n\}\n/.exec(d)?.[0] ?? "";
  assert.match(g, /const access = accessOf\("rising", who\)/);
  assert.match(g, /if \(access !== "full"\) return riseResultFor\(/, "below full the ranking is not even read");
  assert.doesNotMatch(strip(read("src/lib/rise-predictor.ts")), /from "\.\/db"|unstable_cache/, "the predictor is pure");
});
