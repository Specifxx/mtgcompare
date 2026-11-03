// eBay rows come only from sellers in the visitor's own country, with postage eBay states (visitor feedback on
// WargameCompare, 2026-10-31: overseas sellers' postage made "a lot of wasted clicks").
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@/lib/site-types";
import { endUserContext, pickBest, searchFilter, type ItemSummary } from "@/lib/import/ebay";
import { decodeOffer } from "@/lib/offer-codec";

const product: Product = { id: 1, slug: "x", name: "Card 1", kind: "card", setId: 1, number: "1/204", rarity: "Rare", attrs: {}, sealedType: null, image: null, tcgUrl: "", printings: [] };

test("the search asks for local sellers and gives eBay the buyer's location", () => {
  assert.equal(searchFilter("AU", 40), "buyingOptions:{FIXED_PRICE},price:[20..120],priceCurrency:AUD,itemLocationCountry:AU,deliveryCountry:AU");
  assert.equal(searchFilter("UK", null), "buyingOptions:{FIXED_PRICE},itemLocationCountry:GB,deliveryCountry:GB");
  assert.match(endUserContext("US", "site-1"), /^affiliateCampaignId=\d+,affiliateReferenceId=site-1,contextualLocation=country%3DUS%2Czip%3D64101$/);
});

test("an overseas seller, an unstated postage or postage in another currency is never a row", () => {
  const it = (over: Partial<ItemSummary>): ItemSummary => ({ title: "Card 1", price: { value: "40.00", currency: "AUD" }, itemWebUrl: "https://www.ebay.com.au/itm/1", ...over });
  assert.equal(pickBest(product, "AU", [it({ itemLocation: { country: "CN" }, shippingOptions: [{ shippingCost: { value: "0.00" } }] })]), null);
  assert.equal(pickBest(product, "AU", [it({ itemLocation: { country: "AU" } })]), null, "no shipping option");
  assert.equal(pickBest(product, "AU", [it({ itemLocation: { country: "AU" }, shippingOptions: [{}] })]), null, "calculated postage");
  assert.equal(pickBest(product, "AU", [it({ itemLocation: { country: "AU" }, shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }] })]), null);
});

test("a stored eBay row without a stated postage is not shown", () => {
  assert.equal(decodeOffer(["ebay", 4000, 1, "https://www.ebay.com/itm/1", "", null, "US"]), null);
  assert.equal(decodeOffer(["ebay", 4000, 1, "https://www.ebay.com/itm/1", "", 500, "US"])?.shippingCents, 500);
  assert.ok(decodeOffer(["tcgplayer", 4000, 1, "https://www.tcgplayer.com/product/1", "", null, "US"]), "TCGplayer's row is not eBay's");
});
