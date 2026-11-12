// Owner, 2026-11-12: "we just want eBay and TCGplayer as the paid links at the top". Source guards: Amazon draws a row only
// with a real price, never as a search row (table or sold-out product page).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the Amazon row needs a real price: no price, no row", () => {
  assert.match(read("components/OfferTable.tsx"), /if \(!live\?\.cents \|\| !live\.at \|\| !clock\) return null;/);
  assert.doesNotMatch(read("app/[region]/p/[slug]/page.tsx"), /AmazonProductRow/);
});
