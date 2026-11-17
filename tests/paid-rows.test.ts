// Owner, 2026-11-12: "we just want eBay and TCGplayer as the paid links at the top". Source guards: Amazon draws a row only
// with a real price, never as a search row (table or sold-out product page).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("Amazon (priced or the unpriced Check row) is an affiliated row at the top (owner, 2026-11-17)", () => {
  assert.doesNotMatch(read("components/OfferTable.tsx"), /if \(!live\?\.cents \|\| !live\.at \|\| !clock\) return null;/);
  assert.match(read("components/OfferTable.tsx"), /Check on Amazon/);
  assert.match(read("components/EbayStrip.tsx"), /\.\.\.\(amazon \? \[\{ key: amazon\.key/);
  assert.doesNotMatch(read("components/EbayStrip.tsx"), /amazon && !amazon\.live &&/);
  assert.match(read("components/EbayStrip.tsx"), /const pinSlots: Slot\[\] = \[\s+\{ key: EBAY_ROW_KEY/);
  assert.doesNotMatch(read("app/[region]/p/[slug]/page.tsx"), /AmazonProductRow|AmazonBelowTable/);
});
