import test from "node:test";
import assert from "node:assert/strict";
import { loadStoreListings } from "../src/lib/basket-server";
import { basketStoreKey } from "../src/lib/shipping";
import { basketStoresFor } from "../src/lib/shipping";
import type { BasketListingTuple } from "../src/lib/data";

// What may enter a Best Basket (wave-2 plan, Track 3 item 1): store listings
// and TCGplayer's own listing, never an eBay row, and never a reference price
// (TCGplayer's market price is a figure, not an Offer row, so it cannot be one).

test("only store: and tcgplayer listing sources have a basket key; every eBay source has none", () => {
  assert.equal(basketStoreKey("store:blackvaultgaming"), "blackvaultgaming");
  assert.equal(basketStoreKey("tcgplayer"), "tcgplayer");
  for (const s of ["ebay_us", "ebay_au", "ebay_uk", "ebay", "ebay_search", "tcgplayer_market", "", "store:"]) assert.equal(basketStoreKey(s), null, s);
});

test("the optimiser's input drops eBay and reference rows even if a loader handed them over", async () => {
  const stores = basketStoresFor("US", {});
  const real = Object.keys(stores).find((k) => k !== "tcgplayer")!;
  assert.ok(real, "fixture: the US basket has real stores");
  const rows: BasketListingTuple[] = [
    [1, `store:${real}`, 500, "NM", "https://s/1"],
    [1, "ebay_us", 100, null, "https://ebay/1"], // cheaper, but never a basket row
    [1, "tcgplayer_market", 50, null, "https://tcg/ref"],
    [2, "ebay_us", 90, null, "https://ebay/2"],
  ];
  const m = await loadStoreListings(["1", "2"], "US", Object.keys(stores), "any", async () => rows);
  assert.deepEqual(m.get("1")?.map((l) => l.retailer), [real], "only the store's row survives, though eBay was cheaper");
  assert.equal(m.has("2"), false, "a card only eBay lists is simply not in stock for the basket");
});

test("a store outside the basket's map is dropped too, and the cheapest copy per (card, store) wins", async () => {
  const stores = basketStoresFor("US", {});
  const real = Object.keys(stores).find((k) => k !== "tcgplayer")!;
  const rows: BasketListingTuple[] = [
    [1, `store:${real}`, 700, "NM", "https://s/a"],
    [1, `store:${real}`, 650, "LP", "https://s/b"],
    [1, "store:not-a-tracked-store", 10, "NM", "https://s/c"],
  ];
  const m = await loadStoreListings(["1"], "US", Object.keys(stores), "any", async () => rows);
  assert.deepEqual(m.get("1"), [{ retailer: real, priceCents: 650, url: "https://s/b", condition: "LP" }]);
  const nm = await loadStoreListings(["1"], "US", Object.keys(stores), "nm", async () => rows);
  assert.deepEqual(nm.get("1")?.map((l) => l.priceCents), [700], "an NM floor drops the LP row, never swaps in a better copy");
});
