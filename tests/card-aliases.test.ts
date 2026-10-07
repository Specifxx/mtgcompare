import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_ALIASES, aliasesFor, slugsForAlias } from "../src/lib/card-aliases";
import { searchCards } from "../src/lib/search";
import type { CardLite, SetLite } from "../src/lib/data";

test("the table is seeded empty and every entry would be well formed", () => {
  assert.deepEqual(CARD_ALIASES, {});
  for (const [slug, list] of Object.entries(CARD_ALIASES)) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(list.length > 0 && list.every((a) => a.trim().length >= 3));
  }
});

const table = { "luffy-gear-5-op05-119-manga": ["Gear 5 Luffy", "Sun God manga"], "shanks-op01-120-parallel": ["Red Hair"] };

test("an alias resolves to its card, ignoring case, punctuation and accents", () => {
  assert.deepEqual(slugsForAlias("gear 5 luffy", table), ["luffy-gear-5-op05-119-manga"]);
  assert.deepEqual(slugsForAlias("  SUN-GOD Manga ", table), ["luffy-gear-5-op05-119-manga"]);
  assert.deepEqual(slugsForAlias("red hair", table), ["shanks-op01-120-parallel"]);
  assert.deepEqual(slugsForAlias("luffy", table), []); // an alias is an exact phrase
  assert.deepEqual(slugsForAlias("", table), []);
  assert.deepEqual(aliasesFor("shanks-op01-120-parallel", table), ["Red Hair"]);
  assert.deepEqual(aliasesFor("nothing", table), []);
});

test("search with no aliases behaves as before", () => {
  const sets = new Map<number, SetLite>([[1, { id: 1, slug: "op01", code: "OP01", name: "Romance Dawn", kind: "booster", releasedOn: "2022-12-02", cardCount: 1, sealedCount: 0 }]]);
  const card = { id: 1, slug: "shanks-op01-120", name: "Shanks", number: "OP01-120", setId: 1, rarity: "SEC", variant: null, printing: "standard", colors: ["Red"], cardType: "Leader", hasImage: true, marketUsd: 100, low: {}, stores: {}, change7d: null, change30d: null, high90Usd: null } as unknown as CardLite;
  assert.deepEqual(searchCards([card], sets, "shanks").map((c) => c.id), [1]);
  assert.deepEqual(searchCards([card], sets, "nonexistent thing"), []);
});
