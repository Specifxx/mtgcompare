import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCheckoutLink, listingKeyUrl, shopifyCartUrl, withShopifyVariant } from "../src/lib/checkout-link";
import { offerLink, TCGPLAYER_KEY } from "../src/lib/affiliate";
import { offerRef, priceOf } from "../src/lib/importer";

// Straight to checkout, as RiftCompare (#340) and OP Compare (#99). DECISIONS.md, 2026-11-06.
const PRODUCT = "https://www.cherrycollectables.com.au/products/foundations-play-booster-box";
const ID = 44123456789012;

test("the import's variant pick is still the product page, and only for a real variant id", () => {
  assert.equal(withShopifyVariant(PRODUCT, ID), `${PRODUCT}?variant=${ID}`);
  assert.equal(withShopifyVariant(PRODUCT, undefined), PRODUCT);
  assert.equal(withShopifyVariant(PRODUCT, 12), PRODUCT);
  assert.equal(listingKeyUrl(`${PRODUCT}?variant=${ID}`), PRODUCT);
  assert.equal(offerRef("cherry", `${PRODUCT}?variant=${ID}`), offerRef("cherry", PRODUCT), "the variant is not a listing's identity");
});

test("the cart permalink, and the offer link that uses it", () => {
  assert.equal(shopifyCartUrl(`${PRODUCT}?variant=${ID}`), `https://www.cherrycollectables.com.au/cart/${ID}:1`);
  const link = offerLink("cherry", `${PRODUCT}?variant=${ID}`, "au", "product-best");
  const u = new URL(link.href);
  assert.equal(u.pathname, `/cart/${ID}:1`);
  assert.equal(u.searchParams.get("utm_source"), "mtgcompare");
  assert.equal(u.searchParams.get("utm_content"), "checkout");
  assert.ok(isCheckoutLink(link.href));
  assert.equal(offerLink("cherry", PRODUCT, "au", "product-best").href, PRODUCT, "no variant → product page, untouched");
  assert.ok(!isCheckoutLink(offerLink(TCGPLAYER_KEY, "https://www.tcgplayer.com/product/1", "us", "product-best").href));
});

test("Awin wins over checkout", () => {
  const src = readFileSync(new URL("../src/lib/affiliate.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function offerLink("));
  assert.ok(body.indexOf("if (awin) return") > 0 && body.indexOf("shopifyCartUrl(") > body.indexOf("if (awin) return"));
});

test("priceOf names the in-stock variant it priced", () => {
  const p = { id: "x", title: "x", url: PRODUCT, imageUrl: null, currency: null, variants: [
    { id: 1000001, priceCents: 30000, available: true },
    { id: 1000002, priceCents: 25000, available: true },
    { id: 1000003, priceCents: 20000, available: false },
  ] };
  assert.equal(priceOf(p, 0)?.variantId, 1000002);
  assert.equal(priceOf({ ...p, variants: [{ id: 1000003, priceCents: 20000, available: false }] }, 0)?.variantId, undefined, "sold out → no cart");
});
