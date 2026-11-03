import { test } from "node:test";
import assert from "node:assert/strict";
import { ebayReferenceUsd, ebayTrusted, tcgplayerOfferCents } from "@/lib/import/sanity";

test("a TCGplayer low under half the market shows the market price", () => {
  // Hyperia City booster box, 2026-10-27: low $1.00, market $150.67.
  assert.equal(tcgplayerOfferCents([100], 15067), 15067);
  assert.equal(tcgplayerOfferCents([13999], 15067), 13999);
  assert.equal(tcgplayerOfferCents([], 15067), 15067);
  assert.equal(tcgplayerOfferCents([500], null), 500);
  assert.equal(tcgplayerOfferCents([1], 15), 1);
  assert.equal(tcgplayerOfferCents([], null), null);
});

test("eBay rows need a reference and must sit within 0.25x-4x of it", () => {
  // Stardust Trails booster pack, 2026-10-27: no TCGplayer price, stores ~$5-12,
  // eBay rows at $74-$129 were booster boxes.
  const ref = ebayReferenceUsd(null, [12, 5.5, 6.65].map((d) => d * 100));
  assert.equal(ref, 550);
  assert.equal(ebayTrusted(8263, ref), false);
  assert.equal(ebayTrusted(700, ref), true);
  assert.equal(ebayTrusted(700, null), false);
  assert.equal(ebayReferenceUsd(15067, [100]), 15067);
});
