// The store registry (src/lib/stores.ts): one entry per store, each readable by
// its platform's reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKETS } from "../src/lib/country";
import { STORES, platformOf, type StorePlatform } from "../src/lib/stores";

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
  const known: StorePlatform[] = ["shopify", "shadowpos", "ecwid", "woocommerce", "bigcommerce", "nopcommerce"];
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
