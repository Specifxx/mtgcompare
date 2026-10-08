// Deal Finder (src/lib/deals.ts, lib/deal-finder-href.ts, lib/deal-ui.ts):
// RiftCompare's three views ported onto OP Compare's data, and the buyer-list
// rules RiftCompare's tests/deal-finder-buyer-list.test.ts pins — TCGplayer is
// the reference, never the buy side; the US TCGplayer-low veto; the 75% guard;
// eBay postage (delivered only when stated, a stated postage wins a tie);
// Canada's cross-border eBay feed off the default list; "only my cards" before
// paging; and every cache entry well under the Data Cache's 2 MB item ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EBAY_FEED,
  belowPct,
  cheapestEbayByCard,
  cheapestListing,
  crossMarketGaps,
  dealFinderSources,
  decodeDealInputs,
  defaultBuyKeys,
  ebayBuyLabel,
  ebaySourceFor,
  encodeDealInput,
  hasEbayComparison,
  pageRanked,
  rankCheapestOnEbay,
  rankUnderpricedVsEbay,
  rankVsTcgplayer,
  resolveBuyKeys,
  scoreVsEbay,
  scoreVsTcg,
  splitBuyKeys,
  type DealInput,
  type DealInputTuple,
} from "../src/lib/deals";
import { TIER_THRESHOLDS, buyLabel, inTier, mixByTier } from "../src/lib/deal-ui";
import { hrefFor, parseDealFinderParams, type DealFinderParams } from "../src/lib/deal-finder-href";
import { SINGLES_MARKETS } from "../src/lib/ebay-plan";
import { storesIn } from "../src/lib/stores";
import { MARKETS, type Country } from "../src/lib/country";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const inp = (id: number, storeMin: number | null, opts: { tcgLow?: number | null; ebay?: number | null; known?: boolean } = {}): DealInput => ({
  id,
  storeMin,
  tcgLow: opts.tcgLow ?? null,
  ebay: opts.ebay == null ? null : { cents: opts.ebay, postageKnown: opts.known ?? false },
});
const usd = (m: Record<number, number>) => (id: number) => m[id] ?? null;

// ── Buy side ─────────────────────────────────────────────────────────────────

test("TCGplayer is never a buy source, in any market, nor accepted from a URL", () => {
  for (const c of MARKETS) {
    assert.ok(!dealFinderSources(c).some((s) => /tcgplayer/i.test(s.key) || /tcgplayer/i.test(s.name)), `${c}: no TCGplayer source`);
    for (const k of defaultBuyKeys(c)) assert.ok(!/tcgplayer/.test(k), `${c}: ${k} on the default buy side`);
    assert.deepEqual(resolveBuyKeys(c, ["tcgplayer", "store:x", "nope"]), [], `${c}: junk keys dropped`);
  }
  const store = storesIn("US")[0].key;
  assert.deepEqual(resolveBuyKeys("US", ["tcgplayer", store, store, "ebay", "ebay_us"]), [store, "ebay"]);
  // Every tracked store is a source; the picker lists eBay first.
  assert.equal(dealFinderSources("AU").filter((s) => !s.isEbay).length, storesIn("AU").length);
  assert.equal(dealFinderSources("AU")[0].key, "ebay");
});

test("a card whose only cheap copy is TCGplayer's own listing is not a deal", () => {
  // Market $10, TCGplayer's lowest listing $4, no store: nothing to buy here.
  const rows = rankVsTcgplayer("US", [inp(1, null, { tcgLow: 400 })], usd({ 1: 1000 }), { sort: "saving", ebay: true });
  assert.deepEqual(rows, []);
});

test("Canada's eBay feed (US listings, postage unquoted) is off the default buy side but still selectable", () => {
  assert.equal(EBAY_FEED.CA, "cross-border");
  assert.equal(ebaySourceFor("CA"), "ebay_us");
  assert.ok(!defaultBuyKeys("CA").includes("ebay_us"));
  assert.ok(dealFinderSources("CA").some((s) => s.key === "ebay_us" && s.isEbay && s.name === "eBay US"));
  assert.ok(defaultBuyKeys("US").includes("ebay"), "elsewhere eBay stays in the default");
  assert.equal(ebaySourceFor("SG"), null, "Singapore has no eBay singles feed");
  assert.ok(!hasEbayComparison("CA") && !hasEbayComparison("SG") && hasEbayComparison("US"));
});

test("the eBay feed table matches the eBay pass's singles markets", () => {
  for (const m of MARKETS) {
    const own = (SINGLES_MARKETS as string[]).includes(m);
    assert.equal(EBAY_FEED[m] === "own", own, `${m}: EBAY_FEED disagrees with lib/ebay-plan.ts SINGLES_MARKETS`);
  }
});

test("splitBuyKeys knows when the stores are all of them", () => {
  const all = storesIn("AU").map((s) => s.key);
  assert.deepEqual(splitBuyKeys("AU", [...all, "ebay"]), { storeKeys: [...all].sort(), ebay: true, allStores: true });
  const some = splitBuyKeys("AU", [all[0]]);
  assert.equal(some.allStores, false);
  assert.equal(some.ebay, false);
});

// ── eBay postage ─────────────────────────────────────────────────────────────

test("unknown eBay postage is never counted as free, and never called delivered", () => {
  const rows = [
    { id: 1, priceCents: 500, shippingCents: null, url: "u1" },
    { id: 2, priceCents: 500, shippingCents: 150, url: "u2" },
    { id: 3, priceCents: 500, shippingCents: 0, url: "u3" },
  ];
  const us = cheapestEbayByCard("US", rows);
  assert.deepEqual(us.get(1), { cents: 500, url: "u1", postageKnown: false });
  assert.deepEqual(us.get(2), { cents: 650, url: "u2", postageKnown: true });
  assert.deepEqual(us.get(3), { cents: 500, url: "u3", postageKnown: true }, "stated free postage IS known");
  assert.equal(cheapestEbayByCard("CA", rows).get(2)?.postageKnown, false);
  assert.equal(cheapestEbayByCard("CA", rows).get(2)?.cents, 500, "compared on the item price there");
  assert.equal(ebayBuyLabel("US", true), "eBay (delivered)");
  assert.equal(ebayBuyLabel("US", false), "eBay + postage");
  assert.equal(ebayBuyLabel("CA", true), "eBay US + intl postage");
});

test("a listing with stated postage wins whenever its delivered price is no higher", () => {
  const tie = cheapestEbayByCard("US", [
    { id: 7, priceCents: 500, shippingCents: null, url: "unknown" },
    { id: 7, priceCents: 450, shippingCents: 50, url: "known" },
  ]);
  assert.deepEqual(tie.get(7), { cents: 500, url: "known", postageKnown: true });
  const flipped = cheapestEbayByCard("US", [
    { id: 7, priceCents: 450, shippingCents: 50, url: "known" },
    { id: 7, priceCents: 500, shippingCents: null, url: "unknown" },
  ]);
  assert.equal(flipped.get(7)?.url, "known", "order-independent");
  assert.deepEqual(
    cheapestEbayByCard("US", [
      { id: 7, priceCents: 500, shippingCents: 20, url: "known" },
      { id: 7, priceCents: 500, shippingCents: null, url: "unknown" },
    ]).get(7),
    { cents: 500, url: "unknown", postageKnown: false },
    "a cheaper item price with unstated postage is kept, flagged",
  );
  // The loader prices an eBay row at item + stated postage, from the one EbayBest row per unit; Canada never claims known postage.
  const data = read("src/lib/data/deals.ts");
  assert.match(data, /cents: r\.priceCents \+ \(known \? r\.shippingCents! : 0\)/);
  assert.match(data, /known = !cross && r\.shippingCents != null/);
});

test("the cached tuple never claims known postage for Canada, and keeps TCGplayer's low only in the US", () => {
  assert.deepEqual(encodeDealInput({ id: 1, storeMin: 900, tcgLow: 800, ebayCents: 700, ebayKnown: true }, "CA"), [1, 900, null, 700, 0]);
  assert.deepEqual(encodeDealInput({ id: 1, storeMin: 900, tcgLow: 800, ebayCents: 700, ebayKnown: true }, "US"), [1, 900, 800, 700, 1]);
  assert.deepEqual(encodeDealInput({ id: 1, storeMin: null, tcgLow: null, ebayCents: null, ebayKnown: null }, "AU"), [1, null, null, null, 0]);
  assert.deepEqual(decodeDealInputs([[5, 300, null, 250, 1]]), [{ id: 5, storeMin: 300, tcgLow: null, ebay: { cents: 250, postageKnown: true } }]);
});

// ── Underpriced vs TCGplayer ─────────────────────────────────────────────────

test("in the US, a row TCGplayer's own lowest listing already beats is not a deal", () => {
  assert.equal(scoreVsTcg("US", 800, 1000, 650), null, "TCGplayer sells it for less");
  assert.equal(scoreVsTcg("US", 800, 1000, 800), null, "…or for the same");
  assert.deepEqual(scoreVsTcg("US", 800, 1000, 850), { belowCents: 200, belowPct: 20 });
  assert.deepEqual(scoreVsTcg("US", 800, 1000, null), { belowCents: 200, belowPct: 20 }, "no listing, no check");
  assert.deepEqual(scoreVsTcg("AU", 800, 1500, 100), { belowCents: 700, belowPct: 46.7 }, "outside the US the US listing is ignored");
  assert.equal(scoreVsTcg("US", 250, 1000, null), null, "under the minimum buy price");
  assert.equal(scoreVsTcg("US", 950, 1000, null), null, "under the minimum gap");
  assert.equal(scoreVsTcg("US", 300, 2000, null), null, "85% below market is a mismatched listing, not a deal");
  assert.deepEqual(scoreVsTcg("US", 500, 2000, null), { belowCents: 1500, belowPct: 75 }, "exactly 75% still counts");
  assert.equal(belowPct(500, 1000), 50);
  assert.equal(belowPct(500, 0), null);
});

test("the US list drops a store TCGplayer undercuts, end to end", () => {
  const rows = rankVsTcgplayer(
    "US",
    [inp(1, 800, { tcgLow: 650 }), inp(2, 800, { tcgLow: 900 })],
    usd({ 1: 1000, 2: 1000 }),
    { sort: "saving", ebay: true },
  );
  assert.deepEqual(rows.map((r) => r.id), [2]);
  assert.equal(rows[0].low, 900, "the page can show TCGplayer's low beside the market price");
});

test("the buy price is the cheaper of the store and eBay, and eBay can be switched off", () => {
  const i = [inp(1, 900, { ebay: 700, known: true }), inp(2, 600, { ebay: 700 })];
  const m = usd({ 1: 1500, 2: 1500 });
  const withEbay = rankVsTcgplayer("US", i, m, { sort: "saving", ebay: true });
  assert.deepEqual(withEbay.map((r) => [r.id, r.buy, r.buyIsEbay, r.postageKnown]), [[2, 600, false, false], [1, 700, true, true]]);
  const storesOnly = rankVsTcgplayer("US", i, m, { sort: "saving", ebay: false });
  assert.deepEqual(storesOnly.map((r) => [r.id, r.buy]), [[2, 600], [1, 900]]);
  // A picked store subset replaces the all-store minimum; an empty map = no store.
  const subset = rankVsTcgplayer("US", i, m, { sort: "saving", ebay: false, storeMin: new Map([[1, 1000]]) });
  assert.deepEqual(subset.map((r) => [r.id, r.buy]), [[1, 1000]]);
  assert.deepEqual(rankVsTcgplayer("US", i, m, { sort: "saving", ebay: false, storeMin: new Map() }), []);
});

test("market prices are converted into the market's currency, and sort is money first by default", () => {
  // AUD at 1.5: a US$10 market is A$15.
  const rows = rankVsTcgplayer("AU", [inp(1, 1000), inp(2, 400)], usd({ 1: 1000, 2: 500 }), { sort: "saving", ebay: false });
  assert.deepEqual(rows.map((r) => [r.id, r.market, r.below, r.pct]), [[1, 1500, 500, 33.3], [2, 750, 350, 46.7]]);
  const byPct = rankVsTcgplayer("AU", [inp(1, 1000), inp(2, 400)], usd({ 1: 1000, 2: 500 }), { sort: "pct", ebay: false });
  assert.deepEqual(byPct.map((r) => r.id), [2, 1]);
});

// ── Cheapest on eBay / Underpriced vs eBay ───────────────────────────────────

test("Cheapest on eBay: guards, the US TCGplayer alternative, no Canada", () => {
  const i = [
    inp(1, 2000, { ebay: 1500, known: true }), // gap 500: in
    inp(2, 2000, { ebay: 1980 }), // gap 20 < 50: out
    inp(3, 2000, { ebay: 300 }), // gap 85% of the store: a mismatch, out
    inp(4, 2000, { ebay: 90 }), // under 100: out
    inp(5, null, { ebay: 500 }), // no store to beat: out
    inp(6, 2000, { ebay: 1500, tcgLow: 1400 }), // US: TCGplayer sells it for less: out
    inp(7, 2000, { ebay: 1500, tcgLow: 1700 }), // US: the gap is against TCGplayer's low
  ];
  const us = rankCheapestOnEbay("US", i);
  assert.deepEqual(us.map((r) => [r.id, r.storeCents, r.gapCents]), [[1, 2000, 500], [7, 1700, 200]]);
  const au = rankCheapestOnEbay("AU", i);
  assert.deepEqual(au.map((r) => r.id), [1, 6, 7], "outside the US TCGplayer's listing is not an alternative");
  assert.deepEqual(rankCheapestOnEbay("CA", i), []);
  assert.deepEqual(rankCheapestOnEbay("SG", i), []);
});

test("Underpriced vs eBay: a tie is not below, 80% below eBay is a mismatch", () => {
  assert.equal(scoreVsEbay(1000, 1000), null);
  assert.equal(scoreVsEbay(1000, 1040), null, "near-tie under the 50 gap");
  assert.deepEqual(scoreVsEbay(1000, 1500), { below: 500, pct: 33.3 });
  assert.equal(scoreVsEbay(150, 1000), null, "85% below eBay");
  assert.equal(scoreVsEbay(90, 500), null, "under 100");
  const ranked = rankUnderpricedVsEbay("UK", [inp(1, 1000, { ebay: 1500 }), inp(2, 200, { ebay: 400 }), inp(3, 1000)], "pct");
  assert.deepEqual(ranked.map((r) => r.id), [2, 1]);
  assert.deepEqual(rankUnderpricedVsEbay("CA", [inp(1, 1000, { ebay: 1500 })]), []);
});

test("the two eBay views never both claim one card", () => {
  const i = Array.from({ length: 50 }, (_, k) => inp(k, 500 + k * 37, { ebay: 800 + ((k * 53) % 700), known: k % 2 === 0 }));
  const cheap = new Set(rankCheapestOnEbay("AU", i).map((r) => r.id));
  for (const r of rankUnderpricedVsEbay("AU", i)) assert.ok(!cheap.has(r.id), `card ${r.id} on both lists`);
});

// ── Live listings ────────────────────────────────────────────────────────────

test("the live listing is the cheapest among the picked stores, never TCGplayer or eBay", () => {
  const l = [
    { source: "tcgplayer", priceCents: 100, url: "t", condition: null },
    { source: "ebay", priceCents: 150, url: "e", condition: null },
    { source: "store:b", priceCents: 300, url: "b", condition: "LP" },
    { source: "store:a", priceCents: 300, url: "a", condition: "NM" },
    { source: "store:c", priceCents: 500, url: "c", condition: null },
  ];
  assert.equal(cheapestListing(l, null)?.url, "a", "ties go to the source name, stably");
  assert.equal(cheapestListing(l, new Set(["c"]))?.url, "c");
  assert.equal(cheapestListing(l, new Set(["zzz"])), null);
});

// ── Only my cards ────────────────────────────────────────────────────────────

test("onlyIds filters the ranked rows BEFORE paging", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, below: 1000 - i }));
  const mine = new Set(rows.filter((_, i) => i % 2 === 0).map((r) => r.id)); // 30 cards
  const p2 = pageRanked(rows, { page: 2, pageSize: 25, onlyIds: mine });
  assert.equal(p2.total, 30, "total counts only the reader's cards");
  assert.equal(p2.pageCount, 2);
  assert.deepEqual(p2.slice.map((r) => r.id), [50, 52, 54, 56, 58], "page 2 is the 26th-30th of THEIR cards");
  assert.equal(p2.savingsTotalCents, [...mine].reduce((s, id) => s + 1000 - id, 0));
  const none = pageRanked(rows, { page: 1, pageSize: 25, onlyIds: new Set() });
  assert.deepEqual([none.total, none.pageCount, none.slice.length], [0, 1, 0]);
  const all = pageRanked(rows, { page: 9, pageSize: 25 });
  assert.deepEqual([all.total, all.page, all.slice.length], [60, 3, 10], "no filter: page clamped");
  const top3 = pageRanked(rows, { page: 1, pageSize: 3 });
  assert.deepEqual([top3.total, top3.slice.length], [60, 3], "a free account's three rows still know the real total");
});

// ── Cache entries ────────────────────────────────────────────────────────────

test("every deal cache entry stays well under the 2 MB Data Cache item ceiling", () => {
  // getDealInputs: ~7k cards per market today; size it at 15k with every field set.
  const tuples: DealInputTuple[] = Array.from({ length: 15000 }, (_, i) => [600000 + i, 123456, 98765, 112233, 1]);
  const inputs = JSON.stringify(tuples).length;
  assert.ok(inputs < 700_000, `getDealInputs at 15k cards is ${inputs} bytes`);
  // getStoreMins: [id, min] pairs.
  const mins = JSON.stringify(Array.from({ length: 15000 }, (_, i) => [600000 + i, 123456])).length;
  assert.ok(mins < 400_000, `getStoreMins at 15k cards is ${mins} bytes`);
  // getDealOffers: 25 cards × 80 listings (its take bound) with long URLs.
  const url = "https://www.example-store.com.au/products/magic-the-gathering-the-one-ring-lord-of-the-rings-tales-of-middle-earth-246-borderless-showcase-near-mint-english?variant=1234567890123";
  const offers = JSON.stringify(
    Array.from({ length: 25 }, (_, i) => ({
      id: 600000 + i,
      tcgplayerUrl: "https://www.tcgplayer.com/product/600000/magic-the-gathering-lord-of-the-rings-tales-of-middle-earth-the-one-ring",
      stores: Array.from({ length: 80 }, (_, k) => ({ source: `store:somestore${k}`, priceCents: 123456, url, condition: "Lightly Played" })),
      ebay: [{ id: 600000 + i, priceCents: 1234, shippingCents: 500, url }],
    })),
  ).length;
  assert.ok(offers < 1_000_000, `getDealOffers worst case is ${offers} bytes`);
});

// ── Cross-market board ───────────────────────────────────────────────────────

test("cross-market gaps: stores only, converted, ranked by money, with the floors", () => {
  const rate: Record<Country, number> = { US: 1, AU: 1.5, UK: 0.79, SG: 1.35, CA: 1.37, EU: 0.92 };
  const convert = (c: number, from: Country, to: Country) => Math.round((c / rate[from]) * rate[to]);
  const gaps = crossMarketGaps(
    "AU",
    {
      AU: new Map([[1, 15000], [2, 1500], [3, 200], [4, 3000]]),
      US: new Map([[1, 6000], [2, 500], [3, 50], [4, 2900]]),
      UK: new Map([[1, 5000]]),
    },
    convert,
  );
  // Card 1: US$60 = A$90 (save A$60, 40%); UK £50 = A$94.94 (save A$55.06). US wins on money.
  // Card 2: US$5 = A$7.50 against A$15 (save A$7.50, 50%). Card 3 is under the
  // A$3 home floor; card 4 is dearer abroad.
  assert.deepEqual(gaps.map((g) => [g.id, g.away, g.awayCents, g.awayConverted, g.savingCents, g.pct]), [
    [1, "US", 6000, 9000, 6000, 40],
    [2, "US", 500, 750, 750, 50],
  ]);
  // Under the money floor (A$5) a gap is noise, whatever its percentage.
  assert.equal(crossMarketGaps("AU", { AU: new Map([[9, 900]]), US: new Map([[9, 300]]) }, convert).length, 0);
  assert.equal(crossMarketGaps("SG", { AU: new Map([[1, 100]]) }, convert).length, 0, "no home prices, no board");
});

// ── Homepage budget tabs and the picker label ────────────────────────────────

test("budget tabs: per-market thresholds, and All interleaves cheap first", () => {
  assert.deepEqual(TIER_THRESHOLDS.US, { small: 500, mid: 2500 });
  assert.deepEqual(TIER_THRESHOLDS.AU, { small: 800, mid: 4000 });
  assert.ok(inTier(500, "small", TIER_THRESHOLDS.US) && !inTier(501, "small", TIER_THRESHOLDS.US));
  assert.ok(inTier(2501, "big", TIER_THRESHOLDS.US) && !inTier(2500, "big", TIER_THRESHOLDS.US));
  const items = [3000, 4000, 100, 200, 5000].map((priceCents) => ({ priceCents }));
  assert.deepEqual(mixByTier(items, 2500).map((d) => d.priceCents), [100, 3000, 200, 4000, 5000]);
});

test("the store picker's label names the selection", () => {
  const sources = dealFinderSources("AU");
  const defaults = defaultBuyKeys("AU");
  assert.equal(buyLabel(defaults, sources, defaults), "Every store + eBay");
  assert.equal(buyLabel([], sources, defaults), "None selected");
  assert.equal(buyLabel(["ebay"], sources, defaults), "eBay");
  assert.equal(buyLabel(sources.filter((s) => !s.isEbay).map((s) => s.key), sources, defaults), "Stores only");
  assert.equal(buyLabel(defaultBuyKeys("CA"), dealFinderSources("CA"), defaultBuyKeys("CA")), "Every store", "Canada's default has no eBay");
});

// ── Links ────────────────────────────────────────────────────────────────────

test("hrefFor carries buy, sort, mine and page through every control, and round-trips", () => {
  const p: DealFinderParams = { view: "tcg", buy: ["cherry", "ebay"], sort: "pct", page: 3, mine: "watch" };
  const url = (patch: Partial<DealFinderParams>) => new URL(hrefFor(p, patch), "https://x.test");
  const next = url({ page: 4 });
  assert.equal(next.searchParams.get("buy"), "cherry,ebay");
  assert.equal(next.searchParams.get("sort"), "pct");
  assert.equal(next.searchParams.get("mine"), "watch");
  assert.equal(next.searchParams.get("page"), "4");
  assert.equal(next.searchParams.get("view"), null, "the default view stays implicit");
  assert.equal(url({ sort: "saving", page: 1 }).searchParams.get("sort"), null);
  assert.equal(url({ mine: null, page: 1 }).searchParams.get("mine"), null);
  assert.equal(hrefFor({ view: "tcg", buy: null, sort: "saving", page: 1, mine: null }), "/tools/deal-finder", "the canonical URL is bare");
  const back = parseDealFinderParams(Object.fromEntries(next.searchParams), { allowMine: true });
  assert.deepEqual(back, { ...p, page: 4 });
});

test("the view tabs carry only what each view uses", () => {
  const p: DealFinderParams = { view: "tcg", buy: ["cherry"], sort: "pct", page: 3, mine: "watch" };
  const read = (href: string) => parseDealFinderParams(Object.fromEntries(new URL(href, "https://x.test").searchParams), { allowMine: true });
  assert.equal(hrefFor(p, { view: "vs-ebay", page: 1 }), "/tools/deal-finder?view=vs-ebay&sort=pct&mine=watch");
  assert.equal(hrefFor(p, { view: "ebay", page: 1 }), "/tools/deal-finder?view=ebay");
  assert.deepEqual(read("/tools/deal-finder?view=ebay&buy=a&sort=pct&mine=watch&page=2"), { view: "ebay", buy: null, sort: "saving", page: 2, mine: null });
  for (const view of ["tcg", "ebay", "vs-ebay"] as const) {
    for (const patch of [{}, { page: 5 }, { sort: "saving" as const }, { mine: "watch" as const }, { buy: ["x", "y"] }]) {
      const href = hrefFor({ ...p, view }, patch);
      assert.equal(hrefFor(read(href)), href, `${view} ${JSON.stringify(patch)}: ${href}`);
    }
  }
});

test("unentitled and unknown parameters resolve safely", () => {
  const dflt = { view: "tcg", buy: null, sort: "saving", page: 1, mine: null };
  assert.deepEqual(parseDealFinderParams({ view: "nonsense" }, { allowMine: true }), dflt);
  assert.equal(parseDealFinderParams({ mine: "watch" }, { allowMine: false }).mine, null, "free and signed-out: ?mine= is ignored");
  assert.equal(parseDealFinderParams({ mine: "binder" }, { allowMine: true }).mine, "binder", "'only my binder' (parity P29)");
  assert.equal(parseDealFinderParams({ mine: "binder" }, { allowMine: false }).mine, null, "…at full access only");
  assert.equal(parseDealFinderParams({ mine: "own" }, { allowMine: true }).mine, null, "an unknown value is ignored");
  assert.deepEqual(parseDealFinderParams({ buy: "" }, { allowMine: true }).buy, [], "buy= is the explicit None");
  assert.deepEqual(parseDealFinderParams({ buy: ["a,b", "c"], page: ["2", "9"] }, { allowMine: true }), { ...dflt, buy: ["a", "b"], page: 2 });
});

// ── The page and its wiring ──────────────────────────────────────────────────

test("every Deal Finder link goes through hrefFor, and the gates are in the query", () => {
  const page = read("src/app/tools/deal-finder/page.tsx");
  assert.doesNotMatch(page, /["`']\/tools\/deal-finder\?/, "no hand-built Deal Finder query string");
  assert.match(page, /const params = parseDealFinderParams\(searchParams, \{ allowMine: member \}\);/);
  assert.match(page, /const access: Access = accessFor\("deal-finder", viewer\);/);
  assert.match(page, /const member = access === "full";/);
  assert.match(page, /rowLimit\("deal-finder", access, viewer\)/);
  assert.doesNotMatch(page, /isPremium|tierOf|dealAccess/, "the tier is never compared on the page: the gate is premium-gates and the loader");
  assert.match(page, /href=\{hrefFor\(params, \{ mine: c\.key, page: 1 \}\)\}/);
  assert.match(page, /linkFor=\{\(s\) => hrefFor\(params, \{ sort: s, page: 1 \}\)\}/);
  assert.match(page, /linkFor=\{\(p\) => hrefFor\(params, \{ page: p \}\)\}/);
  assert.match(page, /<StorePicker sources=\{sources\} buy=\{buy\} defaultBuy=\{defaultBuy\} params=\{params\} \/>/);
  assert.match(page, /href=\{`\/market\/records\?market=\$\{country\}#gaps`\}/);
  // Below full access the loader serves the DEFAULT ranking, three rows; the page asks with the session's Entitlement and nothing else.
  assert.match(page, /getTcgDeals\(country, \{ buy: params\.buy === null \? undefined : buy, sort, page, pageSize: DEAL_PAGE_SIZE \}, who\)/);
  assert.match(page, /view !== "tcg" \|\| island \|\| rows === 0/, "a signed-out visitor's ranking is not even queried");
  assert.match(page, /PlanButton surface="gate:deal-finder" tier="plus"/);
  for (const header of ["Best price", "TCGplayer market", "Below market", "% below"]) {
    assert.ok(read("src/components/DealTable.tsx").includes(`>${header}</th>`), `missing the "${header}" column`);
  }
  assert.doesNotMatch(read("src/components/StorePicker.tsx"), /\/tools\/deal-finder/, "the picker builds no URL of its own");
});

test("only my cards is Plus-only on the server too", () => {
  const route = read("src/app/api/deal-finder/route.ts");
  assert.match(route, /if \(!allowsRefinement\(access\)\)/);
  assert.match(route, /status: 402/);
  assert.match(route, /onlyIds/);
  assert.match(route, /body\.mine === "binder"/, "the binder half of 'only my cards'");
});

test("the deal loaders live in src/lib/data/deals.ts: one ranking cache, tier-neutral, and nothing else caches", () => {
  const data = read("src/lib/data/deals.ts");
  assert.equal((data.match(/unstable_cache\(/g) ?? []).length, 1, "the ranking is the only cache");
  assert.match(data, /rankKey\("deal-rank-v1", ptr\.ref, country, sort, buyKeysHash\(keys\)\)/);
  assert.match(data, /accessOf\("deal-finder", who\)/);
  assert.match(data, /sliceRanking\("deal-finder", who, ranking, q\)/);
  assert.doesNotMatch(data.replace(/\/\/[^\n]*/g, ""), /\.tier\b|isPremium/, "the loader never compares a tier");
  assert.match(data, /source: sourceOfStoreId\(t\[5\]\) \?\? ""|sourceOfStoreId\(t\[5\]\)/);
  for (const f of ["src/lib/deal-pages.ts", "src/lib/top-deals.ts", "src/lib/deals.ts"]) {
    assert.doesNotMatch(read(f).replace(/\/\/[^\n]*/g, ""), /unstable_cache\(/, `${f} must not add a cache layer`);
  }
});

test("the old Card.low<M> deal ranking is retired", () => {
  assert.doesNotMatch(read("src/lib/selectors.ts"), /biggestSavings|DEAL_MAX_SAVING_PCT/);
  assert.doesNotMatch(read("src/app/page.tsx"), /DealList|biggestSavings/);
  assert.ok(!fs.existsSync(path.resolve(__dirname, "../src/components/DealList.tsx")));
  // The cached homepage carries every market's deals; HomeTopDeals shows the visitor's.
  assert.match(read("src/app/page.tsx"), /<HomeTopDeals dealsByCountry=\{data\.dealsByCountry\} \/>/);
  assert.match(read("src/components/home/HomeTopDeals.tsx"), /<TodaysTopDeals key=\{country\} deals=\{deals\} \/>/);
  assert.match(read("src/components/TodaysTopDeals.tsx"), /PlanButton surface="gate:home-deals" tier="plus"/);
});

test("the homepage's Plus savings rows are limited on the server, never hidden in the browser", () => {
  const lib = read("src/lib/top-deals.ts");
  assert.match(lib, /export const FREE_SAVINGS_ROWS = 1;/);
  assert.match(lib, /getDealList\(country, \{ sort: "pct", page: 1, pageSize: 25 \}, who\)/);
  assert.match(lib, /if \(list\.locked\) return \[\]/, "below full access this door returns no row");
  const route = read("src/app/api/top-deals/savings/route.ts");
  assert.match(route, /accessOf\("deal-finder", who\) !== "full"/);
  assert.match(route, /status: signedIn \? 402 : 401/);
  assert.match(route, /getMemberSavings\(country, who\)/);
  const ui = read("src/components/TodaysTopDeals.tsx");
  assert.doesNotMatch(ui, /items\.slice\(0, 1\)/, "no client-side hiding of rows the server sent");
  assert.match(ui, /\/api\/top-deals\/savings/);
});
