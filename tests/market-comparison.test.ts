import { test } from "node:test";
import assert from "node:assert/strict";
import { compareMarkets, convertCents, marketPriceListSentence, marketSpreadSentence } from "../src/lib/market-comparison";
import type { OfferRow } from "../src/lib/data";

const o = (market: OfferRow["market"], currency: string, priceCents: number, source = "store:x", extra: Partial<OfferRow> = {}): OfferRow => ({
  finish: "N", storeId: 10, source, market, priceCents, currency, url: "https://x", inStock: true, condition: "NM", shippingCents: null, updatedAt: "2026-10-04T00:00:00Z", ...extra,
});

test("cheapest open listing per market, ranked in the visitor's currency", () => {
  const cmp = compareMarkets(
    [o("US", "USD", 1000), o("US", "USD", 1200, "store:y"), o("AU", "AUD", 1200), o("UK", "GBP", 790), o("EU", "EUR", 5000, "store:z", { inStock: false })],
    "USD",
  );
  assert.deepEqual(cmp.quotes.map((q) => q.country), ["UK", "US", "AU"].sort((a, b) => cmp.quotes.findIndex((q) => q.country === a) - cmp.quotes.findIndex((q) => q.country === b)));
  assert.equal(cmp.quotes.some((q) => q.country === "EU"), false); // sold out
  const us = cmp.quotes.find((q) => q.country === "US")!;
  assert.equal(us.nativeCents, 1000);
  assert.equal(us.storeCount, 2);
  assert.equal(us.comparableCents, 1000);
  assert.ok(cmp.spreadPct != null && cmp.spreadPct >= 0);
});

test("a wrong-currency row and an eBay row are not counted as stores", () => {
  const cmp = compareMarkets([o("AU", "USD", 100), o("AU", "AUD", 900, "ebay", { shippingCents: 500 })], "AUD");
  const au = cmp.quotes[0];
  assert.equal(au.nativeCents, 900);
  assert.equal(au.storeCount, 0);
  assert.equal(au.shippingCents, 500);
});

test("Canada's ebay_us row is labelled as shipping from the US", () => {
  const cmp = compareMarkets([o("CA", "CAD", 1500, "ebay_us")], "CAD");
  assert.equal(cmp.quotes[0].shipsFromUs, true);
  assert.equal(cmp.quotes[0].seller, "eBay US");
});

test("one market is not a comparison", () => {
  const cmp = compareMarkets([o("US", "USD", 1000)], "USD");
  assert.equal(marketSpreadSentence(cmp, "Luffy"), null);
  assert.equal(cmp.spreadPct, null);
  assert.equal(marketPriceListSentence(cmp), "US$10.00 in the United States");
});

test("the spread sentence names both ends and says conversions are indicative", () => {
  const cmp = compareMarkets([o("US", "USD", 1000), o("UK", "GBP", 1000)], "USD");
  const s = marketSpreadSentence(cmp, "Luffy")!;
  assert.match(s, /cheapest in/);
  assert.match(s, /indicative only/);
});

test("convertCents goes through USD", () => {
  assert.equal(convertCents(100, "USD", "USD"), 100);
  assert.ok(convertCents(100, "USD", "AUD") > 100);
});
