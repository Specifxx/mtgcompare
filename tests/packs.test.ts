import { test } from "node:test";
import assert from "node:assert/strict";
import { packsFor, packsForLabel, perPackCents } from "../src/lib/packs";
import { compactCard, expandCard } from "../src/lib/compact";
import { medianSaving, pctOf, relativeDay } from "../src/lib/format";
import { usMsrpCents, usMsrpForCard } from "../src/lib/rrp";
import type { ProductCardData } from "../src/lib/data";

test("ETB pack counts follow the series: 8 to Sword & Shield, 9 from Scarlet & Violet", () => {
  assert.equal(packsFor("etb", "xy12"), 8);
  assert.equal(packsFor("etb", "sm12"), 8);
  assert.equal(packsFor("etb", "swsh12"), 8);
  assert.equal(packsFor("etb", "sv8"), 9);
  assert.equal(packsFor("etb", "me2"), 9);
  // Pokémon Center ETBs hold two more.
  assert.equal(packsFor("pc-etb", "sv8"), 11);
  assert.equal(packsFor("pc-etb", "swsh12"), 10);
  assert.equal(packsFor("pc-etb", "sm12"), null); // none published for Sun & Moon
  assert.equal(packsFor("pc-etb", "cel25"), null); // Celebrations: no honest count, as for its ETB
});

test("ETB pack counts by set: the 10-pack special sets, and Celebrations refuses a per-pack price", () => {
  for (const code of ["g1", "sm35", "sm75", "sm115", "swsh35", "swsh45", "pgo", "swsh12pt5"]) assert.equal(packsFor("etb", code), 10, code);
  assert.equal(packsFor("etb", "cel25"), null);
  assert.equal(packsFor("etb", null), null); // no set: no series to look up
  assert.equal(packsFor("etb", "not-a-set"), null);
});

test("blisters: the name says whether it is a 1-, 2- or 3-pack", () => {
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Single Pack Blister"), 1);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks 1 Pack Blister"), 1);
  // A bare checklane blister holds one pack or two depending on the set: no per-pack price.
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Checklane Blister"), null);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Premium Checklane Blister"), null);
  assert.equal(packsFor("blister", "sv8", "Checklane 2-Pack Blister [Pawmot]"), 2);
  assert.equal(packsFor("blister", "sv8", "Obsidian Flames Checklane Blister - Pawmi & Wooper - 2 Pack"), 2);
  assert.equal(packsFor("blister", "sv8", "Journey Together 1 Pack Checklane Blister"), 1);
  assert.equal(packsFor("blister", "sv8", "Checklane 2-Pack Pin Blister [Arceus]"), 2);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks 2-Pack Blister"), 2);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Two Pack Blister"), 2);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks 3 Pack Blister"), 3);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks 3pk Blister"), 3);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Triple Blister"), 3);
  assert.equal(packsFor("blister", "sv8", "Surging Sparks Blister"), null);
});

test("cases and the fixed lines", () => {
  assert.equal(packsFor("booster-box", "sv8"), 36);
  assert.equal(packsFor("booster-box", null), 36);
  assert.equal(packsFor("booster-box-case", "sv8"), 216);
  assert.equal(packsFor("etb-case", "sv8"), 90);
  assert.equal(packsFor("etb-case", "swsh12"), 80);
  assert.equal(packsFor("etb-case", "cel25"), null);
  assert.equal(packsFor("booster-bundle", "sv8"), 6);
  assert.equal(packsFor("booster-pack", "sv8"), 1);
  assert.equal(packsFor("sleeved-booster", "sv8"), 1);
  assert.equal(packsFor("build-battle", "sv8"), 4);
  assert.equal(packsFor("build-battle-stadium", "swsh12"), 12);
  assert.equal(packsFor("build-battle-stadium", "sv8"), 11);
  assert.equal(packsFor("build-battle-stadium", "me2"), null);
});

test("types whose pack count varies per product get null, never a guess", () => {
  for (const t of ["upc", "collection", "tin", "deck", "booster-bundle-case"] as const) assert.equal(packsFor(t, "sv8", "anything"), null, t);
  assert.equal(packsForLabel("Tin", "sv8"), null);
  assert.equal(packsForLabel("Booster Box", "sv8"), 36);
  assert.equal(packsForLabel("Not A Type", "sv8"), null);
});

test("perPackCents rounds and refuses nonsense", () => {
  assert.equal(perPackCents(29900, 36), 831);
  assert.equal(perPackCents(4999, 9), 555);
  assert.equal(perPackCents(29900, null), null);
  assert.equal(perPackCents(null, 36), null);
  assert.equal(perPackCents(0, 36), null);
});

test("US MSRP: two tiers, US only, nothing for older series", () => {
  assert.equal(usMsrpCents("etb", "sv8"), 4999);
  assert.equal(usMsrpCents("booster-pack", "sv1"), 449); // Pokémon Center's S&V list price; $3.99 was Sword & Shield's
  assert.equal(usMsrpCents("booster-box", "sv8"), 16164);
  assert.equal(usMsrpCents("booster-box", "me2"), 16164);
  assert.equal(usMsrpCents("etb", "swsh12"), null);
  assert.equal(usMsrpCents("tin", "sv8"), null);
  assert.equal(usMsrpCents("etb", null), null);
  assert.equal(usMsrpForCard("US", "Elite Trainer Box", "sv8"), 4999);
  assert.equal(usMsrpForCard("AU", "Elite Trainer Box", "sv8"), null);
});

test("median saving: three stores and 10% under, or nothing; never 'above'", () => {
  assert.equal(medianSaving(4100, 5000, 6), "18% below the median of 6 stores");
  assert.equal(medianSaving(4600, 5000, 6), null); // 8% is noise
  assert.equal(medianSaving(4500, 5000, 6), "10% below the median of 6 stores"); // exactly the bar
  assert.equal(medianSaving(4520, 5000, 6), null); // 9.6% under is not "10% below"
  assert.equal(medianSaving(4100, 5000, 2), null); // too few stores
  assert.equal(medianSaving(4100, null, 6), null);
  assert.equal(medianSaving(6000, 5000, 6), null);
  assert.equal(pctOf(4100, 5000), -18);
  assert.equal(pctOf(5500, 5000), 10);
  assert.equal(pctOf(5500, null), null);
});

test("relativeDay", () => {
  assert.equal(relativeDay("2026-10-10", "2026-09-28"), "in 12 days");
  assert.equal(relativeDay("2026-09-29", "2026-09-28"), "tomorrow");
  assert.equal(relativeDay("2026-09-28", "2026-09-28"), "today");
  assert.equal(relativeDay("2026-09-27", "2026-09-28"), "yesterday");
  assert.equal(relativeDay("2026-09-01", "2026-09-28"), "27 days ago");
});

test("compact tuple round-trips a card, median included, and abbreviates Shopify's CDN", () => {
  const card: ProductCardData = {
    slug: "pitch-black-booster-box",
    name: "Pitch Black Booster Box",
    productType: "Booster Box",
    setCode: "me5",
    imageUrl: "https://cdn.shopify.com/s/files/1/0001/products/pb.jpg?v=1",
    lowestPriceCents: 29900,
    inStockStores: 18,
    listedStores: 30,
    marketplaceOpen: false,
    medianOpenCents: 32995,
    releaseDate: "2026-07-17",
  };
  const c = compactCard(card);
  assert.equal(c.length, 10);
  assert.ok(c[4]!.startsWith("~"), "Shopify prefix abbreviated");
  assert.deepEqual(expandCard(c), card);
  // A card with no median or image survives too.
  const bare = { ...card, imageUrl: null, medianOpenCents: null, setCode: null, releaseDate: null };
  assert.deepEqual(expandCard(compactCard(bare)), bare);
});
