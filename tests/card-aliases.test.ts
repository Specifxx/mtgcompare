import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CARD_ALIASES, aliasesFor, slugsForAlias } from "../src/lib/card-aliases";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

test("the table is seeded empty and every entry would be well formed", () => {
  assert.deepEqual(CARD_ALIASES, {});
  for (const [slug, list] of Object.entries(CARD_ALIASES)) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(list.length > 0 && list.every((a) => a.trim().length >= 3));
  }
});

// A table of the test's own, on slugs of real products (tests/fixtures/magic-products.json): the lookup rules, not a claim about what players call a card.
const table = { "sol-ring-babp-1": ["Rock", "Sol Ring (Promo Pack)"], "khan-engineered-evil-sheoldred-the-apocalypse-sds-11-borderless": ["Khan"] };

test("an alias resolves to its printing, ignoring case, punctuation and accents", () => {
  assert.deepEqual(slugsForAlias("rock", table), ["sol-ring-babp-1"]);
  assert.deepEqual(slugsForAlias("  SOL-RING (promo pack) ", table), ["sol-ring-babp-1"]);
  assert.deepEqual(slugsForAlias("Khan", table), ["khan-engineered-evil-sheoldred-the-apocalypse-sds-11-borderless"]);
  assert.deepEqual(slugsForAlias("sol", table), []); // an alias is an exact phrase
  assert.deepEqual(slugsForAlias("", table), []);
  assert.deepEqual(aliasesFor("sol-ring-babp-1", table), ["Rock", "Sol Ring (Promo Pack)"]);
  assert.deepEqual(aliasesFor("nothing", table), []);
});

test("search with no aliases behaves as before: a real card name finds it, nonsense finds nothing", async () => {
  const dir = writePlaneDir(realMiniTree()), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  try {
    const { searchCards } = await import("../src/lib/data");
    assert.deepEqual((await searchCards("sol ring")).items.map((c) => c.id), [594545]);
    assert.deepEqual((await searchCards("nonexistent thing")).items, []);
  } finally { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); fs.rmSync(dir, { recursive: true, force: true }); }
});
