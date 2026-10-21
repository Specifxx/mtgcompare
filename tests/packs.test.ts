import { test } from "node:test";
import assert from "node:assert/strict";
import { packsFor, packsForLabel, perPackCents } from "../src/lib/packs";
import { compactCard, expandCard } from "../src/lib/compact";
import { medianSaving, pctOf, relativeDay } from "../src/lib/format";
import { usMsrpCents, usMsrpForCard } from "../src/lib/rrp";
import type { ProductCardData } from "../src/lib/data";

test("Play Booster Boxes: 36 packs until Innistrad Remastered, 30 from Aetherdrift (February 2025) on", () => {
  assert.equal(packsFor("play-booster-box", "mkm"), 36);
  assert.equal(packsFor("play-booster-box", "dsk"), 36);
  assert.equal(packsFor("play-booster-box", "fdn"), 36);
  assert.equal(packsFor("play-booster-box", "inr"), 36);
  assert.equal(packsFor("play-booster-box", "dft"), 30);
  assert.equal(packsFor("play-booster-box", "fin"), 30);
  assert.equal(packsFor("play-booster-box", "trk"), 30);
  assert.equal(packsFor("play-booster-box", null), null, "no set, no count");
  assert.equal(packsForLabel("Play Booster Box", "blb"), 36);
});

test("Collector, Draft, Set and Jumpstart displays: the usual size, and none for the sets whose displays were smaller", () => {
  assert.equal(packsFor("collector-booster-box", "fin"), 12);
  assert.equal(packsFor("collector-booster-box", "afr"), 12);
  assert.equal(packsFor("collector-booster-box", "2x2"), null, "Double Masters' collector display was not 12");
  assert.equal(packsFor("draft-booster-box", "dmu"), 36);
  assert.equal(packsFor("draft-booster-box", "cmr"), null, "Commander Legends' draft display held 24");
  assert.equal(packsFor("set-booster-box", "mom"), 30);
  assert.equal(packsFor("jumpstart-booster-box", "j22"), 24);
  assert.equal(packsFor("jumpstart-booster-box", "msh"), null, "unconfirmed for a main set's Jumpstart display");
});

test("Bundles: 9 Play Boosters in the Play Booster era, none before; single boosters are one pack", () => {
  assert.equal(packsFor("bundle", "trk"), 9);
  assert.equal(packsFor("bundle", "mkm"), 9);
  assert.equal(packsFor("bundle", "lci"), null, "a Set Booster-era bundle: count not fixed by us");
  assert.equal(packsFor("bundle", "acr"), null, "Assassin's Creed sold no Play Boosters");
  for (const t of ["play-booster", "collector-booster", "draft-booster", "set-booster", "jumpstart-booster"] as const) assert.equal(packsFor(t, "blb"), 1, t);
});

test("mixed-pack and multi-product types get null, never a guess", () => {
  for (const t of ["gift-bundle", "special-bundle", "draft-night", "prerelease-pack", "commander-deck", "commander-deck-set", "scene-box", "starter", "secret-lair", "deck", "collection", "play-booster-box-case", "collector-booster-box-case", "bundle-case"] as const) {
    assert.equal(packsFor(t, "trk"), null, t);
  }
  assert.equal(packsForLabel("No Such Type", "trk"), null);
});

test("perPackCents rounds and refuses nonsense", () => {
  assert.equal(perPackCents(21900, 30), 730);
  assert.equal(perPackCents(1000, 3), 333);
  assert.equal(perPackCents(null, 30), null);
  assert.equal(perPackCents(21900, null), null);
  assert.equal(perPackCents(0, 30), null);
});

test("US MSRP: only Wizards' announced Star Trek prices, US only; never a display, never another set", () => {
  assert.equal(usMsrpCents("play-booster", "trk"), 699);
  assert.equal(usMsrpCents("collector-booster", "trk"), 3799);
  assert.equal(usMsrpCents("bundle", "trk"), 6999);
  assert.equal(usMsrpCents("draft-night", "trk"), 11999);
  assert.equal(usMsrpCents("play-booster-box", "trk"), null, "a box's price is never derived from a pack's");
  assert.equal(usMsrpCents("commander-deck", "trk"), null, "the deck and its Collector's Edition share a type");
  assert.equal(usMsrpCents("play-booster", "blb"), null);
  assert.equal(usMsrpCents("play-booster", null), null);
  assert.equal(usMsrpForCard("US", "Bundle", "trk"), 6999);
  assert.equal(usMsrpForCard("AU", "Bundle", "trk"), null);
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
    slug: "bloomburrow-play-booster-box",
    name: "Bloomburrow Play Booster Box",
    productType: "Play Booster Box",
    setCode: "blb",
    imageUrl: "https://cdn.shopify.com/s/files/1/0001/products/pb.jpg?v=1",
    lowestPriceCents: 29900,
    inStockStores: 18,
    listedStores: 30,
    marketplaceOpen: false,
    medianOpenCents: 32995,
    releaseDate: "2024-08-02",
  };
  const c = compactCard(card);
  assert.equal(c.length, 10);
  assert.ok(c[4]!.startsWith("~"), "Shopify prefix abbreviated");
  assert.deepEqual(expandCard(c), card);
  // A card with no median or image survives too.
  const bare = { ...card, imageUrl: null, medianOpenCents: null, setCode: null, releaseDate: null };
  assert.deepEqual(expandCard(compactCard(bare)), bare);
});
