import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCKED_STORES, isBlockedStore } from "../src/lib/blocked-stores";
import { STORES, STORE_BY_KEY } from "../src/lib/stores";
import { publicRows, resetPublicData } from "../src/lib/public-data/store";

// TCG Synergy (tcgsynergy.myshopify.com) was removed on 2026-10-31: the owner says it is a scam site. It must never be
// listed again, by hand, by a probe (scripts/probe-stores.ts) or by a registry merge (scripts/registry-from-probe.ts).

test("a banned store is matched by key, name, base URL or a custom domain", () => {
  assert.ok(BLOCKED_STORES.includes("tcgsynergy"));
  assert.ok(isBlockedStore("tcgsynergy"));
  assert.ok(isBlockedStore("TCG Synergy"));
  assert.ok(isBlockedStore("https://tcgsynergy.myshopify.com"));
  assert.ok(isBlockedStore("https://www.tcg-synergy.ca"));
  assert.ok(!isBlockedStore("thesidedeck", "The Side Deck", "https://thesidedeck.ca"));
  assert.ok(!isBlockedStore(undefined, null));
});

test("no banned store is in the registry, the shipping rates or the store list", () => {
  const registry = JSON.parse(readFileSync(new URL("../src/data/stores.json", import.meta.url), "utf8")) as { key: string; name: string; base: string }[];
  assert.deepEqual(registry.filter((s) => isBlockedStore(s.key, s.name, s.base)).map((s) => s.key), []);
  const shipping = readFileSync(new URL("../src/data/shipping-rates.json", import.meta.url), "utf8");
  for (const b of BLOCKED_STORES) assert.ok(!shipping.toLowerCase().includes(b), `${b} in shipping-rates.json`);
  assert.equal(STORES.filter((s) => isBlockedStore(s.key, s.name, s.base)).length, 0);
  assert.equal(STORE_BY_KEY.get("tcgsynergy"), undefined);
});

test("rows of a banned store in the data export never reach a page", () => {
  delete process.env.PUBLIC_DATA_DIR;
  resetPublicData();
  try {
    assert.equal(publicRows("Offer").filter((r) => isBlockedStore(r.store as string)).length, 0);
    assert.equal(publicRows("StoreStat").filter((r) => isBlockedStore(r.store as string)).length, 0);
    assert.ok(publicRows("Offer").length > 0);
  } finally {
    resetPublicData();
  }
});
