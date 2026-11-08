// "Is this a good price?" (2026-11-08): how a pasted store link is read and matched to our own listing, and what the verdict says.
// A wrong product is worse than none, so an ambiguous page answers nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOffer, linkPath, marketplaceName, parseLink, priceVerdict, slugWords, type CheckOffer } from "../src/lib/link-check";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

test("a pasted link is read to the store's host and the product's path, wherever it was copied from", () => {
  assert.deepEqual(parseLink("https://www.axionnow.com/products/from-the-vault-lore?variant=123&utm_source=x"), {
    host: "axionnow.com",
    path: "/products/from-the-vault-lore",
    variant: "123",
    words: "from the vault lore",
  });
  // A collection page's product link, a market prefix and a trailing slash name the same product.
  assert.equal(parseLink("https://axionnow.com/collections/mtg/products/From-The-Vault-Lore/")!.path, "/products/from-the-vault-lore");
  assert.equal(parseLink("https://axionnow.com/en-au/products/from-the-vault-lore#reviews")!.path, "/products/from-the-vault-lore");
  // Pasted inside a message, or without the scheme.
  assert.equal(parseLink("is this good? https://m.store.co.uk/product/foundations-play-booster-box/ thanks")!.host, "store.co.uk");
  assert.equal(parseLink("store.com.au/products/abc")!.host, "store.com.au");
  assert.equal(parseLink("foundations play booster box"), null);
  assert.equal(parseLink(""), null);
  assert.equal(parseLink("javascript:alert(1)"), null);
});

test("our stored listing and the pasted link key the same way", () => {
  assert.equal(linkPath("/products/Abc%20Def"), "/products/abc def");
  assert.equal(linkPath("/product/x/"), "/product/x");
  assert.equal(linkPath("/MTG-Dominaria-United-Bundle"), "/mtg-dominaria-united-bundle");
  assert.equal(slugWords("/en/wocc99230-2.html"), "wocc99230 2");
  assert.equal(slugWords("/products/foundations-play-booster-box-12345678"), "foundations play booster box");
  assert.equal(slugWords("/itm/foundations-play-booster-box/1234567890"), "foundations play booster box");
  assert.equal(slugWords("/foundations-play-booster-box/dp/b0d4kp1xyz"), "foundations play booster box");
});

test("eBay, Amazon and marketplaces are named, never looked up as a store", () => {
  assert.equal(marketplaceName("ebay.com.au"), "eBay");
  assert.equal(marketplaceName("amazon.co.uk"), "Amazon");
  assert.equal(marketplaceName("amzn.to"), "Amazon");
  assert.equal(marketplaceName("tcgplayer.com"), "TCGplayer");
  assert.equal(marketplaceName("axionnow.com"), null);
});

test("the listing a link names: same path; a variant picks between two products; two products and no variant is no answer", () => {
  const offers: CheckOffer[] = [
    ["/products/box", "box-slug", 10000, 1, "11"],
    ["/products/box", "case-slug", 60000, 1, "12"],
    ["/products/bundle", "bundle-slug", 5000, 0, ""],
  ];
  assert.equal(findOffer(offers, { path: "/products/bundle", variant: null })![1], "bundle-slug");
  assert.equal(findOffer(offers, { path: "/products/box", variant: "12" })![1], "case-slug");
  assert.equal(findOffer(offers, { path: "/products/box", variant: null }), null);
  assert.equal(findOffer(offers, { path: "/products/nope", variant: null }), null);
});

test("the verdict: cheapest, fair, typical, high, and nothing to compare", () => {
  const base = { cheapestCents: 10000, medianCents: 12000, inStockStores: 5, money };
  assert.equal(priceVerdict({ ...base, priceCents: 10050 }).verdict, "best");
  assert.equal(priceVerdict({ ...base, priceCents: 9000 }).verdict, "best");
  const fair = priceVerdict({ ...base, priceCents: 11000 });
  assert.equal(fair.verdict, "good");
  assert.equal(fair.saveCents, 1000);
  assert.match(fair.detail, /\$100\.00, \$10\.00 less/);
  assert.equal(priceVerdict({ ...base, priceCents: 12200 }).verdict, "typical");
  assert.equal(priceVerdict({ ...base, priceCents: 15000 }).verdict, "high");
  assert.equal(priceVerdict({ ...base, medianCents: null, inStockStores: 1, priceCents: 11000 }).verdict, "high");
  assert.equal(priceVerdict({ ...base, cheapestCents: null, inStockStores: 0, priceCents: 11000 }).verdict, "unknown");
});

test("the route answers only for stores we read, from our own listings, cached by the CDN for a day", () => {
  const src = readFileSync(new URL("../src/app/api/check/[host]/route.ts", import.meta.url), "utf8");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /s-maxage=86400/);
  assert.doesNotMatch(src, /fetch\(/, "never fetches the pasted page");
  assert.match(src, /status: 404/);
});
