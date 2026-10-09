// /price-guide's query layer: the URL as a CardQuery (pure), and the engine's answer over the 57 REAL products of tests/fixtures/magic-products.json (TCGCSV 2026-10-07). Owner WP07.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GUIDE_DEFAULT_SIZE, GUIDE_SORTS, guideCardQuery, guideHref, guideRobots, isGuideDefault, parseGuide, show30d, thirtyDayCoverage } from "../src/lib/price-guide-query";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import type { CardLite, SetLite } from "../src/lib/data";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

const SETS: SetLite[] = [
  { id: 3170, slug: "7ed-seventh-edition", tok: "7ed", code: "7ED", name: "Seventh Edition", tcgName: "Seventh Edition", kind: "core", releasedOn: "2001-04-11", bucket: false, cardCount: 350, trackedCount: 40, sealedCount: 4 },
  { id: 23219, slug: "mh3-modern-horizons-3", tok: "mh3", code: "MH3", name: "Modern Horizons 3", tcgName: "Modern Horizons 3", kind: "expansion", releasedOn: "2024-06-14", bucket: false, cardCount: 900, trackedCount: 300, sealedCount: 20 },
];

test("parse: defaults, sort and size validation, market override", () => {
  const q = parseGuide({});
  assert.equal(q.sort, "price-desc");
  assert.equal(q.size, GUIDE_DEFAULT_SIZE);
  assert.equal(q.market, null);
  assert.equal(isGuideDefault(q), true);
  const r = parseGuide({ sort: "nope", per: "7", market: "au" });
  assert.equal(r.sort, "price-desc");
  assert.equal(r.size, 100);
  assert.equal(r.market, "AU");
  assert.equal(isGuideDefault(r), false);
  assert.equal(parseGuide({ per: "24" }).size, 24);
  assert.equal(parseGuide({ per: "200" }).size, 100, "the engine pages 24, 48 or 100");
  assert.deepEqual(GUIDE_SORTS.map((s) => s.value), ["price-desc", "price-asc", "rising", "falling", "newest", "name", "number"]);
});

test("the guide's CardQuery: browse's filters, the guide's sort and size, the default floor", () => {
  const plain = guideCardQuery(parseGuide({}), SETS, "US");
  assert.deepEqual([plain.sort, plain.per, plain.page, plain.minCents], ["price-desc", 100, 1, 50]);
  const set = guideCardQuery(parseGuide({ set: "7ed", sort: "number", per: "48", page: "2", color: "green", finish: "foil" }), SETS, "AU");
  assert.deepEqual([set.sort, set.per, set.page, set.setIds, set.finish, set.minCents], ["number", 48, 2, [3170], "F", undefined]);
  assert.equal(guideCardQuery(parseGuide({ q: "birds of paradise" }), SETS, "US").q, "birds of paradise");
});

test("robots: the plain guide and a single-set guide are indexable, everything else noindex,follow", () => {
  assert.equal(guideRobots(parseGuide({})).index, true);
  assert.equal(guideRobots(parseGuide({ set: "7ed-seventh-edition" })).index, true);
  assert.equal(guideRobots(parseGuide({ set: "7ed,mh3" })).index, false);
  assert.equal(guideRobots(parseGuide({ q: "sol ring" })).index, false);
  assert.equal(guideRobots(parseGuide({ sort: "name" })).index, false);
  assert.equal(guideRobots(parseGuide({ page: "2" })).index, false);
  assert.equal(guideRobots(parseGuide({ format: "modern" })).index, false);
  assert.equal(guideRobots(parseGuide({ market: "AU" })).follow, true);
});

test("guideHref resets the page and keeps the rest", () => {
  assert.equal(guideHref({ set: "7ed", page: "3" }, { sort: "name" }), "/price-guide?set=7ed&sort=name");
  assert.equal(guideHref({ set: "7ed" }, { set: null }), "/price-guide");
});

const lite = (over: Partial<CardLite>): CardLite => ({ id: 1, low: { US: 100, AU: null, UK: null, SG: null, CA: null, EU: null }, marketUsd: 100, change30d: null, ...over }) as CardLite;
test("the 30-day column needs coverage of the priced rows", () => {
  const rows = [lite({ id: 1, change30d: 5 }), lite({ id: 2, change30d: -2 }), lite({ id: 3 }), lite({ id: 4, low: { US: null, AU: null, UK: null, SG: null, CA: null, EU: null }, marketUsd: null })];
  assert.equal(thirtyDayCoverage(rows, "US"), 2 / 3);
  assert.equal(show30d(rows, "US"), true);
  assert.equal(show30d(rows.map((r) => ({ ...r, change30d: null })), "US"), false);
  assert.equal(show30d([], "US"), false);
});

test("over real products: the guide opens on the MARKET price, never a thin listing; THIN-floor rows are out; a foil-only unit is shown as Foil", async () => {
  const dir = writePlaneDir(realMiniTree()), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  try {
    const { getCardPage, getSets } = await import("../src/lib/data");
    const sets = await getSets(), page = await getCardPage(guideCardQuery(parseGuide({}), sets, "US"));
    const tops = page.items.map((c) => [c.id, c.marketUsd, c.headFinish]);
    assert.deepEqual(tops[0], [630946, 184560, "F"], "Traveling Chocobo (FIN 551a, Neon Ink): US$1,845.60 market, foil-only");
    assert.deepEqual(tops[1], [557904, 177360, "F"], "Encore Electromancer (SLD 808): the US$5,999.92 ask is a thin low, the US$1,773.60 market ranks");
    assert.ok(page.items.every((c) => c.marketUsd != null && c.marketUsd >= 50), "a unit with only a thin listing (Living Artifact, 449401: US$203,067.70) never enters the guide");
    assert.ok(!page.items.some((c) => c.id === 449401 || c.id === 8989), "Black Lotus (2ED) and Living Artifact have a low and no market");
    assert.deepEqual(page.items.map((c) => c.marketUsd), [...page.items.map((c) => c.marketUsd)].sort((a, b) => b! - a!), "dearest first");
    const free = await getCardPage({ sort: "value", per: 100, includeUnlisted: false });
    const lowOnly = free.items.filter((c) => c.lowOnly);
    assert.ok(lowOnly.length >= 3 && lowOnly.every((c) => c.marketUsd == null && c.valueUsd != null), "a low-only row is shown as one: no market, a value to display");
    assert.ok(free.items.slice(0, free.items.length - lowOnly.length).every((c) => !c.lowOnly), "and every one of them sorts after every priced row");
    const asc = await getCardPage(guideCardQuery(parseGuide({ sort: "price-asc", min: "0.01" }), sets, "US"));
    assert.ok(asc.items[0]!.marketUsd != null && asc.items[0]!.marketUsd! <= asc.items[5]!.marketUsd!);
  } finally { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); fs.rmSync(dir, { recursive: true, force: true }); }
});
