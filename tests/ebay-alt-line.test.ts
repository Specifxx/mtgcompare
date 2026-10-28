// The best-price card's "Also on eBay" line (components/BestPriceCard.tsx EbayAltLine): the listing's own price or a search, labelled Ad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EbayAltLine } from "../src/components/BestPriceCard";
import { PLACEMENTS } from "../src/lib/affiliate";

(globalThis as unknown as { React: typeof React }).React = React;

test("EbayAltLine: a listing shows its own price and nothing derived from it, labelled Ad", () => {
  const html = renderToStaticMarkup(
    React.createElement(EbayAltLine, { alt: { kind: "listing", href: "https://www.ebay.com.au/itm/1", cents: 31999, title: "Box" }, market: "AU", region: "au" }),
  );
  assert.match(html, /data-ebay-alt="listing"/);
  assert.match(html, /Also on eBay: /);
  assert.match(html, /A\$319\.99/);
  assert.match(html, /Ad</);
  assert.doesNotMatch(html, /%/, "no percentage computed from eBay's price (eBay API terms 8.1(d))");
  assert.match(html, /rel="sponsored/);
});

test("EbayAltLine: with no listing, a labelled search", () => {
  const html = renderToStaticMarkup(
    React.createElement(EbayAltLine, { alt: { kind: "search", href: "https://www.ebay.com.au/sch/i.html?_nkw=x" }, market: "AU", region: "au" }),
  );
  assert.match(html, /data-ebay-alt="search"/);
  assert.match(html, /Compare listings on eBay/);
  assert.doesNotMatch(html, /A\$/, "a search never shows a price");
});

test("EbayAltLine: the listing's price only when a store is the headline (else a search), and its placements are registered", () => {
  const src = readFileSync(new URL("../src/components/BestPriceCard.tsx", import.meta.url), "utf8");
  assert.match(src, /!cheaper && bestable && item != null && cents != null && search \? \{ kind: "listing"/);
  for (const p of ["listings-best-price-alt", "best-price-ebay-search"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), p);
});
