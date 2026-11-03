import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@/lib/site-types";

const card = (id: number, name: string, number: string | null, rarity: string | null, image: string | null): Product => ({
  id, slug: String(id), name, kind: "card", setId: 1, number, rarity, attrs: {}, sealedType: null, image, tcgUrl: "", printings: [] });
const img = (id: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`;

test("a card without a photo borrows one from the same number and name", async () => {
  const { borrowImages } = await import("@/lib/import/tcgcsv");
  const list = [
    card(146748, "Dark Magician the Dragon Knight", "LEDD-ENA00", "Ultra Rare", img(146748)),
    card(606221, "Dark Magician the Dragon Knight", "LEDD-ENA00", "Ultra Rare", null),
    card(606300, "Dark Magician the Dragon Knight (Secret Rare)", "LEDD-ENA00", "Secret Rare", null),
    card(1, "Dark Magician", "LOB-005", "Ultra Rare", img(1)),
    card(2, "Dark Magician Girl", "LOB-005", "Ultra Rare", null),
    card(3, "Dark Magician", "SDY-006", "Ultra Rare", null),
  ];
  borrowImages(list);
  assert.equal(list[1].image, img(146748));
  assert.equal(list[2].image, img(146748), "a rarity suffix in the name is not a different card");
  assert.equal(list[4].image, null, "same number, other name: no photo is better than a wrong one");
  assert.equal(list[5].image, null, "same name, other number: art may differ");
});

test("the same rarity's photo wins", async () => {
  const { borrowImages } = await import("@/lib/import/tcgcsv");
  const list = [
    card(10, "Blue-Eyes White Dragon", "X-001", "Common", img(10)),
    card(11, "Blue-Eyes White Dragon", "X-001", "Ultra Rare", img(11)),
    card(12, "Blue-Eyes White Dragon", "X-001", "Ultra Rare", null),
  ];
  borrowImages(list);
  assert.equal(list[2].image, img(11));
});

test("an old set TCGplayer re-dated to today gets its neighbours' date back", async () => {
  const { fixRedatedSets } = await import("@/lib/import/tcgcsv");
  const now = new Date("2026-10-27T00:00:00Z");
  const set = (id: number, releasedOn: string) => ({ id, name: `S${id}`, code: "", slug: "", releasedOn, productCount: 1, upcoming: false });
  const sets = [
    set(1, "2025-01-24"), set(2, "2025-02-14"), set(3, "2025-03-14"), set(4, "2025-04-11"), set(5, "2025-05-02"),
    set(6, "2026-10-25"), // re-dated reprint, products from early 2025
    set(7, "2026-10-09"), // a real new set
  ];
  const ids: Record<number, number> = { 1: 586046, 2: 588104, 3: 594707, 4: 605103, 5: 614142, 6: 606221, 7: 711263 };
  const products = Object.entries(ids).map(([setId, id]) => ({ ...card(id, "x", null, null, null), setId: Number(setId) }));
  sets.push(set(8, "2026-01-23"), set(9, "2026-03-13"), set(10, "2026-08-07"), set(11, "2026-09-04"));
  products.push(...[[8, 663407], [9, 668392], [10, 693164], [11, 694826]].map(([setId, id]) => ({ ...card(id, "x", null, null, null), setId })));
  fixRedatedSets(sets, products, now);
  assert.equal(sets[5].releasedOn, "2025-03-14");
  assert.equal(sets[6].releasedOn, "2026-10-09");
});
