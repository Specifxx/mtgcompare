// Pure helpers behind the browse landing pages: the SEO facet vocabulary of src/lib/facets.ts (owner WP01a), built on constants.ts, and the pager. (The keyword pages are WP08's: their
// extraction of Scryfall keywords is pinned by WP08's own test, not here.) Real vocabulary: the treatments, rarities and card types of the Magic catalogue.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  facetBySlug, paginate, pageSuffix, printingFacetHref, rarityFacetHref, treatmentFacetHref, typeFacetHref,
  PRINTING_FACETS, RARITY_FACETS, TREATMENT_FACETS, TREATMENT_INTRO, TYPE_FACETS, UNFACETED_PRINTINGS, UNFACETED_TREATMENTS,
} from "../src/lib/facets";
import * as facets from "../src/lib/facets";
import { CARD_TYPES, PRIMARY_TYPES, RARITIES, RARITY_KEYS, TREATMENTS } from "../src/lib/constants";

test("facets cover every treatment that is not hidden, every rarity and every primary type, with unique slugs", () => {
  assert.deepEqual(UNFACETED_TREATMENTS, []);
  assert.deepEqual(UNFACETED_PRINTINGS, []);
  assert.deepEqual(TREATMENT_FACETS.map((f) => f.key), TREATMENTS.filter((t) => !t.hidden).map((t) => t.key));
  assert.equal(TREATMENT_FACETS.length, 61, "74 keys less the 13 hidden ones");
  assert.deepEqual(RARITY_FACETS.map((f) => f.key).sort(), Object.keys(RARITIES).sort());
  assert.deepEqual(RARITY_FACETS.map((f) => f.key), [...RARITY_KEYS]);
  assert.deepEqual(TYPE_FACETS.map((f) => f.label), [...CARD_TYPES]);
  assert.deepEqual(TYPE_FACETS.map((f) => f.key), [...PRIMARY_TYPES]);
  for (const list of [TREATMENT_FACETS, RARITY_FACETS, TYPE_FACETS]) {
    assert.equal(new Set(list.map((f) => f.slug)).size, list.length);
    for (const f of list) assert.match(f.slug, /^[a-z0-9-]+$/);
  }
  assert.ok(!TREATMENT_FACETS.some((f) => ["nopw", "placing", "sb", "otherfoil"].includes(f.key) || f.key.startsWith("lang-")), "hidden keys have no page");
  assert.equal(PRINTING_FACETS, TREATMENT_FACETS, "the OP name is the same list");
});
test("every facet has a title and an authored intro that names no One Piece game term; a treatment added to the vocabulary without an intro fails here", () => {
  for (const f of [...TREATMENT_FACETS, ...RARITY_FACETS, ...TYPE_FACETS]) {
    assert.ok(f.title.length > 3 && f.label.length > 1, f.key);
    assert.ok(f.intro.length > 30, `${f.key} has no intro`);
    assert.doesNotMatch(f.intro + f.title, /\b(?:Leader|DON!!|One Piece|Straw Hat|Life cards?)\b/, f.key);
  }
  assert.deepEqual(Object.keys(TREATMENT_INTRO).sort(), TREATMENT_FACETS.map((f) => f.key).sort(), "an intro for each page and none for a hidden key");
  assert.equal(TREATMENT_FACETS.find((f) => f.key === "etched")!.title, "Foil Etched cards");
  assert.equal(RARITY_FACETS.find((f) => f.key === "M")!.title, "Mythic Rare cards");
  assert.equal(TYPE_FACETS.find((f) => f.key === "planeswalker")!.title, "Planeswalker cards");
});
test("a facet is found by its slug, whatever the case; its link points at the filter page", () => {
  assert.equal(facetBySlug(TREATMENT_FACETS, "Borderless")?.key, "borderless");
  assert.equal(facetBySlug(TREATMENT_FACETS, "doublerainbow")?.label, "Double Rainbow Foil");
  assert.equal(facetBySlug(RARITY_FACETS, "mythic")?.key, "M");
  assert.equal(facetBySlug(RARITY_FACETS, "land")?.label, "Basic Land");
  assert.equal(facetBySlug(TYPE_FACETS, "Planeswalker")?.key, "planeswalker");
  assert.equal(facetBySlug(TYPE_FACETS, "leader"), undefined, "there is no Leader in Magic");
  assert.equal(facetBySlug(TYPE_FACETS, "nope"), undefined);
  assert.equal(facetBySlug(TREATMENT_FACETS, "sb"), undefined);
  assert.equal(treatmentFacetHref("etched"), "/cards/treatment/etched");
  assert.equal(printingFacetHref("surge"), "/cards/treatment/surge");
  assert.equal(treatmentFacetHref("standard"), "/cards", "no treatment, no page");
  assert.equal(treatmentFacetHref("lang-es"), "/cards");
  assert.equal(rarityFacetHref("M"), "/cards/rarity/mythic");
  assert.equal(rarityFacetHref("L"), "/cards/rarity/land");
  assert.equal(rarityFacetHref("SEC"), "/cards/rarity", "an OP letter has no page");
  assert.equal(typeFacetHref("creature"), "/cards/type/creature");
  assert.equal(typeFacetHref("Leader"), "/cards");
});
test("the OP-only helpers are gone: no leaderSlug, no DON!! facet", () => {
  assert.equal("leaderSlug" in facets, false);
  assert.ok(![...TREATMENT_FACETS, ...RARITY_FACETS, ...TYPE_FACETS].some((f) => /don|leader|manga|parallel/i.test(f.slug)));
});
test("paginate clamps the page and slices; pageSuffix is empty on the first page", () => {
  const p = paginate([1, 2, 3, 4, 5], "9", 2);
  assert.deepEqual([p.page, p.pages, p.slice], [3, 3, [5]]);
  assert.deepEqual(paginate([1, 2, 3, 4, 5], undefined, 2).slice, [1, 2]);
  assert.deepEqual(paginate([1, 2, 3, 4, 5], "-4", 2).slice, [1, 2]);
  assert.deepEqual(paginate([1, 2, 3, 4, 5], "abc", 2).slice, [1, 2]);
  assert.equal(paginate([], undefined, 10).pages, 1);
  assert.equal(paginate(new Array(98796).fill(0), "2", 100).pages, 988, "the 98,796 catalogue rows at 100 a page");
  assert.deepEqual([pageSuffix(undefined), pageSuffix("1"), pageSuffix("2"), pageSuffix("x"), pageSuffix("0")], ["", "", "?page=2", "", ""]);
});
