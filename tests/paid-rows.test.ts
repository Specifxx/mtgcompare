// Owner, 2026-11-12: "we just want eBay and TCGplayer as the paid links at the top". Source guards: Amazon draws a row only
// with a real price, never as a search row (table or sold-out product page).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the unpriced Amazon row is an ordinary last row (owner, 2026-11-17); a priced one stays pinned", () => {
  assert.doesNotMatch(read("components/OfferTable.tsx"), /if \(!live\?\.cents \|\| !live\.at \|\| !clock\) return null;/);
  assert.match(read("components/OfferTable.tsx"), /Check on Amazon/);
  assert.match(read("components/EbayStrip.tsx"), /amazon\?\.live \? \[\{ key: amazon\.key/);
  assert.match(read("components/EbayStrip.tsx"), /amazon && !amazon\.live &&/);
  assert.doesNotMatch(read("app/[region]/p/[slug]/page.tsx"), /AmazonProductRow|AmazonBelowTable/);
});
