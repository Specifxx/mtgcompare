// The best-price card's MSRP badge (lib/format.ts msrpBadge) and the card around it (components/BestPriceCard.tsx): "At MSRP" within
// 1%, "N% over/under MSRP" otherwise, nothing without an MSRP; the price, store and "checked … ago" in the first screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { msrpBadge } from "../src/lib/format";
import { usMsrpForCard } from "../src/lib/rrp";
import { BestPriceCard, type BestPriceCardProps } from "../src/components/BestPriceCard";

(globalThis as unknown as { React: typeof React }).React = React;

test("msrpBadge: at (within 1%), over and under, rounded; null without an MSRP or a price", () => {
  assert.deepEqual(msrpBadge(4999, 4999), { text: "At MSRP", tone: "at" });
  assert.deepEqual(msrpBadge(5040, 4999), { text: "At MSRP", tone: "at" }, "0.8% over is at MSRP");
  assert.deepEqual(msrpBadge(5999, 4999), { text: "20% over MSRP", tone: "over" });
  assert.deepEqual(msrpBadge(3999, 4999), { text: "20% under MSRP", tone: "under" });
  assert.deepEqual(msrpBadge(16164 * 2, 16164), { text: "100% over MSRP", tone: "over" });
  assert.equal(msrpBadge(4999, null), null);
  assert.equal(msrpBadge(4999, 0), null);
  assert.equal(msrpBadge(null, 4999), null);
  assert.equal(msrpBadge(0, 4999), null);
});

test("MSRP exists only where Wizards published one (rrp.ts): Star Trek's lines, in the US", () => {
  assert.equal(usMsrpForCard("US", "Bundle", "trk"), 6999);
  assert.equal(usMsrpForCard("US", "Play Booster Pack", "trk"), 699);
  assert.equal(usMsrpForCard("AU", "Bundle", "trk"), null, "no Australian list price: no badge");
  assert.equal(usMsrpForCard("US", "Play Booster Box", "trk"), null, "a box is never derived from its packs");
  assert.equal(usMsrpForCard("US", "Bundle", "fdn"), null, "no published MSRP we trust: no badge");
});

const props = (over: Partial<BestPriceCardProps> = {}): BestPriceCardProps => ({
  region: "us",
  market: "US",
  adjective: "US",
  preorder: false,
  store: { cents: 5499, where: "at Card Shop", marketplace: false, href: "https://cardshop.example/p", rel: "nofollow noopener", sponsored: false, retailer: "Card Shop (US)", button: "Go to Card Shop", checked: "2026-10-22T06:00:00.000Z" },
  packs: 9,
  median: 6499,
  medianStores: 6,
  msrp: 4999,
  openStores: 6,
  storeCount: 9,
  tcgOpen: false,
  openCount: 6,
  highestOpenCents: 7999,
  ebay: null,
  ...over,
});

test("the card: price, store, 'checked … ago' and the MSRP badge in the first screen; no badge without an MSRP", () => {
  const html = renderToStaticMarkup(React.createElement(BestPriceCard, props()));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /\$54\.99/);
  assert.match(text, /at Card Shop/);
  assert.match(text, /checked .*ago|checked just now/);
  assert.match(html, /data-msrp="over"[^>]*>10% over MSRP</);
  const au = renderToStaticMarkup(React.createElement(BestPriceCard, props({ region: "au", market: "AU", msrp: null })));
  assert.doesNotMatch(au, /MSRP/, "no MSRP: no badge, nothing guessed");
  const under = renderToStaticMarkup(React.createElement(BestPriceCard, props({ store: { ...props().store, cents: 4499 } })));
  assert.match(under, /data-msrp="under"[^>]*>10% under MSRP</);
});
