// Owner, 2026-11-23 UX review, P0 5: typo-tolerant search, synonyms, and a "did you mean" fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProductCardData } from "../src/lib/data";
import { editDistance, searchCards, suggestQuery } from "../src/lib/search-index";

const card = (name: string, productType: string, setCode: string | null = null): ProductCardData => ({
  slug: name.toLowerCase().replace(/\W+/g, "-"), name, productType, setCode, imageUrl: null, lowestPriceCents: 1000, inStockStores: 2, listedStores: 2,
  marketplaceOpen: false, medianOpenCents: null, releaseDate: null,
});
const cards = [
  card("Charizard ex Premium Collection", "Premium Collection"),
  card("Charizard ex Super-Premium Collection", "Premium Collection"),
  card("Prismatic Evolutions Elite Trainer Box", "Elite Trainer Box"),
  card("Surging Sparks Booster Box", "Booster Box"),
];

test("one or two typos still find the product", () => {
  assert.equal(searchCards(cards, "charizard").length, 2);
  assert.equal(searchCards(cards, "charizrd").length, 2);
  assert.equal(searchCards(cards, "chrizard premium").length, 2);
  assert.equal(searchCards(cards, "prismtic").length, 1);
  assert.equal(searchCards(cards, "surgng sparks").length, 1);
});

test("did you mean names the corrected words, and only when a word matched nothing", () => {
  assert.equal(suggestQuery(cards, "charizrd"), "charizard");
  assert.equal(suggestQuery(cards, "charizard"), null);
  assert.equal(suggestQuery(cards, "zzzzzzzz"), null);
});

test("short words are never fuzzed (a 3-letter word means what it says)", () => {
  assert.equal(searchCards(cards, "etx").length, 0);
});

test("edit distance counts a swap as one edit", () => {
  assert.equal(editDistance("chraizard", "charizard", 2), 1);
  assert.equal(editDistance("abc", "xyz", 1), 2);
});
