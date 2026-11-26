import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The eBay stand-out A/B (2026-11-19, DECISIONS.md "eBay stand-out row, 50/50").
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("arm pop restyles eBay buttons and their rows, shape and colour only, never inside the quick view", () => {
  const css = read("src/app/globals.css");
  const from = css.indexOf("The eBay stand-out A/B");
  const to = css.indexOf("empire-ds:start", from);
  const rules = css.slice(from, to === -1 ? undefined : to);
  assert.match(rules, /html\[data-ebaypop="pop"\] a\.btn-ad\[href\*="ebay\."\]:not\(\[role="dialog"\] a\) \{[^}]*font-weight: 800/);
  assert.match(rules, /html\[data-ebaypop="pop"\] li:not\(\[role="dialog"\] li\):has\(/);
  assert.doesNotMatch(rules, /content:/, "the arm adds no words");
});

test("the arm is assigned in the browser, counted once a visit, and quick-view clicks are skipped", () => {
  const lib = read("src/lib/ebay-pop.ts");
  assert.match(lib, /EBAY_POP_KEY = "ebay-pop"/);
  assert.match(lib, /Math\.random\(\) < 0\.5/);
  assert.match(lib, /closest\('\[role="dialog"\]'\)\) return/);
  assert.match(read("src/app/layout.tsx"), /<EbayPopArm \/>/);
  assert.match(read("src/components/OutboundLink.tsx"), /ebayPopClick\(el\)/);
});
