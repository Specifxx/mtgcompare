import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  addLine,
  cartTarget,
  checkoutUrl,
  groupByStore,
  makeLine,
  parseCart,
  productJsUrl,
  readVariant,
  setQty,
} from "../src/lib/cart-list";

// The cart list (owner, 2026-11-06). DECISIONS.md, "A cart list on every site".

const row = {
  href: "https://roningames.com.au/cart/54402271871269:1?utm_source=riftcompare.com&utm_content=checkout",
  productUrl: "https://roningames.com.au/products/gundam-assemble-starter-set-st01?variant=54402271871269",
  storeName: "Ronin Games",
  title: "Origins Booster Box",
  priceCents: 7500,
  currency: "aud",
};

test("a row whose buy link is a cart permalink is a cartable line", () => {
  const l = makeLine(row)!;
  assert.equal(l.store, "roningames.com.au");
  assert.equal(l.variantId, "54402271871269");
  assert.equal(l.base, "https://roningames.com.au");
  assert.equal(l.currency, "AUD");
  assert.equal(l.id, "roningames.com.au:v:54402271871269");
});

test("a locale subfolder stays on the cart base", () => {
  assert.deepEqual(cartTarget("https://store.example/en-au/cart/1234567:1"), { base: "https://store.example/en-au", variantId: "1234567" });
});

test("an Awin or partner link stays a manual line with that link, so the commission tracks", () => {
  const awin = "https://www.awin1.com/cread.php?awinmid=1&awinaffid=3144410&ued=https%3A%2F%2Fshop.example%2Fproducts%2Fx";
  const l = makeLine({ ...row, href: awin, productUrl: "https://shop.example/products/x?variant=1234567" })!;
  assert.equal(l.variantId, null);
  assert.equal(l.base, null);
  assert.equal(l.store, "shop.example");
  assert.equal(l.href, awin);
});

test("TCGplayer and Cardmarket never become a line", () => {
  for (const href of ["https://tcgplayer.pxf.io/c/1/2?u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F1", "https://www.cardmarket.com/en/Magic/Products/1"]) {
    assert.equal(makeLine({ ...row, href, productUrl: null }), null, href);
  }
  assert.equal(makeLine({ ...row, href: "https://tcgplayer.pxf.io/c/1", productUrl: "https://www.tcgplayer.com/product/1" }), null);
});

// eBay and Amazon rows are full price rows (owner, 2026-11-06): manual lines on their tagged links.
test("an eBay or Amazon row is a manual line on its tagged link, one group per domain", () => {
  const ebay = makeLine({ ...row, storeName: "eBay", href: "https://www.ebay.com.au/itm/123?campid=5339155912&customid=x", productUrl: "https://www.ebay.com.au/itm/123" })!;
  assert.equal(ebay.store, "ebay.com.au");
  assert.equal(ebay.variantId, null);
  assert.equal(ebay.base, null);
  assert.match(ebay.href, /campid=5339155912/);
  const rover = makeLine({ ...row, href: "https://rover.ebay.com/rover/1/705-53470-19255-0/1?mpre=x", productUrl: null })!;
  assert.equal(rover.store, "ebay.com");
  const amazon = makeLine({ ...row, storeName: "Amazon", href: "https://www.amazon.com.au/dp/B0TEST?tag=x-22", productUrl: null })!;
  assert.equal(amazon.store, "amazon.com.au");
  assert.equal(amazon.variantId, null);
  // even a link shaped like a cart permalink is never a Shopify checkout on eBay
  assert.equal(makeLine({ ...row, href: "https://www.ebay.com/cart/12345678:1", productUrl: null })!.variantId, null);
});

test("an Amazon line's price is dropped after 24 hours (Amazon's licence); eBay's is kept", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const amazon = makeLine({ ...row, href: "https://www.amazon.com/dp/B0TEST?tag=x-20", productUrl: null }, new Date("2026-11-07T00:00:00Z"))!;
  const old = { ...amazon, id: "amazon.com:u:old", addedAt: "2026-11-05T00:00:00Z" };
  const ebay = { ...makeLine({ ...row, href: "https://www.ebay.com/itm/1", productUrl: null })!, addedAt: "2026-11-01T00:00:00Z" };
  const [fresh, stale, e] = parseCart(JSON.stringify([amazon, old, ebay]), now);
  assert.equal(fresh.priceCents, 7500);
  assert.equal(stale.priceCents, 0);
  assert.equal(e.priceCents, 7500);
});

test("one checkout per store, with every variant and quantity, tagged with where it came from", () => {
  let lines = addLine([], makeLine(row)!);
  lines = addLine(lines, makeLine(row)!);
  lines = addLine(lines, makeLine({ ...row, href: "https://roningames.com.au/cart/99999999:1", productUrl: "https://roningames.com.au/products/y" })!);
  lines = addLine(lines, makeLine({ ...row, href: "https://other.example/cart/5555555:1", storeName: "Other" })!);
  const groups = groupByStore(lines);
  assert.equal(groups.length, 2);
  const url = new URL(checkoutUrl(groups[0].lines, "riftcompare.com", "riftcompare-abc")!);
  assert.equal(url.origin + url.pathname, "https://roningames.com.au/cart/54402271871269:2,99999999:1");
  assert.equal(url.searchParams.get("utm_source"), "riftcompare.com");
  assert.equal(url.searchParams.get("attributes[compare_ref]"), "riftcompare-abc");
  assert.equal(setQty(lines, lines[0].id, 0).length, 2);
});

test("the live check reads Shopify's product .js", () => {
  assert.equal(productJsUrl(row.productUrl), "https://roningames.com.au/products/gundam-assemble-starter-set-st01.js");
  assert.equal(productJsUrl("https://shop.example/collections/x"), null);
  const body = { variants: [{ id: 54402271871269, price: 6999, available: true }, { id: 2, price: "12.50", available: false }] };
  assert.deepEqual(readVariant(body, "54402271871269"), { status: "ok", priceCents: 6999 });
  assert.deepEqual(readVariant(body, "2"), { status: "soldout", priceCents: 1250 });
  assert.equal(readVariant(body, "3").status, "missing");
  assert.equal(readVariant(null, "3").status, "unknown");
});

test("a hand-edited list is cleaned, never trusted", () => {
  const raw = JSON.stringify([{ ...makeLine(row)!, qty: 999 }, { id: "x", href: "javascript:alert(1)", store: "x", title: "x", priceCents: 1, currency: "USD" }, 5]);
  const lines = parseCart(raw);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 20);
  assert.deepEqual(parseCart("not json"), []);
});

test("the cart page is a static, noindexed shell and the header shows the cart", () => {
  const page = readFileSync("src/app/(site)/cart/page.tsx", "utf8");
  assert.match(page, /index: false/);
  assert.match(page, /force-static/);
  assert.ok(existsSync("src/components/cart/CartHeaderLink.tsx"));
});
