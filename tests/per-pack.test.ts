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

const card = (slug: string, productType: string, lowestPriceCents: number | null, open = true, setCode: string | null = "me4"): ProductCardData => ({
  slug,
  name: `Chaos Rising ${productType}`,
  productType,
  setCode,
  imageUrl: null,
  lowestPriceCents,
  inStockStores: open ? 3 : 0,
  listedStores: 3,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: "2026-05-22",
});

test("cheapestPerPackByType: per pack type, the OPEN product with the lowest price per pack, in PACK_TYPES order", () => {
  const products = [
    card("bundle", "Booster Bundle", 5496), // 6 packs: 916 a pack
    card("etb-a", "Elite Trainer Box", 8820), // 9 packs (Mega Evolution): 980 a pack
    card("etb-b", "Elite Trainer Box", 9900),
    card("box-sold", "Booster Box", 20000, false), // sold out: not a price you can pay
    card("box", "Booster Box", 27000), // 36 packs: 750 a pack
    card("tin", "Tin", 1500), // packs vary: no honest per-pack price
    card("collection", "Collection", 3000),
    card("no-price", "Booster Bundle", null),
  ];
  const got = cheapestPerPackByType(products);
  assert.deepEqual(
    got.map((x) => [x.p.slug, x.perPack, x.packs]),
    [
      ["box", 750, 36],
      ["etb-a", 980, 9],
      ["bundle", 916, 6],
    ],
  );
  assert.deepEqual(got.map((x) => x.p.productType), PACK_TYPES.filter((t) => got.some((x) => x.p.productType === t)), "PACK_TYPES order");
  for (const x of got) assert.equal(x.packs, packsForLabel(x.p.productType, x.p.setCode, x.p.name));
  assert.deepEqual(cheapestPerPackByType([]), []);
  assert.deepEqual(cheapestPerPackByType([card("x", "Booster Box", 27000, false)]), [], "nothing open, nothing to rank");
  assert.ok(!PACK_TYPES.includes("Tin") && !PACK_TYPES.includes("Collection") && !PACK_TYPES.includes("Ultra-Premium Collection"));
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
  assert.match(TYPE_ABOUT["booster-boxes"], /36 booster packs/);
});
