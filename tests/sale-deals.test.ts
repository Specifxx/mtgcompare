// The Black Friday / Cyber Monday deal list's filters, sort, freshness flag and sparkline (src/lib/sale-deals.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, DEFAULT_FILTERS, deliveredCents, isStale, sparkPath, typesOf, type SaleDealRow } from "../src/lib/sale-deals";

const row = (o: Partial<SaleDealRow>): SaleDealRow => ({
  slug: "x", name: "X", productType: "Booster Box", imageUrl: null, japanese: false, preorder: false, priceCents: 10000, storeName: "S",
  buyHref: "#", buyRel: "nofollow", retailer: "s", ebayHref: "#", checkedAt: new Date().toISOString(), shipMinCents: null, shipText: null,
  packs: null, median: null, typical: null, spark: [], ...o,
});

const rows = [
  row({ slug: "a", name: "A", priceCents: 399, productType: "Booster Pack", packs: 1, typical: { pct: 20, cents: 499, lowest: false, sinceDay: "2026-10-24" } }),
  row({ slug: "b", name: "B", priceCents: 359900, productType: "Booster Box Case", packs: 216, typical: { pct: 40, cents: 599900, lowest: true, sinceDay: "2026-10-24" }, median: { pct: 24, cents: 470000 } }),
  row({ slug: "c", name: "C", priceCents: 12000, japanese: true, median: { pct: 30, cents: 17000 } }),
  row({ slug: "d", name: "D", priceCents: 6000, preorder: true, typical: { pct: 12, cents: 6800, lowest: false, sinceDay: "2026-10-24" } }),
];

test("the toggle keeps only rows with a discount on that basis, biggest first", () => {
  assert.deepEqual(applyFilters(rows, DEFAULT_FILTERS).map((r) => r.slug), ["b", "a", "d"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, basis: "median" }).map((r) => r.slug), ["c", "b"]);
});

test("filters: type, price band, language, availability", () => {
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, type: "Booster Pack" }).map((r) => r.slug), ["a"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, band: "u50" }).map((r) => r.slug), ["a"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, basis: "median", lang: "ja" }).map((r) => r.slug), ["c"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, stock: "pre" }).map((r) => r.slug), ["d"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, stock: "now" }).map((r) => r.slug), ["b", "a"]);
});

test("sort by price and by price per pack (unknown packs last)", () => {
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, sort: "price" }).map((r) => r.slug), ["a", "d", "b"]);
  assert.deepEqual(applyFilters(rows, { ...DEFAULT_FILTERS, sort: "pack" }).map((r) => r.slug), ["a", "b", "d"]);
});

test("types, delivered price, freshness flag and sparkline", () => {
  assert.deepEqual(typesOf(rows, "median"), ["Booster Box", "Booster Box Case"]);
  assert.equal(deliveredCents(row({ priceCents: 1000, shipMinCents: 500 })), 1500);
  assert.equal(deliveredCents(row({})), null);
  const now = Date.parse("2026-11-24T12:00:00Z");
  assert.equal(isStale("2026-11-24T01:00:00Z", now), false);
  assert.equal(isStale("2026-11-23T23:00:00Z", now), true);
  assert.equal(sparkPath([null, 100], 72, 22), "");
  assert.match(sparkPath([100, null, 200, 150], 72, 22), /^M0\.0,21\.0 L48\.0,1\.0 L72\.0,11\.0$/);
});
