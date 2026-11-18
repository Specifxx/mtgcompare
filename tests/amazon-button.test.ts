import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Amazon row's amber button and the quick view's "See full page" button (DECISIONS.md, 2026-11-18).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the Amazon row's button is amber with dark ink, priced or not", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.btn-amazon \{[^}]*bg-\[#F5A524\][^}]*text-\[#111\][^}]*hover:bg-\[#DC8A0B\]/s);
  const rows = read("src/components/OfferRows.tsx");
  // one button for the priced "View deal" and the unpriced "Check Amazon" row
  assert.match(rows, /d\.kind === "amazon" \? "btn-amazon"/);
  assert.match(rows, /d\.live \? "View deal" : "Check Amazon"/);
});

test("the quick view has a tall, labelled See full page button to the product page", () => {
  const qv = read("src/components/QuickView.tsx");
  assert.match(qv, /<Link href=\{head\.href\}[^>]*data-see-full-page[^>]*min-h-11/);
  assert.match(qv, /See full page: price history and details/);
});
