import { test } from "node:test";
import assert from "node:assert/strict";
import { isChasePrinting, selectPicks, type PickCard } from "../src/lib/listing-panel";

const L = (price: number, img: string | null = "https://i.ebayimg.com/a.jpg") => ({ priceCents: price, shippingCents: 0, currency: "USD", url: "https://x", title: "t", imageUrl: img as string });
const c = (id: number, usd: number, listings: PickCard["listings"]): PickCard => ({ id, slug: `c${id}`, name: `C${id}`, number: null, variant: null, setCode: "OP13", marketUsd: usd, listings });

test("picks show only cards with a listing in the visitor's market, dearest first, capped", () => {
  const cards = [c(1, 100, { US: L(1) }), c(2, 900, { US: L(2), AU: L(3) }), c(3, 500, { AU: L(4) }), c(4, 700, { US: L(5, "") })];
  assert.deepEqual(selectPicks(cards, "US").map((x) => x.id), [2, 1]); // 4 has no image, 3 has no US listing
  assert.deepEqual(selectPicks(cards, "AU").map((x) => x.id), [2, 3]);
  assert.equal(selectPicks(cards, "UK").length, 0);
  assert.equal(selectPicks(Array.from({ length: 10 }, (_, i) => c(i, i, { US: L(1) })), "US", 6).length, 6);
});

test("a market's listing is never shown under another market's currency", () => {
  const out = selectPicks([c(1, 5, { AU: { ...L(1), currency: "AUD" } })], "US");
  assert.equal(out.length, 0);
});

test("chase printings: SP, Manga, Parallel, Treasure and Secret Rare", () => {
  assert.equal(isChasePrinting({ printing: "manga", rarity: "SEC" }), true);
  assert.equal(isChasePrinting({ printing: "standard", rarity: "SEC" }), true);
  assert.equal(isChasePrinting({ printing: "standard", rarity: "R" }), false);
  assert.equal(isChasePrinting({ printing: "alt", rarity: "R" }), true);
});
