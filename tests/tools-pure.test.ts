// Pure helpers behind the wave-1 pages: keyword extraction and the SEO facet
// vocabulary. (The selling-fee maths moved to tests/selling-fees.test.ts with
// RiftCompare's calculator; the Buy List Planner's condition floor went with
// the planner — Best Basket's is tests/min-condition.test.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardKeywords, KEYWORDS } from "../src/lib/keywords";
import { facetBySlug, leaderSlug, paginate, PRINTING_FACETS, RARITY_FACETS, TYPE_FACETS, UNFACETED_PRINTINGS } from "../src/lib/facets";
import { PRINTINGS, RARITIES, CARD_TYPES } from "../src/lib/constants";

test("cardKeywords reads bracketed keywords, Activate:Main both ways, DON!! ×N folded", () => {
  assert.deepEqual(cardKeywords("[Blocker]\n[On Play] Draw 1 card."), ["blocker", "on-play"]);
  assert.deepEqual(cardKeywords("[Activate:Main] [Once Per Turn] Rest this."), ["activate-main", "once-per-turn"]);
  assert.deepEqual(cardKeywords("[DON!! x1] [When Attacking] ..."), ["when-attacking", "don-x"]);
  assert.deepEqual(cardKeywords("[Rush: Character]"), ["rush-character"]);
  assert.deepEqual(cardKeywords("If your Leader has the \"Blackbeard Pirates\" type, this Character gains [Blocker] and +4 cost."), ["blocker"]);
  assert.deepEqual(cardKeywords("add up to 1 [Trafalgar Law] from your trash"), []);
  assert.deepEqual(cardKeywords(null), []);
  assert.equal(new Set(KEYWORDS.map((k) => k.slug)).size, KEYWORDS.length);
});

test("facets cover every printing, rarity and card type, with unique slugs", () => {
  assert.deepEqual(UNFACETED_PRINTINGS, []);
  assert.deepEqual(RARITY_FACETS.map((f) => f.key).sort(), Object.keys(RARITIES).sort());
  assert.deepEqual(TYPE_FACETS.map((f) => f.key), [...CARD_TYPES]);
  for (const list of [PRINTING_FACETS, RARITY_FACETS, TYPE_FACETS]) {
    assert.equal(new Set(list.map((f) => f.slug)).size, list.length);
    for (const f of list) assert.match(f.slug, /^[a-z0-9-]+$/);
  }
  assert.equal(facetBySlug(PRINTING_FACETS, "Parallel")?.key, "alt");
  assert.equal(facetBySlug(RARITY_FACETS, "secret-rare")?.key, "SEC");
  assert.equal(facetBySlug(TYPE_FACETS, "nope"), undefined);
  assert.ok(Object.keys(PRINTINGS).length >= PRINTING_FACETS.length);
});

test("leaderSlug and paginate", () => {
  assert.equal(leaderSlug("Monkey.D.Luffy", "OP05-060"), "monkey-d-luffy-op05-060");
  const p = paginate([1, 2, 3, 4, 5], "9", 2);
  assert.deepEqual([p.page, p.pages, p.slice], [3, 3, [5]]);
  assert.equal(paginate([], undefined, 10).pages, 1);
});
