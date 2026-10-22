import test from "node:test";
import assert from "node:assert/strict";
import { RIFT_SECTION, riftHistoryHref, tcgplayerIdFromImage } from "../src/lib/riftcompare";

test("the TCGplayer id comes from a TCGplayer image only", () => {
  assert.equal(tcgplayerIdFromImage("https://tcgplayer-cdn.tcgplayer.com/product/712094_in_1000x1000.jpg"), 712094);
  assert.equal(tcgplayerIdFromImage("https://cdn.shopify.com/s/files/1/abc.jpg"), null);
  assert.equal(tcgplayerIdFromImage(null), null);
});

test("RiftCompare's history link is off: RiftCompare has no Magic section, so no product links one (even one in scope)", () => {
  assert.equal(RIFT_SECTION, null);
  const img = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`;
  const p = (over: Partial<Parameters<typeof riftHistoryHref>[0]>) => riftHistoryHref({ imageUrl: img(541181), setReleaseDate: "2024-08-02", productType: "Play Booster Box", name: "Bloomburrow Play Booster Box", ...over });
  assert.equal(p({}), null, "a TCGplayer image, a set in scope, not a case: still no link");
  assert.equal(p({ setReleaseDate: "2020-02-07" }), null);
  assert.equal(p({ setReleaseDate: null }), null);
  for (const t of ["Play Booster Box Case", "Collector Booster Box Case", "Bundle Case"]) assert.equal(p({ productType: t }), null, t);
});
