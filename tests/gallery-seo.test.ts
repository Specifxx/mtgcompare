import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryDescription, galleryFacets, galleryFilter, gallerySort, galleryTitle, setGalleryTitle } from "../src/lib/gallery-seo";
import type { CardLite } from "../src/lib/data";

const c = (id: number, name: string, number: string, over: Partial<CardLite> = {}): CardLite => ({
  id, slug: `c${id}`, name, alt: null, setId: 1, sc: "mh3", setCode: "MH3", number, rarity: "R", cls: 0, treat: [], label: null, flags: 0, oracleNo: null, scryId: null, colorMask: 8, mv: 0, ptype: 0,
  marketUsd: null, headFinish: "N", valueUsd: null, lowOnly: false, n: null, f: null, tracked: 0, listed: true, top: false, thin: false,
  low: {} as never, stores: {} as never, change7d: null, change30d: null, high90Usd: null,
  colors: ["Red"], variant: null, printing: "standard", cost: null, cardType: null, hasImage: true, ...over,
});
// Real products of tests/fixtures/magic-products.json: Counterspell and Case of the Locked Hothouse, Sol Ring, Lightning Bolt.
const cards = [
  c(238617, "Counterspell", "267", { colors: ["Blue"], marketUsd: 394 }),
  c(533889, "Case of the Locked Hothouse", "155", { colors: ["Green"], rarity: "M", printing: "borderless", variant: "Borderless" }),
  c(9, "Ajani, Nacatl Pariah", "9", { colors: ["White", "Red"], marketUsd: 9000 }),
  c(4, "Lightning Bolt", "2"),
];

test("titles stay inside 60 and carry the count", () => {
  assert.match(galleryTitle(109500), /109,500/);
  assert.ok(`${galleryTitle(109500)} | MTG Compare`.length <= 75);
  assert.ok(galleryTitle(109500).length <= 60);
  assert.ok(setGalleryTitle("Universes Beyond: Assassin's Creed", "ACR", 1280).length <= 60);
  assert.match(galleryDescription(10, ["A", "B", "C"]), /A to C/);
  assert.match(galleryDescription(0, []), /every set|set by set/);
});

test("facets count what is present, a two-colour card counts in both", () => {
  const f = galleryFacets(cards);
  assert.deepEqual(f.colors.find(([k]) => k === "Red"), ["Red", 2]);
  assert.deepEqual(f.printings, [["standard", 3], ["borderless", 1]]);
});

test("filter by facet and by name or number, sort by number or value", () => {
  assert.deepEqual(galleryFilter(cards, "", { color: "Red", rarity: null, printing: null }).map((x) => x.id), [9, 4]);
  assert.deepEqual(galleryFilter(cards, "borderless", { color: null, rarity: null, printing: null }).map((x) => x.id), [533889]);
  assert.deepEqual(galleryFilter(cards, "267", { color: null, rarity: null, printing: null }).map((x) => x.id), [238617]);
  assert.deepEqual(galleryFilter(cards, "count", { color: "Green", rarity: null, printing: null }), []);
  assert.deepEqual(gallerySort(cards, "number").map((x) => x.number), ["2", "9", "155", "267"], "collector numbers sort as numbers");
  assert.deepEqual(gallerySort(cards, "value").map((x) => x.id).slice(0, 2), [9, 238617]);
});
