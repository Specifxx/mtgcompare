import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BAR_TEST_START, barArm, paidChoice } from "../src/lib/bar-test";
import { isImpression } from "../src/lib/track";

// The phone buy bar test (2026-11-27, DECISIONS.md "The phone buy bar test").
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("starts on 3 Dec and draws today's bar before then (and off a browser)", () => {
  assert.equal(BAR_TEST_START, Date.parse("2026-12-03T00:00:00Z"));
  assert.equal(barArm(BAR_TEST_START - 1), null);
  assert.equal(barArm(BAR_TEST_START + 1), null, "no window on the server");
});

test("the paid arm carries the cheaper paid link, eBay on a tie, nothing when neither is priced", () => {
  assert.equal(paidChoice(null, null), null);
  assert.equal(paidChoice(5000, null), "ebay");
  assert.equal(paidChoice(null, 5000), "tcg");
  assert.equal(paidChoice(5000, 4999), "tcg");
  assert.equal(paidChoice(4999, 5000), "ebay");
  assert.equal(paidChoice(5000, 5000), "ebay");
});

test("seen is a sampled impression; clicks are not", () => {
  assert.equal(isImpression("bar_test", { k: "paid:seen" }), true);
  assert.equal(isImpression("bar_test", { k: "paid:paid" }), false);
  assert.equal(isImpression("bar_test", { k: "store:store" }), false);
});

test("only an unpaid store is swapped, the paid row says Ad, and clicks are counted from product pages outside the quick view", () => {
  const bar = read("src/components/StickyBuyBar.tsx");
  assert.match(bar, /arm === "paid" && !!props\.store && !props\.store\.marketplace && !\/\\bsponsored\\b\/\.test\(props\.store\.rel\)/);
  assert.match(bar, /function tcgContent[\s\S]*?ad: true[\s\S]*?ad-pill">Ad</);
  const lib = read("src/lib/bar-test.ts");
  assert.match(lib, /closest\('\[role="dialog"\]'\)\) return/);
  assert.match(lib, /\\\/p\\\//);
  assert.match(read("src/components/OutboundLink.tsx"), /barTestClick\(el, rel\)/);
  assert.match(read("src/app/[region]/p/[slug]/page.tsx"), /tcg=\{barTcg\}/);
});
