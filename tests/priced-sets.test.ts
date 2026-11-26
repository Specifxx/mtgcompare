// No set page without prices (owner, 2026-11-26; lib/priced-sets.ts): a set's pre-order page and every link to it exist in a market
// only once a store there prices it, and the table the site reads is the one the export writes beside the snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPricedSets, serializePricedSets, setPricedIn } from "../src/lib/priced-sets";

const products = [
  { id: "a", setCode: "new" },
  { id: "b", setCode: "new" },
  { id: "c", setCode: "old" },
  { id: "d", setCode: null },
];
const isStore = (k: string) => k !== "tcgplayer";

test("a set is priced in a market only by a store offer with a price", () => {
  const t = buildPricedSets(
    products,
    [
      { productId: "a", store: "shopus", market: "US", priceCents: 14999 },
      { productId: "b", store: "shopau", market: "AU", priceCents: 0 }, // no price
      { productId: "b", store: "tcgplayer", market: "US", priceCents: 9999 }, // a marketplace, not a store
      { productId: "c", store: "tcgplayer", market: "US", priceCents: 9999 },
      { productId: "d", store: "shopus", market: "US", priceCents: 500 }, // no set
    ],
    isStore,
  );
  assert.deepEqual(t, { new: ["US"] });
  assert.equal(setPricedIn("new", "us", t), true);
  assert.equal(setPricedIn("new", "US", t), true);
  assert.equal(setPricedIn("new", "au", t), false);
  assert.equal(setPricedIn("new", undefined, t), true);
  assert.equal(setPricedIn("old", undefined, t), false);
});

test("a set announced with no store listing has no page and no link anywhere", () => {
  assert.equal(setPricedIn("zzz-not-listed"), false);
});

test("the committed table is the serialiser's format and names only known markets", () => {
  const raw = fs.readFileSync("data/sets/priced.json", "utf8");
  const t = JSON.parse(raw) as Record<string, string[]>;
  assert.equal(serializePricedSets(t), raw);
  for (const markets of Object.values(t)) for (const m of markets) assert.match(m, /^(US|AU|UK|CA|NZ|EU|SG)$/);
});

test("every pre-order link and page asks the table", () => {
  const read = (f: string) => fs.readFileSync(f, "utf8");
  assert.match(read("src/lib/preorder-guides.ts"), /setPricedIn\(set\.code, where\)/);
  assert.match(read("src/lib/preorder-guides.ts"), /setPricedIn\(set\.code, region\)/);
  const page = read("src/app/[region]/preorders/[set]/page.tsx");
  assert.equal((page.match(/if \(!setPricedIn\(found\.set\.code, r\.market\)\) notFound\(\);/g) ?? []).length, 2);
  assert.match(read("src/lib/sitemap.ts"), /openPreorderGuides\(today, r\.region\)/);
  assert.match(read("scripts/export-public-data.ts"), /serializePricedSets\(pricedSets\)/);
});
