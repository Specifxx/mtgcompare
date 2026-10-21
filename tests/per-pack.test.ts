// The pure modules the growth release moved out of pages so every workstream can share them: price per pack by type
// (src/lib/per-pack.ts, from the set page) and the type descriptions (src/lib/type-about.ts, from the type page).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProductCardData } from "../src/lib/data";
import { packsForLabel } from "../src/lib/packs";
import { cheapestPerPackByType, PACK_TYPES } from "../src/lib/per-pack";
import { PRODUCT_TYPES } from "../src/lib/sealed-title";
import { TYPE_ABOUT } from "../src/lib/type-about";

const card = (slug: string, productType: string, lowestPriceCents: number | null, open = true, setCode: string | null = "blb"): ProductCardData => ({
  slug,
  name: `Bloomburrow ${productType}`,
  productType,
  setCode,
  imageUrl: null,
  lowestPriceCents,
  inStockStores: open ? 3 : 0,
  listedStores: 3,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: "2024-08-02",
});

test("cheapestPerPackByType: per pack type, the OPEN product with the lowest price per pack, in PACK_TYPES order", () => {
  const products = [
    card("bundle", "Bundle", 5994), // 9 Play Boosters: 666 a pack
    card("box-sold", "Play Booster Box", 18000, false), // sold out: not a price you can pay
    card("box", "Play Booster Box", 21600), // 36 packs (Bloomburrow): 600 a pack
    card("box-b", "Play Booster Box", 23000),
    card("pack", "Play Booster Pack", 699),
    card("collector", "Collector Booster Box", 30000), // a different pack: never compared
    card("gift", "Gift Bundle", 8000), // mixed packs: no honest per-pack price
    card("deck", "Commander Deck", 5000),
    card("no-price", "Bundle", null),
  ];
  const got = cheapestPerPackByType(products);
  assert.deepEqual(
    got.map((x) => [x.p.slug, x.perPack, x.packs]),
    [
      ["box", 600, 36],
      ["bundle", 666, 9],
      ["pack", 699, 1],
    ],
  );
  assert.deepEqual(got.map((x) => x.p.productType), PACK_TYPES.filter((t) => got.some((x) => x.p.productType === t)), "PACK_TYPES order");
  for (const x of got) assert.equal(x.packs, packsForLabel(x.p.productType, x.p.setCode, x.p.name));
  assert.deepEqual(cheapestPerPackByType([]), []);
  assert.deepEqual(cheapestPerPackByType([card("x", "Play Booster Box", 21600, false)]), [], "nothing open, nothing to rank");
  for (const t of ["Collector Booster Box", "Collector Booster Pack", "Gift Bundle", "Draft Night", "Commander Deck", "Prerelease Pack"]) assert.ok(!PACK_TYPES.includes(t), t);
});

test("the moves are moves: the set page imports per-pack.ts and the type page type-about.ts, and neither keeps its own copy", () => {
  const set = readFileSync(new URL("../src/app/[region]/sets/[set]/page.tsx", import.meta.url), "utf8");
  assert.match(set, /from "@\/lib\/per-pack"/);
  assert.match(set, /cheapestPerPackByType\(products\)/);
  assert.doesNotMatch(set, /const PACK_TYPES|function cheapestPerPack\b/);
  const type = readFileSync(new URL("../src/app/[region]/type/[type]/page.tsx", import.meta.url), "utf8");
  assert.match(type, /from "@\/lib\/type-about"/);
  assert.match(type, /TYPE_ABOUT\[t\.slug\]/);
  assert.doesNotMatch(type, /const ABOUT\b/);
});

test("TYPE_ABOUT: a sentence for every product type, keyed by slug, and nothing for a type that does not exist", () => {
  for (const t of PRODUCT_TYPES) assert.ok(TYPE_ABOUT[t.slug]?.length > 20, t.slug);
  const slugs = new Set(PRODUCT_TYPES.map((t) => t.slug));
  for (const k of Object.keys(TYPE_ABOUT)) assert.ok(slugs.has(k), `${k} is a type slug`);
  assert.match(TYPE_ABOUT["play-booster-boxes"], /36 packs .* 30 from Aetherdrift/);
  assert.match(TYPE_ABOUT["collector-booster-boxes"], /12 Collector Boosters/);
});
