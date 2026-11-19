// TCGplayer's market price line on the price history chart (lib/tcg-market.ts, owner 2026-11-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { convertUsd, tcgIdOfUrl, tcgRows, MAX_AGE_DAYS, type TcgMarketFile } from "../src/lib/tcg-market";
import { updatePriceHistory, dailySeries } from "../src/lib/price-history";
import { PriceHistoryTwoLine } from "../src/components/PriceHistoryTwoLine";
import { findBannedCopy } from "../src/lib/copy-rules";

(globalThis as unknown as { React: typeof React }).React = React;

const file: TcgMarketFile = { day: 100, fx: { USD: 1, AUD: 1.5 }, prices: { "120968": 5000 } };
const products = [
  { id: "a", slug: "lore-box" },
  { id: "b", slug: "no-tcg" },
];
const offers = [
  { productId: "a", store: "tcgplayer", url: "https://www.tcgplayer.com/product/120968/magic-from-the-vault-lore" },
  { productId: "b", store: "somestore", url: "https://example.com/products/120968" },
];

test("a product joins TCGplayer only by the id in its own TCGplayer offer's URL", () => {
  assert.equal(tcgIdOfUrl("https://www.tcgplayer.com/product/120968/x"), "120968");
  assert.equal(tcgIdOfUrl("https://example.com/products/120968"), null);
  assert.deepEqual(tcgRows(products, offers, file, 100), [{ market: "US", slug: "lore-box", cents: 5000, stores: 1 }]);
});

test("a stale market file is not folded in: the line gaps rather than repeat an old price", () => {
  assert.deepEqual(tcgRows(products, offers, file, 100 + MAX_AGE_DAYS + 1), []);
  assert.deepEqual(tcgRows(products, offers, null, 100), []);
});

test("conversion: US cents at the file's rate, null without a rate", () => {
  assert.equal(convertUsd(5000, "USD", undefined), 5000);
  assert.equal(convertUsd(5000, "AUD", file.fx), 7500);
  assert.equal(convertUsd(5000, "NZD", file.fx), null);
});

test("the chart draws the TCGplayer line alone, labelled converted outside the US", () => {
  let h = updatePriceHistory(null, [], 0);
  for (let d = 0; d < 8; d++) h = updatePriceHistory(h, [{ market: "US", slug: "x", cents: 5000 + d * 10, stores: 1 }], d);
  const tcg = dailySeries(h, "US", "x", 400).map((v) => ({ ...v, cents: convertUsd(v.cents, "AUD", file.fx) }));
  const html = renderToStaticMarkup(React.createElement(PriceHistoryTwoLine, { values: [], tcg, market: "AU" }));
  assert.match(html, /TCGplayer market \(converted\)/);
  assert.ok(!/Cheapest Australian listing/.test(html));
  assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null);
});
