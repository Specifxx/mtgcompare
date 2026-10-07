// Review fixes on the tools track: deck lines priced from store listings only
// (never an eBay ask), the free Buy List total's played-copy count, and the
// paged facet pages' canonical suffix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { storeLows } from "../src/lib/deck";
import { pageSuffix } from "../src/lib/facets";

const MK = ["US", "UK", "EU"] as const;
const o = (source: string, market: string, priceCents: number, inStock = true) => ({ source, market, priceCents, inStock });

test("storeLows: cheapest in-stock store or TCGplayer listing per market, eBay never counted", () => {
  const low = storeLows(
    [o("ebay_us", "US", 100), o("ebay", "UK", 90), o("tcgplayer", "US", 250), o("store:a", "US", 240), o("store:b", "US", 120, false), o("store:c", "UK", 300), o("store:d", "XX", 1)],
    MK,
  );
  assert.deepEqual(low, { US: 240, UK: 300, EU: null });
});

test("storeLows: no offers means every market is null", () => {
  assert.deepEqual(storeLows([], MK), { US: null, UK: null, EU: null });
});

test("pageSuffix: only pages past the first get ?page=N", () => {
  assert.equal(pageSuffix(undefined), "");
  assert.equal(pageSuffix("1"), "");
  assert.equal(pageSuffix("junk"), "");
  assert.equal(pageSuffix("3"), "?page=3");
});
