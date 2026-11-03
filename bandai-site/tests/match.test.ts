import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product, SetInfo } from "@/lib/site-types";
import { buildIndex, matchCard, matchSealed, markersAgree, numbersInTitle, printingOf } from "@/lib/import/match";

const set = (id: number, name: string): SetInfo => ({ id, name, code: String(id), slug: name, releasedOn: "2026-01-01", productCount: 1, upcoming: false });
const card = (id: number, name: string, number: string, setId: number, rarity = "Rare"): Product => ({ id, slug: String(id), name, kind: "card", setId, number, rarity, attrs: {}, sealedType: null, image: null, tcgUrl: "", printings: [] });
const sealed = (id: number, name: string, setId: number): Product => ({ ...card(id, name, "", setId), kind: "sealed", number: null, sealedType: "x" });

const sets = [set(1, "The First Chapter"), set(2, "Hyperia City"), set(3, "Attack of the Vine!")];
const products = [
  card(10, "Elsa - Spirit of Winter", "42/204", 1, "Legendary"),
  card(11, "Elsa - Spirit of Winter (Enchanted)", "207/204", 1, "Enchanted"),
  card(12, "Fru Fru - VIP Guest", "1/204", 2, "Common"),
  card(13, "4*Town - Hottest Band of the Year", "17/204", 3),
  sealed(20, "Disney Lorcana: Hyperia City Booster Box", 2),
  sealed(21, "Disney Lorcana: Hyperia City Booster Box Case", 2),
  sealed(22, "Disney Lorcana: Into the Inkdark Collector Booster Display", 2),
  sealed(23, "Disney Lorcana: Hyperia City Booster Pack", 2),
];
const idx = buildIndex(products, sets, "fraction");

test("card by number and name", () => {
  assert.equal(matchCard("Elsa - Spirit of Winter (42/204) [The First Chapter]", idx)?.product.id, 10);
  assert.equal(matchCard("Elsa - Spirit of Winter - Enchanted - 207/204 - Holo Foil", idx)?.product.id, 11);
  assert.equal(matchCard("Shenzi - Hyena Pack Leader (85//204) [Into the Inklands]", idx), null);
});

test("never matches on number alone", () => {
  assert.equal(matchCard("Mickey Mouse - True Friend 42/204", idx), null);
});

test("bare number with the set in the product type", () => {
  assert.equal(matchCard("4*Town, Hottest Band of the Year (0017) - Cold Foil", idx, "Disney Lorcana Singles > Attack of the Vine!")?.product.id, 13);
  assert.equal(matchCard("4*Town, Hottest Band of the Year (0017)", idx, "Disney Lorcana Singles > Hyperia City"), null);
});

test("foreign-language product is never matched", () => {
  assert.equal(matchSealed("Lorcana - Hyperia City - Japanese Booster Box (16 Packs)", idx), null);
});

test("sealed: box vs case vs collector display", () => {
  assert.equal(matchSealed("Disney Lorcana: Hyperia City - Booster Box", idx)?.product.id, 20);
  assert.equal(matchSealed("Disney Lorcana: Hyperia City Booster Box Case (4 boxes)", idx)?.product.id, 21);
  assert.equal(matchSealed("Disney Lorcana - Into the Inkdark Booster Display - EN", idx), null);
});

test("sealed: a pack bundle is never one pack (live, 2026-10-27: Mad Merchant)", () => {
  assert.equal(matchSealed("Disney Lorcana: Hyperia City Booster Pack", idx)?.product.id, 23);
  assert.equal(matchSealed("Disney Lorcana Pack Bundle - Hyperia City", idx), null);
  assert.equal(matchSealed("Disney Lorcana: Hyperia City Booster Pack Bundle", idx), null);
});

test("variant markers", () => {
  assert.equal(markersAgree("Psycho Gundam (LR+)", "LR+", "Psycho Gundam GD02-012 Parallel"), true);
  assert.equal(markersAgree("Psycho Gundam", "Legend Rare", "Psycho Gundam GD02-012 Parallel"), false);
  assert.equal(markersAgree("Psycho Gundam (LR+)", "LR+", "Psycho Gundam GD02-012"), false);
  assert.equal(printingOf("Elsa - Cold Foil"), "Cold Foil");
  assert.equal(printingOf("Elsa", "Non-Foil"), "Normal");
});

test("set code / initials / bare-number-with-set-tag formats", () => {
  const s2 = [set(1, "The First Chapter"), set(3, "Attack of the Vine!")];
  s2[1].code = "13";
  s2[0].code = "1";
  const idx2 = buildIndex([card(30, "Ariel - On Human Legs", "1/204", 1), card(13, "4*Town - Hottest Band of the Year", "17/204", 3), card(31, "Ursula - Power Hungry", "59/204", 1)], s2, "fraction");
  assert.equal(matchCard("4*Town - Hottest Band of the Year (13-017) (Cold Foil)", idx2)?.product.id, 13);
  assert.equal(matchCard("Ariel - On Human Legs [TFC-1] NM / Normal", idx2)?.product.id, 30);
  assert.equal(matchCard("1TFC-059, L, Ursula - Power Hungry", idx2)?.product.id, 31);
  assert.equal(matchCard("Ariel - On Human Legs (1)", idx2, "Singles | 1 | Character | Lorcana")?.product.id, 30);
  assert.equal(matchCard("Ariel - On Human Legs (1)", idx2, "Singles | 13 | Character"), null);
});

test("every store request names the store's own country (Shopify Markets)", async () => {
  const { countryOf } = await import("@/lib/import/shopify");
  const base = { key: "x", name: "x", base: "https://x", collections: [], kind: "both" as const };
  assert.equal(countryOf({ ...base, market: "AU" }), "AU");
  assert.equal(countryOf({ ...base, market: "UK" }), "GB");
  assert.equal(countryOf({ ...base, market: "EU" }), "ES");
});

// ── Yu-Gi-Oh! ("ygo" numbers, rarity must agree, editions) ─────────────────
const ygoSets = [set(101, "Rarity Collection"), set(102, "Legend of Blue Eyes White Dragon"), set(103, "Maze of Millennia")];
const ygo = [
  card(200, "Ash Blossom & Joyous Spring (Quarter Century Secret Rare)", "RA01-EN008", 101, "Quarter Century Secret Rare"),
  card(201, "Ash Blossom & Joyous Spring (Super Rare)", "RA01-EN008", 101, "Super Rare"),
  card(202, "Ash Blossom & Joyous Spring (Platinum Secret Rare)", "RA01-EN008", 101, "Platinum Secret Rare"),
  card(203, "Blue-Eyes White Dragon", "LOB-001", 102, "Ultra Rare"),
  card(204, "Rare Metal Dragon", "MAZE-EN010", 103, "Rare"),
  card(205, "Blue-Eyes White Dragon", "LOB-E001", 102, "Ultra Rare"),
];
const yidx = buildIndex(ygo, ygoSets, "ygo", { rarityMustAgree: true, rarityAliases: { "Quarter Century Secret Rare": ["QCSR", "QCScR"], "Platinum Secret Rare": ["PlScR"] } });

test("ygo numbers: language is part of the key; other languages never match", () => {
  assert.deepEqual(numbersInTitle("Ash Blossom - RA01-EN008 - QCSR", "ygo"), ["RA01-EN008"]);
  assert.deepEqual(numbersInTitle("Blue-Eyes White Dragon LOB-001 Ultra Rare", "ygo"), ["LOB-001"]);
  assert.deepEqual(numbersInTitle("Dark Magician YGLD-ENA01", "ygo"), ["YGLD-ENA001"]);
  assert.deepEqual(numbersInTitle("Ash Blossom RA01-DE008", "ygo"), []);
  assert.deepEqual(numbersInTitle("Ash Blossom RA01-AE008", "ygo"), []);
  assert.deepEqual(numbersInTitle("Released 2026-11 in a 25-card box", "ygo"), []);
});

test("ygo: the rarity a title names picks the printing; none named between rarities is no match", () => {
  assert.equal(matchCard("Ash Blossom & Joyous Spring - RA01-EN008 - Quarter Century Secret Rare - 1st Edition", yidx)?.product.id, 200);
  assert.equal(matchCard("Ash Blossom & Joyous Spring [RA01-EN008] Super Rare", yidx)?.product.id, 201);
  assert.equal(matchCard("Ash Blossom & Joyous Spring (QCSR) RA01-EN008", yidx)?.product.id, 200);
  assert.equal(matchCard("Ash Blossom & Joyous Spring RA01-EN008 PlScR", yidx)?.product.id, 202);
  assert.equal(matchCard("Ash Blossom & Joyous Spring RA01-EN008", yidx), null);
  assert.equal(matchCard("Ash Blossom & Joyous Spring - RA01-EN008 - Secret Rare", yidx), null);
});

test("ygo: a card named like a rarity, and LOB-001 vs LOB-E001", () => {
  assert.equal(matchCard("Rare Metal Dragon - MAZE-EN010 - Rare - 1st Edition", yidx)?.product.id, 204);
  assert.equal(matchCard("Rare Metal Dragon - MAZE-EN010 - Ultra Rare", yidx), null);
  assert.equal(matchCard("Blue-Eyes White Dragon - LOB-001 - Ultra Rare - Unlimited", yidx)?.product.id, 203);
  assert.equal(matchCard("Blue-Eyes White Dragon - LOB-E001 - Ultra Rare", yidx)?.product.id, 205);
});

test("ygo editions: named edition, single printing, or unknown", () => {
  assert.equal(printingOf("Ash Blossom - RA01-EN008", "Near Mint 1st Edition", ["1st Edition"]), "1st Edition");
  assert.equal(printingOf("Blue-Eyes White Dragon - LOB-001 - Unlimited", "", ["1st Edition", "Unlimited"]), "Unlimited");
  assert.equal(printingOf("Blue-Eyes White Dragon - LOB-001", "Near Mint", ["1st Edition", "Unlimited"]), undefined);
  assert.equal(printingOf("Ash Blossom - RA01-EN008", "Near Mint", ["1st Edition"]), "1st Edition");
  assert.equal(printingOf("Ash Blossom - RA01-EN008 Unlimited", "", ["1st Edition"]), undefined);
  assert.equal(printingOf("Elsa - Spirit of Winter Holo Foil", "", ["Normal", "Foil"]), "Foil");
});

test("used, damaged and graded store listings are left out", async () => {
  const { isUnfitListing } = await import("@/lib/import/match");
  assert.equal(isUnfitListing("Yu-Gi-Oh Dark Crisis - Guardian Grarl - DCR-007 - Used Ultra Rare card"), true);
  assert.equal(isUnfitListing("2002 Yu-Gi-Oh! Magic Ruler 1st Edition #076 Toon World PSA 9"), true);
  assert.equal(isUnfitListing("Ash Blossom & Joyous Spring - RA01-EN008 - Quarter Century Secret Rare - 1st Edition"), false);
  assert.equal(isUnfitListing("Elsa - Spirit of Winter (42/204) [The First Chapter]"), false);
});

test("ygo: real store title formats from the 2026-10-26 probe", () => {
  const p = [
    card(300, "Swiftwind Panther Warrior (Super Rare)", "BETB-EN001", 103, "Super Rare"),
    card(301, "Swiftwind Panther Warrior (Starlight Rare)", "BETB-EN001", 103, "Starlight Rare"),
    card(302, "Garura, Wings of Resonant Life", "RA02-EN024", 101, "Ultra Rare"),
    card(303, "Garura, Wings of Resonant Life (Secret Rare)", "RA02-EN024", 101, "Secret Rare"),
    card(304, "Fiendsmith in Paradise", "INFO-EN072", 103, "Super Rare"),
  ];
  const i = buildIndex(p, ygoSets, "ygo", { rarityMustAgree: true, rarityAliases: { "Starlight Rare": ["StR"], "Ultra Rare": ["UR"], "Super Rare": ["SR"] } });
  assert.equal(matchCard("Swiftwind Panther Warrior (Starlight Rare) [BETB-EN001-StR]", i)?.product.id, 301);
  assert.equal(matchCard("Swiftwind Panther Warrior (Super Rare) [BETB-EN001-SuR]", i)?.product.id, 300);
  assert.equal(matchCard("Garura, Wings of Resonant Life (UR) [RA02 - RA02-EN024]", i)?.product.id, 302);
  assert.equal(matchCard("Fiendsmith in Paradise [INFO-EN072] Super Rare", i)?.product.id, 304);
  assert.equal(matchCard("Yu-Gi-Oh! Crackle Blitzclique CORI-EN012 1st Edition NM", i), null);
});
