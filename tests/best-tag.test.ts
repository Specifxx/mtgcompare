// "Best price" on a plain store (owner, 2026-11-18): a small neutral chip and a hint, never the marked row; a paid best price keeps it all.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { StoreRow, type StoreRowData } from "../src/components/OfferRows";
import { bestHint, isPlainBest } from "../src/lib/best-tag";

(globalThis as unknown as { React: typeof React }).React = React;

function render(el: React.ReactElement): string {
  const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
  } finally {
    console.error = err;
  }
}

const row = (over: Partial<StoreRowData> = {}): StoreRowData => ({
  key: "s", cents: 10000, open: true, state: "in_stock" as StoreRowData["state"], best: true, name: "Plain Store", host: "plain.example", title: "Box", marketplace: false,
  href: "https://plain.example/box", rel: "noopener", sponsored: false, retailer: "plain", price: "$100.00", perPack: null, lastSeen: "2026-11-18T00:00:00Z", ago: "1 hour ago",
  ship: null, ...over,
});
const HINT = "Prices and stock change: also check eBay and TCGplayer";

test("a plain cheapest store: no marked row, the plain tag, the price still shown, a hint naming eBay and TCGplayer", () => {
  const html = render(React.createElement(StoreRow, { d: row(), preorder: false, top: true, hint: HINT }));
  assert.doesNotMatch(html, /or-hl/);
  assert.doesNotMatch(html, /or-badge/);
  assert.match(html, /<span class="or-tag">Best price<\/span>/);
  assert.match(html, /\$100\.00/);
  assert.match(html, new RegExp(`title="${HINT}"`));
  assert.match(html, new RegExp(`aria-label="${HINT}"`));
  assert.doesNotMatch(html, /cheaper/i);
});

test("a plain cheapest store with no eBay or TCGplayer row in the list: the tag and no hint", () => {
  const html = render(React.createElement(StoreRow, { d: row(), preorder: false, top: true, hint: null }));
  assert.match(html, /or-tag/);
  assert.doesNotMatch(html, /also check|aria-expanded/);
});

test("an affiliate, TCGplayer or Amazon cheapest row keeps the marked row and the green badge, and no hint", () => {
  for (const over of [{ sponsored: true }, { kind: "tcgplayer" as const }, { kind: "amazon" as const }]) {
    const html = render(React.createElement(StoreRow, { d: row(over), preorder: false, top: true, hint: HINT }));
    assert.match(html, /or-row or-hl/, JSON.stringify(over));
    assert.match(html, /<span class="or-badge">Best price<\/span>/);
    assert.doesNotMatch(html, /or-tag|also check/);
  }
});

test("the store-only table (no hint passed) marks a plain best price with the chip too", () => {
  const html = render(React.createElement(StoreRow, { d: row(), preorder: false }));
  assert.match(html, /or-tag/);
  assert.doesNotMatch(html, /or-hl|also check/);
});

test("a row that is not the best price is unchanged", () => {
  const html = render(React.createElement(StoreRow, { d: row({ best: false }), preorder: false, top: false, hint: HINT }));
  assert.doesNotMatch(html, /or-hl|or-tag|or-badge|also check/);
});

test("bestHint names only the rows the list has; isPlainBest", () => {
  assert.equal(bestHint({ ebay: true, tcgplayer: true }), HINT);
  assert.equal(bestHint({ ebay: true, tcgplayer: false }), "Prices and stock change: also check eBay");
  assert.equal(bestHint({ ebay: false, tcgplayer: true }), "Prices and stock change: also check TCGplayer");
  assert.equal(bestHint({ ebay: false, tcgplayer: false }), null);
  assert.equal(isPlainBest({ sponsored: false }), true);
  assert.equal(isPlainBest({ sponsored: true }), false);
  assert.equal(isPlainBest({ sponsored: false, kind: "amazon" }), false);
});
