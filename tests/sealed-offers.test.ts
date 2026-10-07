import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { OFFER_STALE_H, headlineOffer, offerStock, offerStockLabel, openStoreCount, rankOffers, soldOutEverywhere } from "../src/lib/sealed-offers";
import { sealedQuickViewPayload } from "../src/lib/sealed-quick-view";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const h = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();
const o = (priceCents: number, inStock: boolean, ageH = 1) => ({ priceCents, inStock, lastSeen: h(ageH) });

test("three states: open, sold out, and unknown once a row is older than the stale window", () => {
  assert.equal(offerStock(o(100, true), NOW), "open");
  assert.equal(offerStock(o(100, false), NOW), "soldout");
  assert.equal(offerStock(o(100, true, OFFER_STALE_H + 1), NOW), "unknown");
  assert.equal(offerStock({ priceCents: 1, inStock: true }, NOW), "open"); // no timestamp: trust the flag
});

test("the headline is the cheapest OPEN offer, never a sold-out or stale one", () => {
  const rows = [o(5000, false), o(9000, true), o(7000, true), o(1000, true, 100)];
  assert.equal(headlineOffer(rows, NOW)?.priceCents, 7000);
  assert.equal(headlineOffer([o(1, false)], NOW), null);
  assert.deepEqual(rankOffers(rows, NOW).map((r) => r.priceCents), [7000, 9000, 1000, 5000]);
});

test("sold out everywhere needs every store fresh and sold out", () => {
  assert.equal(soldOutEverywhere([o(1, false), o(2, false)], NOW), true);
  assert.equal(soldOutEverywhere([o(1, false), o(2, false, 100)], NOW), false); // one stale: unknown
  assert.equal(soldOutEverywhere([o(1, false), o(2, true)], NOW), false);
  assert.equal(soldOutEverywhere([], NOW), false);
});

test("labels and open store count", () => {
  assert.equal(offerStockLabel("open", true), "Pre-order open");
  assert.equal(offerStockLabel("open", false), "In stock");
  assert.equal(offerStockLabel("soldout", false), "Sold out");
  assert.equal(offerStockLabel("unknown", false), "Unknown");
  assert.equal(openStoreCount([{ ...o(1, true), retailer: "a" }, { ...o(2, true), retailer: "a" }, { ...o(3, false), retailer: "b" }], NOW), 1);
});

test("the stale window matches the data layer's", () => {
  const data = fs.readFileSync(path.resolve(__dirname, "../src/lib/data.ts"), "utf8");
  assert.match(data, new RegExp(`STALE_MS = ${OFFER_STALE_H} \\* 3600 \\* 1000`));
});

test("the quick-view payload is market-independent, per-market in its own currency, and tags links", () => {
  const p = sealedQuickViewPayload(
    {
      id: 7, slug: "op01-box", name: "Romance Dawn Booster Box", setId: 1, kind: "Booster Box", packCount: 24, imageUrl: null, releasedOn: "2022-12-02", presale: false, marketUsd: 12000,
      change7d: null, tcgplayerUrl: "https://www.tcgplayer.com/product/7",
      offers: [
        { source: "store:x", market: "US", priceCents: 11000, currency: "USD", url: "https://x.com/a", inStock: true, condition: null, shippingCents: null, updatedAt: h(2) },
        { source: "store:y", market: "US", priceCents: 9999, currency: "AUD", url: "https://y.com/a", inStock: true, condition: null, shippingCents: null, updatedAt: h(2) },
        { source: "ebay", market: "AU", priceCents: 20000, currency: "AUD", url: "https://ebay.com.au/i", inStock: true, condition: null, shippingCents: 0, updatedAt: h(2) },
      ],
    },
    { code: "OP01", name: "Romance Dawn", slug: "op01" },
    "2026-10-04",
  );
  assert.equal(p.markets.US.offers.length, 1); // the AUD row in the US market is dropped
  assert.equal(p.markets.AU.offers[0].ebay, true);
  assert.match(p.markets.EU.ebaySearch, /ebay/);
  assert.equal(p.preRelease, false);
  assert.ok(p.tcgHref.length > 0);
});
