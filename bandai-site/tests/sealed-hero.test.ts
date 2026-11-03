// The homepage sealed hero (lib/sealed-hero.ts): savings are real or absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storeSaving } from "../src/lib/sealed-hero";

test("a saving needs three stores and a believable gap", () => {
  assert.deepEqual(storeSaving(9000, [9000, 10000, 11000], null, "UK"), { pct: 10, vs: "stores" });
  assert.equal(storeSaving(9000, [9000, 10000], null, "UK"), null, "two stores is no typical price");
  assert.equal(storeSaving(4000, [4000, 10000, 11000], null, "UK"), null, "60% under the middle store is a wrong match");
  assert.equal(storeSaving(9900, [9900, 10000, 10100], null, "UK"), null, "1% is not worth a badge");
});

test("only the US compares against TCGplayer's (USD) market price", () => {
  assert.deepEqual(storeSaving(9000, [9000], 10000, "US"), { pct: 10, vs: "tcgplayer" });
  assert.equal(storeSaving(9000, [9000], 10000, "CA"), null);
});

test("the hero never calls eBay, Amazon or TCGplayer the cheapest store, and is off unless a site turns it on", () => {
  const lib = readFileSync("src/lib/sealed-hero.ts", "utf8");
  assert.match(lib, /NOT_A_STORE = new Set\(\["ebay", "amazon", "tcgplayer"\]\)/);
  assert.match(readFileSync("src/app/page.tsx", "utf8"), /SITE\.homeSealedHero \? sealedHero\(\) : null/);
});
