import test from "node:test";
import assert from "node:assert/strict";
import { riftHistoryHref, tcgplayerIdFromImage } from "../src/lib/riftcompare";

test("the TCGplayer id comes from a TCGplayer image only", () => {
  assert.equal(tcgplayerIdFromImage("https://tcgplayer-cdn.tcgplayer.com/product/712094_in_1000x1000.jpg"), 712094);
  assert.equal(tcgplayerIdFromImage("https://cdn.shopify.com/s/files/1/abc.jpg"), null);
  assert.equal(tcgplayerIdFromImage(null), null);
});

test("RiftCompare's history link: TCGplayer image, a set from Sword & Shield on, never a case", () => {
  const img = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`;
  const p = (over: Partial<Parameters<typeof riftHistoryHref>[0]>) => riftHistoryHref({ imageUrl: img(712094), setReleaseDate: "2026-11-06", productType: "Booster Box", name: "Delta Reign Booster Box", ...over });
  assert.equal(
    p({}),
    "https://riftcompare.com/pokemon/tcgplayer/712094?q=Delta+Reign+Booster+Box&utm_source=dexcompare&utm_medium=referral&utm_campaign=dex-product",
  );
  assert.ok(p({ setReleaseDate: "2020-02-07" }), "the first day is in scope");
  assert.equal(p({ setReleaseDate: "2019-11-01" }), null, "Cosmic Eclipse is out of scope");
  assert.equal(p({ setReleaseDate: null }), null, "no set, no date: not linked");
  assert.equal(p({ imageUrl: "~abc.jpg" }), null);
  for (const t of ["Booster Box Case", "Elite Trainer Box Case", "Booster Bundle Case"]) assert.equal(p({ productType: t }), null, `${t}: RiftCompare carries no cases`);
});
