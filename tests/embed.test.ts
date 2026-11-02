import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeHtml, badgeOffer, embedSnippet, regionParam } from "../src/lib/embed";

test("regionParam falls back to the US", () => {
  assert.equal(regionParam("UK"), "uk");
  assert.equal(regionParam("xx"), "us");
  assert.equal(regionParam(null), "us");
});

test("badgeOffer: cheapest in-stock independent store, never a marketplace", () => {
  const o = (priceCents: number, inStock = true, marketplace = false) => ({ priceCents, inStock, marketplace });
  assert.equal(badgeOffer([o(100, true, true), o(300), o(200, false), o(250)])?.priceCents, 250);
  assert.equal(badgeOffer([o(100, true, true)]), null);
});

test("the badge is noindex and escapes text; the snippet carries a plain text link to the region page", () => {
  const h = badgeHtml({ site: "S", name: "<b>x</b>", meta: "m", price: "$1.00", sub: "s", href: "https://e.com/us/p/a", image: null });
  assert.match(h, /name="robots" content="noindex"/);
  assert.ok(!h.includes("<b>x</b>"));
  assert.match(embedSnippet("https://e.com", "S", "uk", "a", "A"), /src="https:\/\/e\.com\/widgets\/p\/a\?region=uk"[\s\S]*<a href="https:\/\/e\.com\/uk\/p\/a">A price on S<\/a>/);
});
