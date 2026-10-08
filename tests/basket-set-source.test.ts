import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBasketRequest } from "../src/lib/basket-request";
import { loadSetGapPrices } from "../src/lib/basket-server";
import type { BasketListingTuple } from "../src/lib/data";

// "Finish a set" (source "set") on /api/basket, wired at integration: the set
// tracker's "Plan the purchase" link carries ?source=set&set=<slug>; the request
// parser keeps only a well-formed slug, a known rarity and a sane ceiling, and
// the price the plan ranks by is the cheapest copy at the member's floor among
// stores whose postage we can price.

// Real products of the fixture: Sol Ring (Commander Masters), Counterspell (MH2 267), Birds of Paradise (7ED 231).
const SOL = 594545, BOLT = 238617, TOWER = 2831;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the set source's request fields are parsed and bounded; other sources ignore them", () => {
  const r = parseBasketRequest({ source: "set", set: "Modern-Horizons-2", scope: "all", rarity: "M", maxPriceCents: 1234.9, after: "x" });
  assert.equal(r.source, "set");
  assert.equal(r.setSlug, "modern-horizons-2");
  assert.equal(r.scope, "all");
  assert.equal(r.rarity, "M");
  assert.equal(r.maxPriceCents, 1234);
  assert.equal(r.after, null, "a malformed cursor is no cursor");
  assert.equal(r.skipOwned, true, "a set prices only what is missing");
  const bad = parseBasketRequest({ source: "set", set: "../etc", rarity: "nope", maxPriceCents: -5 });
  assert.deepEqual([bad.setSlug, bad.rarity, bad.maxPriceCents], ["", null, null]);
  const other = parseBasketRequest({ source: "deck", set: "mh2", rarity: "M", maxPriceCents: 500 });
  assert.deepEqual([other.setSlug, other.rarity, other.maxPriceCents], ["", null, null]);
});

test("loadSetGapPrices: floor price and any-condition price per card, priceable stores only, never eBay", async () => {
  const rows: BasketListingTuple[] = [
    [SOL * 2, "store:alpha", 500, 0, "u"],
    [SOL * 2, "store:alpha", 300, 3, "u"],
    [SOL * 2, "store:nopost", 100, 0, "u"],
    [BOLT * 2, "store:alpha", 200, 3, "u"],
    [TOWER * 2, "ebay", 50, 0, "u"],
  ];
  const got = await loadSetGapPrices([SOL, BOLT, TOWER], "US", ["alpha"], "lp", async () => rows, async (ids) => new Map(ids.map((id) => [id, id * 2])));
  assert.deepEqual(got.get(SOL), { floorCents: 500, anyCents: 300 });
  assert.deepEqual(got.get(BOLT), { floorCents: null, anyCents: 200 }, "only below the floor");
  assert.equal(got.has(TOWER), false, "eBay is never a basket store");
});

test("the route and the page wire the set source; the set tracker's link lands on it", () => {
  const route = read("src/app/api/basket/route.ts");
  assert.match(route, /loadSetGapLines\(userId, setSlug, scope, country/);
  assert.match(route, /setGapFields\(full|setGapFields\(false/);
  assert.match(route, /skipOwned && source !== "set"/);
  const page = read("src/app/tools/best-basket/page.tsx");
  assert.match(page, /initialSet/);
  assert.match(read("src/components/SetTracker.tsx"), /source: "set", set: setSlug/);
});
