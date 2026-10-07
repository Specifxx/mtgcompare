import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryDescription, galleryFacets, galleryFilter, gallerySort, galleryTitle, setGalleryTitle } from "../src/lib/gallery-seo";
import type { CardLite } from "../src/lib/data";

const c = (id: number, name: string, number: string, over: Partial<CardLite> = {}): CardLite => ({
  id, slug: `c${id}`, name, number, setId: 1, rarity: "R", variant: null, printing: "standard", colors: ["Red"], cardType: null, cost: null, power: null, counter: null, life: null, hasImage: true,
  marketUsd: null, low: {} as never, stores: {} as never, change7d: null, change30d: null, high90Usd: null, ...over,
});
const cards = [c(1, "Zoro", "OP01-025", { colors: ["Green"], marketUsd: 500 }), c(2, "Nami", "OP01-016", { rarity: "SR", printing: "alt", variant: "Parallel" }), c(3, "Luffy", "OP01-003", { colors: ["Red", "Green"], marketUsd: 9000 }), c(4, "Ace", "OP01-002")];

test("titles stay inside 60 and carry the count", () => {
  assert.match(galleryTitle(7255), /7,255/);
  assert.ok(`${galleryTitle(7255)} | OP Compare`.length <= 75);
  assert.ok(galleryTitle(7255).length <= 60);
  assert.ok(setGalleryTitle("Awakening of the New Era", "OP05", 280).length <= 60);
  assert.match(galleryDescription(10, ["A", "B", "C"]), /A to C/);
  assert.match(galleryDescription(0, []), /every set|set by set/);
});

test("facets count what is present, a two-colour card counts in both", () => {
  const f = galleryFacets(cards);
  assert.deepEqual(f.colors.find(([k]) => k === "Green"), ["Green", 2]);
  assert.deepEqual(f.printings, [["standard", 3], ["alt", 1]]);
});

test("filter by facet and by name or number, sort by number or value", () => {
  assert.deepEqual(galleryFilter(cards, "", { color: "Green", rarity: null, printing: null }).map((x) => x.id), [1, 3]);
  assert.deepEqual(galleryFilter(cards, "parallel", { color: null, rarity: null, printing: null }).map((x) => x.id), [2]);
  assert.deepEqual(galleryFilter(cards, "op01-003", { color: null, rarity: null, printing: null }).map((x) => x.id), [3]);
  assert.deepEqual(galleryFilter(cards, "nam", { color: "Green", rarity: null, printing: null }), []);
  assert.deepEqual(gallerySort(cards, "number").map((x) => x.number), ["OP01-002", "OP01-003", "OP01-016", "OP01-025"]);
  assert.deepEqual(gallerySort(cards, "value").map((x) => x.id).slice(0, 2), [3, 1]);
});
