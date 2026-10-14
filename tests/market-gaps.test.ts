// The cross-market gap rule (src/lib/market-gaps.ts) that the publisher applies to every tracked unit before it writes
// mk/records.json: one unit compared with itself, the cheapest LOCAL option (TCGplayer's own low counts in the US) against
// another market's cheapest store, and the unit's TCGplayer market as the outlier check. The two shapes that led the live
// board on 2026-10-14 are pinned with their real figures (card pages of that day, Foil tab):
//   Metalworker (UDS 135) foil: one US store's MP copy US$3,934, TCGplayer low US$1,500, market US$1,100; Canada US$1,399.
//   Serra Angel (7ED 42, the 42★ foil printing): one US store's NM copy US$987.30, TCGplayer low US$429.99, market US$499.99;
//   Canada US$456.93.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Country } from "../src/lib/country";
import { GAP_AWAY_MIN_MARKET, GAP_HOME_MAX_MARKET, GAP_MAX_PCT, GAP_MIN_PCT, localPrice, unitGap, type GapUnit } from "../src/lib/market-gaps";

/** storeMin in MARKETS order (US AU UK SG CA EU), each in its own currency. */
const mins = (m: Partial<Record<Country, number>>): (number | null)[] => (["US", "AU", "UK", "SG", "CA", "EU"] as const).map((c) => m[c] ?? null);
const unit = (storeMin: Partial<Record<Country, number>>, marketUsd: number | null, tcgLowUsd: number | null = null): GapUnit => ({ storeMin: mins(storeMin), marketUsd, tcgLowUsd });

const METALWORKER_FOIL = unit({ US: 393400, CA: 191699 }, 110000, 150000);
const SERRA_ANGEL_FOIL = unit({ US: 98730, CA: 62600 }, 49999, 42999);

test("the thresholds the guide quotes: a 15-70% gap, an outlier above 2x the market, an away price under half of it", () => {
  assert.deepEqual([GAP_MIN_PCT, GAP_MAX_PCT, GAP_HOME_MAX_MARKET, GAP_AWAY_MIN_MARKET], [15, 70, 2, 0.5]);
});

test("Metalworker: a single store's 3.6x ask is not the US price; against what a US buyer can pay, Canada is not cheaper", () => {
  assert.equal(localPrice(METALWORKER_FOIL, "US"), 150000, "TCGplayer's own low is a local option in the US");
  assert.equal(unitGap(METALWORKER_FOIL, "US"), null);
  // Without TCGplayer's low the store ask is still out: US$3,934 is more than twice the US$1,100 market.
  assert.equal(unitGap({ ...METALWORKER_FOIL, tcgLowUsd: null }, "US"), null);
  // The 2026-10-07 market (US$1,299.50, tests/ebay-chase-pool.test.ts) changes nothing.
  assert.equal(unitGap({ ...METALWORKER_FOIL, marketUsd: 129950, tcgLowUsd: null }, "US"), null);
});

test("Serra Angel: the NM ask is under 2x the market, so it is TCGplayer's own low (a local option) that removes the row", () => {
  assert.equal(unitGap(SERRA_ANGEL_FOIL, "US"), null);
  // Stores only (the rule before 2026-10-14) this was the live row: US$987.30 against Canada's US$456.93, "53.7% less".
  assert.deepEqual(unitGap({ ...SERRA_ANGEL_FOIL, tcgLowUsd: null }, "US"), { localCents: 98730, away: "CA", awayCents: 62600, awayConverted: 45693, saving: 53037, pct: 53.7 });
  // And in the US a market price at or below the overseas price means nothing is cheaper abroad, whatever the stores ask.
  assert.equal(unitGap({ ...SERRA_ANGEL_FOIL, tcgLowUsd: null, marketUsd: 45693 }, "US"), null);
});

test("a real gap survives: the same unit, a local price inside the band, the cheaper market a store", () => {
  // Australia: A$1,300 locally against US$600 at a US store (A$900), market US$650 (A$975).
  const u = unit({ AU: 130000, US: 60000 }, 65000, 52000);
  assert.deepEqual(unitGap(u, "AU"), { localCents: 130000, away: "US", awayCents: 60000, awayConverted: 90000, saving: 40000, pct: 30.8 });
  assert.equal(localPrice(u, "AU"), 130000, "TCGplayer's low is a US option only: a US seller's price with international postage is not local elsewhere");
  // The cheaper market is a store: TCGplayer's own low never stands in for a missing US store.
  assert.equal(unitGap(unit({ AU: 130000 }, 65000, 52000), "AU"), null);
});

test("an away price under half the market is passed over (a played copy or another printing), and the next market is used", () => {
  // US$200 is A$300, under half the A$975 market; Canada's C$900 is A$985.40.
  const g = unitGap(unit({ AU: 130000, US: 20000, CA: 90000 }, 65000), "AU");
  assert.equal(g?.away, "CA");
  assert.deepEqual([g?.awayConverted, g?.saving, g?.pct], [98540, 31460, 24.2]);
  assert.equal(unitGap(unit({ AU: 130000, US: 20000 }, 65000), "AU"), null);
});

test("a unit with no TCGplayer market gets no row, and the board's floors still apply", () => {
  assert.equal(unitGap(unit({ AU: 130000, US: 60000 }, null), "AU"), null, "no reference, no claim");
  assert.equal(unitGap(unit({ AU: 450, US: 100 }, 300), "AU"), null, "under the A$5 local floor");
  assert.equal(unitGap(unit({ AU: 1500, US: 900 }, 900), "AU"), null, "A$1.50 saved is under the A$5 floor");
  assert.equal(unitGap(unit({ AU: 1950, US: 1200 }, 1200), "AU"), null, "7.7% is under the 15% floor");
  assert.equal(unitGap(unit({ US: 10000, EU: 2700 }, 9000), "US"), null, "a 70%+ gap is two different things (and under half the market)");
});

test("several cheaper markets: the largest saving wins", () => {
  const g = unitGap(unit({ UK: 80000, US: 70000, CA: 80000 }, 90000), "UK");
  // US$700 is £553.00; C$800 is US$583.94, £461.31: Canada saves more.
  assert.equal(g?.away, "CA");
  assert.equal(g?.awayConverted, 46131);
});

test("the publisher writes mk/records.json gaps through unitGap, with the unit's own market and TCGplayer low", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src/lib/import.ts"), "utf8");
  assert.match(src, /import \{ unitGap, type GapUnit \} from "\.\/market-gaps"/);
  assert.match(src, /const g = unitGap\(u, home\)/);
  assert.match(src, /marketUsd: r \? marketOfUnit\(r\.p, f\) : null, tcgLowUsd: r \? \(f === 0 \? r\.p\[3\] : r\.p\[4\]\) : null/);
  assert.doesNotMatch(src, /XMIN_HOME|XMAX_PCT/, "one rule, in one place");
});
