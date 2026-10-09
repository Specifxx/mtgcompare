// The store registry (src/lib/stores.ts): one entry per store, each readable by
// its platform's reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKETS } from "../src/lib/country";
import { STORES, enabledFeeds, offerUrl, platformOf, storeByKey, type StorePlatform } from "../src/lib/stores";

const host = (base: string) => new URL(base).hostname.replace(/^www\./, "");

test("every store has a unique key, and each host is one store per market", () => {
  const keys = new Set<string>();
  const hosts = new Map<string, string>();
  for (const s of STORES) {
    assert.ok(!keys.has(s.key), `duplicate key ${s.key}`);
    keys.add(s.key);
    // A Shopify store may be listed in two markets (Danireon in US and CA): Shopify
    // Markets prices it per ?country=. Never twice in one market.
    const h = `${host(s.base)} ${s.country}`;
    assert.ok(!hosts.has(h), `${s.key} and ${hosts.get(h)} are the same store (${h})`);
    if (platformOf(s) !== "shopify") assert.ok(!STORES.some((o) => o !== s && host(o.base) === host(s.base)), `${s.key}: only Shopify prices per market`);
    hosts.set(h, s.key);
  }
});

test("bases are bare https origins in a known market", () => {
  for (const s of STORES) {
    assert.match(s.base, /^https:\/\/[a-z0-9.-]+$/, s.key);
    assert.ok(MARKETS.includes(s.country), `${s.key}: ${s.country}`);
    assert.match(s.key, /^[a-z0-9]+$/, s.key);
    assert.ok(!/ebay\./i.test(s.base), `${s.key}: eBay is never a store`);
  }
});

test("each platform's store carries what its reader needs", () => {
  const known: StorePlatform[] = ["shopify", "shadowpos", "ecwid", "woocommerce", "bigcommerce", "nopcommerce", "feed"];
  for (const s of STORES) {
    const p = platformOf(s);
    assert.ok(known.includes(p), `${s.key}: ${p}`);
    if (p === "shopify") assert.ok(s.collections.length > 0, `${s.key}: no collections`);
    // ShadowPOS states no currency: only US dollar shops are read.
    if (p === "shadowpos") assert.equal(s.country, "US", s.key);
    if (p === "ecwid") assert.ok(s.ecwidStoreId && s.collections.length, `${s.key}: Ecwid needs a store id and a category`);
    if (p === "bigcommerce" || p === "nopcommerce") for (const c of s.collections) assert.match(c, /^\//, `${s.key}: category paths start with /`);
    if (p !== "ecwid") assert.equal(s.ecwidStoreId, undefined, s.key);
  }
});

test("the registry is the 67 seed stores, the 13 ShadowPOS stores, the 324 stores of the 2026-10-09 sweep and the two feeds, every one unverified until the production probe admits it (10.26)", () => {
  assert.equal(STORES.length, 406);
  assert.equal(STORES.filter((s) => platformOf(s) === "feed").length, 2);
  assert.equal(STORES.filter((s) => platformOf(s) === "shadowpos").length, 37);
  assert.equal(STORES.filter((s) => platformOf(s) === "shopify").length, 367);
  for (const s of STORES) assert.equal(s.status, "unverified", s.key);
  for (const s of STORES) if (platformOf(s) === "shadowpos") assert.ok(s.collections.length === 0, `${s.key}: ShadowPOS has one search, no collections`);
});

test("a storefront that charges another currency than its market's says so (the importer refuses it): The Mythic Store and The CG Realm charge CAD in the US", () => {
  assert.deepEqual(STORES.filter((s) => s.currency).map((s) => [s.key, s.country, s.currency]).sort(), [["cgrealm", "US", "CAD"], ["mythicstore", "US", "CAD"]]);
});

test("the public price feeds are present and OFF: FEED_SOURCES is empty until the owner has the terms in writing (10.11)", () => {
  assert.equal(storeByKey("cardkingdom")?.id, 8);
  assert.equal(storeByKey("manapool")?.id, 9);
  assert.deepEqual(enabledFeeds({}), []);
  assert.deepEqual(enabledFeeds({ FEED_SOURCES: "" }), []);
  assert.deepEqual(enabledFeeds({ FEED_SOURCES: "manapool, nonsense" }).map((f) => f.key), ["manapool"]);
});

test("offerUrl: origin + path; a Shopify store read in another market than its own asks for that market's price", () => {
  const gg = storeByKey("goodgames")!;
  assert.equal(offerUrl(gg.id, "AU", "/products/sylvan-anthem-modern-horizons-2"), "https://tcg.goodgames.com.au/products/sylvan-anthem-modern-horizons-2");
  assert.equal(offerUrl(gg.id, "UK", "/products/x"), "https://tcg.goodgames.com.au/products/x?country=GB");
  assert.equal(offerUrl(gg.id, "UK", "/products/x?variant=1"), "https://tcg.goodgames.com.au/products/x?variant=1&country=GB");
  const sp = storeByKey("lotusgamesct")!;
  assert.equal(offerUrl(sp.id, "US", "/products/product_5tczfw1k"), "https://lotusgamesltd.com/products/product_5tczfw1k");
  assert.equal(offerUrl(sp.id, "AU", "/products/product_5tczfw1k"), "https://lotusgamesltd.com/products/product_5tczfw1k", "only Shopify prices per market");
});
