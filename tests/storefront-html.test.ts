import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pageCurrency, parseBigCommercePage, parseMoneyCents, parseShopwarePage } from "../src/lib/storefront-html";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "storefront-html", name), "utf8");

test("money: a Stencil price with or without a currency code, never another currency", () => {
  assert.equal(parseMoneyCents("699.95$ AUD", "AUD"), 69995);
  assert.equal(parseMoneyCents("3,096.00$ AUD", "AUD"), 309600);
  assert.equal(parseMoneyCents("$24.99", "USD"), 2499);
  assert.equal(parseMoneyCents("£5.49", "GBP"), 549);
  assert.equal(parseMoneyCents("699.95$ AUD", "USD"), null);
  assert.equal(parseMoneyCents("", "USD"), null);
  assert.equal(parseMoneyCents("$0.00", "USD"), null);
});

test("BigCommerce (Grand J Games, AU): title, price in AUD, Add to Cart vs Out of stock", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-grandj.html"), "AUD");
  assert.equal(got.length, 3);
  assert.equal(got[0].title, "Magic The Gathering - Reality Fracture Collector Booster Box");
  assert.deepEqual(got[0].variants, [{ priceCents: 69995, available: true }]);
  assert.equal(got[0].currency, "AUD");
  assert.equal(got[0].url, "https://grandjgames.com/195166337104/");
  assert.equal(got[0].id, "/195166337104/");
  assert.match(got[0].imageUrl ?? "", /^https:\/\/cdn11\.bigcommerce\.com\//);
  assert.equal(got[1].variants[0].priceCents, 27495);
  assert.equal(got[1].variants[0].available, false, "button--outstock");
  assert.equal(got[2].variants[0].available, true);
  // Read for the wrong market, every price is refused rather than converted.
  assert.equal(parseBigCommercePage(fixture("bigcommerce-grandj.html"), "USD").length, 0);
});

test("BigCommerce (Game Goblins, US): a theme with attributes before class, $ prices, no code", () => {
  const got = parseBigCommercePage(fixture("bigcommerce-gamegoblins.html"), "USD");
  assert.equal(got.length, 2);
  assert.equal(got[0].title, "MtG: Assassin's Creed: Starter Kit");
  assert.equal(got[0].variants[0].priceCents, 2499);
  assert.equal(got[0].url, "https://gamegoblins.com/mtg-assassins-creed-starter-kit/");
  assert.equal(got[0].currency, null, "the page states no currency: the probe decides");
});

test("Shopware (Miniature Market, US): product boxes, buy button vs stock notify", () => {
  const got = parseShopwarePage(fixture("shopware-miniaturemarket.html"), "USD");
  assert.equal(got.length, 3);
  assert.equal(got[0].title, "MTG: The Hobbit - Sleeved Play Booster Pack");
  assert.equal(got[0].url, "https://www.miniaturemarket.com/MTG-The-Hobbit-Sleeved-Play-Booster-Pack/WOCD5659-PACK");
  assert.deepEqual(got[0].variants, [{ priceCents: 499, available: true }]);
  assert.equal(got[2].title, "MTG: Foundations - Starter Commander Deck - Set of 5");
  assert.equal(got[2].variants[0].available, false, "stock-notify form, no buy button");
});

test("a grid drawn in the browser yields nothing, so the read fails instead of emptying the store", () => {
  assert.equal(parseBigCommercePage("<html><body><div class='productsGrid'></div></body></html>", "USD").length, 0);
  assert.equal(parseShopwarePage("<html><body></body></html>", "USD").length, 0);
});

test("pageCurrency reads JSON-LD or a currency-code attribute", () => {
  assert.equal(pageCurrency('<script type="application/ld+json">{"offers":{"priceCurrency":"GBP"}}</script>'), "GBP");
  assert.equal(pageCurrency('<div data-currency-code="USD">'), "USD");
  assert.equal(pageCurrency("<p>no money here</p>"), null);
});
