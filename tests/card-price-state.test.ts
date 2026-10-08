import { test } from "node:test";
import assert from "node:assert/strict";
import type { Country } from "../src/lib/country";
import { elsewhereLine, hasNoRetailChannel, lastSeen, priceState } from "../src/lib/card-price-state";

const o = (market: Country, currency: string, source: string, inStock: boolean, priceCents = 100, updatedAt = "2026-10-01T00:00:00Z") => ({ market, currency, source, inStock, priceCents, updatedAt });

test("promo and event printings have no retail channel", () => {
  assert.equal(hasNoRetailChannel("promo", "standard"), true);
  assert.equal(hasNoRetailChannel("expansion", "gameday"), true);
  assert.equal(hasNoRetailChannel("expansion", "prerelease"), true);
  assert.equal(hasNoRetailChannel("expansion", "borderless"), false);
});

test("state: in market, elsewhere, empty", () => {
  const s = priceState([o("AU", "AUD", "store:a", true), o("UK", "GBP", "ebay", true)], "US", { marketUsd: null, setKind: "expansion", printing: "standard" });
  assert.equal(s.inMarket, false);
  assert.equal(s.hasListings, true);
  assert.equal(s.otherMarketStores, 1); // eBay is not a store
  assert.deepEqual(s.otherMarkets, ["AU", "UK"]);
  assert.equal(elsewhereLine(s), "1 store in other markets");
  const e = priceState([], "US", { marketUsd: null, setKind: "promo", printing: "promo" });
  assert.equal(e.isEmpty, true);
  assert.equal(e.noRetailChannel, true);
  assert.equal(priceState([], "US", { marketUsd: 5, setKind: "expansion", printing: "standard" }).isEmpty, false);
});

test("last seen is the newest sold-out non-eBay row in the market's currency", () => {
  const ls = lastSeen([o("US", "USD", "store:a", false, 500, "2026-09-01T00:00:00Z"), o("US", "USD", "store:b", false, 700, "2026-09-20T00:00:00Z"), o("US", "USD", "ebay", false, 1, "2026-10-02T00:00:00Z"), o("US", "USD", "store:c", true, 9)], "US");
  assert.equal(ls?.priceCents, 700);
  assert.equal(lastSeen([], "US"), null);
});
