import { test } from "node:test";
import assert from "node:assert/strict";
import { priceRows } from "../src/lib/price-rows";
import type { Offer } from "../src/lib/site-types";

const o = (source: string, market: Offer["market"], cents: number, inStock = true): Offer => ({ source, market, currency: market === "US" ? "USD" : "AUD", cents, inStock, url: "", title: "" });

test("in-stock rows first, cheapest item price first, and that row is the cheapest", () => {
  const r = priceRows([o("a", "US", 900, false), o("b", "US", 1500), o("ebay", "US", 1200), o("c", "AU", 100)], "US");
  assert.deepEqual(r.inStock.map((x) => x.source), ["ebay", "b"]);
  assert.deepEqual(r.outOfStock.map((x) => x.source), ["a"]);
  assert.equal(r.cheapest?.source, "ebay");
  assert.deepEqual(r.refs, []);
});

test("outside the US, TCGplayer and eBay US are references, never the cheapest", () => {
  const r = priceRows([o("tcgplayer", "US", 50), o("ebay", "US", 40), o("x", "US", 10), o("au1", "AU", 3000, false)], "AU");
  assert.equal(r.cheapest, null);
  assert.deepEqual(r.refs.map((x) => x.source), ["ebay", "tcgplayer"]);
  assert.deepEqual(r.outOfStock.map((x) => x.source), ["au1"]);
});

test("paidAlternative: eBay or TCGplayer within 50% when a store is cheapest, with how much more it is", () => {
  const r = priceRows([o("store1", "US", 1000), o("store2", "US", 1050), o("tcgplayer", "US", 1080), o("ebay", "US", 1100)], "US");
  assert.equal(r.cheapest?.source, "store1");
  assert.equal(r.paidAlternative?.offer.source, "tcgplayer");
  assert.equal(r.paidAlternative?.pctMore, 8);
  assert.equal(priceRows([o("store1", "US", 1000), o("tcgplayer", "US", 1501)], "US").paidAlternative, null, "past the band");
  assert.equal(priceRows([o("ebay", "US", 900), o("store1", "US", 1000)], "US").paidAlternative, null, "the cheapest already pays");
  assert.equal(priceRows([o("tcgplayer", "US", 1000), o("au1", "AU", 1000)], "AU").paidAlternative, null, "a US reference is never a local alternative");
});

test("display: eBay and TCGplayer first, the cheaper on top (local rows, else the US references), the rest by price, cheapest unchanged", () => {
  const us = priceRows([o("store1", "US", 1000), o("tcgplayer", "US", 1100), o("store2", "US", 1050), o("ebay", "US", 1300), o("store3", "US", 900, false)], "US");
  assert.deepEqual(us.display.map((x) => x.source), ["tcgplayer", "ebay", "store1", "store2", "store3"]);
  assert.deepEqual(us.pinned.map((x) => x.source), ["tcgplayer", "ebay"]);
  assert.deepEqual(priceRows([o("ebay", "US", 1000), o("tcgplayer", "US", 1100)], "US").pinned.map((x) => x.source), ["ebay", "tcgplayer"], "eBay cheaper");
  assert.deepEqual(priceRows([o("ebay", "US", 1100), o("tcgplayer", "US", 1100)], "US").pinned.map((x) => x.source), ["tcgplayer", "ebay"], "a tie");
  assert.equal(us.cheapest?.source, "store1");
  const au = priceRows([o("au1", "AU", 3000), o("tcgplayer", "US", 50), o("ebay", "US", 40)], "AU");
  assert.deepEqual(au.display.map((x) => x.source), ["ebay", "tcgplayer", "au1"]);
  assert.equal(au.cheapest?.source, "au1");
  const none = priceRows([o("store1", "US", 1000)], "US");
  assert.deepEqual(none.pinned, []);
});
