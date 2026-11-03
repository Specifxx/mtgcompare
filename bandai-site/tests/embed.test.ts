import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeHtml, badgeOffer, embedSnippet, marketParam } from "../src/lib/embed";
import type { Offer } from "../src/lib/site-types";

const o = (source: string, market: Offer["market"], cents: number, extra: Partial<Offer> = {}): Offer => ({ source, market, currency: "USD", cents, inStock: true, url: "", title: "", ...extra });

test("badgeOffer: cheapest in-stock store in the market, never TCGplayer, eBay, Amazon or a pre-order", () => {
  const best = [o("tcgplayer", "US", 100), o("ebay", "US", 200), o("amazon", "US", 250), o("shop-a", "US", 900, { preorder: true }), o("shop-b", "US", 700, { inStock: false }), o("shop-c", "US", 800), o("shop-d", "UK", 300)];
  assert.equal(badgeOffer(best, "US")?.source, "shop-c");
  assert.equal(badgeOffer(best, "UK")?.source, "shop-d");
  assert.equal(badgeOffer(best, "AU"), null);
});

test("marketParam falls back to the US", () => {
  assert.equal(marketParam("uk"), "UK");
  assert.equal(marketParam("xx"), "US");
  assert.equal(marketParam(null), "US");
});

test("the badge is noindex, escapes text and links back; the snippet carries a plain text link", () => {
  const h = badgeHtml({ site: "S", name: "<b>x</b>", meta: "m", price: "$1.00", sub: "s", href: "https://e.com/card/a", image: null });
  assert.match(h, /name="robots" content="noindex"/);
  assert.ok(!h.includes("<b>x</b>"));
  assert.match(h, /href="https:\/\/e\.com\/card\/a"/);
  assert.match(embedSnippet("https://e.com", "S", "a", "A", "t"), /<a href="https:\/\/e\.com\/card\/a">A price on S<\/a>/);
});
