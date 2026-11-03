import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product, SetInfo } from "@/lib/site-types";
import { buildIndex, looksSealed, matchCard, matchSealed, numbersInTitle, titleEdition, type SetEdition } from "@/lib/import/match";

// SITE.setEditions (2026-11-01, Cyberpunk TCG): one set printed as "Beta"
// (Kickstarter, 36-pack boxes, ~US$315) and "Retail" (24 packs, ~US$155) under
// the same names. Store titles are real ones from the store probe.
const EDITIONS: SetEdition[] = [
  { word: "beta", implied: /\b36[- ]?(packs?|ct|count)\b|kickstarter|\bbackers?\b|\bB\d{3}\b/i },
  { word: "retail", default: true },
];
const set = (id: number, name: string): SetInfo => ({ id, name, code: "", slug: String(id), releasedOn: "2026-11-06", productCount: 1, upcoming: false });
const sealed = (id: number, name: string, setId: number): Product => ({ id, slug: String(id), name, kind: "sealed", setId, number: null, rarity: null, attrs: {}, sealedType: "x", image: null, tcgUrl: "", printings: [] });
const card = (id: number, name: string, number: string, setId: number): Product => ({ ...sealed(id, name, setId), kind: "card", number, sealedType: null, rarity: "Rare" });

const sets = [set(1, "Welcome to Night City - Beta"), set(2, "Welcome to Night City - Retail"), set(3, "Set 1 Promos")];
const products = [
  sealed(10, "Welcome to Night City - Beta Booster Box", 1),
  sealed(11, "Welcome to Night City - Retail Booster Box", 2),
  sealed(12, "Welcome to Night City - Beta Booster Pack", 1),
  sealed(13, "Welcome to Night City - Retail Booster Pack", 2),
  card(20, "Adam Smasher - Ender of Legends", "012/140", 1),
  card(21, "Adam Smasher - Ender of Legends", "012/140", 2),
];
const idx = buildIndex(products, sets, "fraction", { setEditions: EDITIONS });

test("a title that names no edition is the default (Retail) one", () => {
  assert.equal(matchSealed("Cyberpunk TCG: Welcome to Night City Booster Box", idx)?.product.id, 11);
  assert.equal(matchSealed("Cyberpunk TCG Welcome to Night City Retail Booster Box", idx)?.product.id, 11);
  assert.equal(matchSealed("Cyberpunk TCG - Welcome to Night City Booster Pack", idx)?.product.id, 13);
});

test("Beta, or a 36-pack / Kickstarter box, is only ever the Beta product", () => {
  assert.equal(matchSealed("Cyberpunk TCG Welcome to Night City Beta Booster Box", idx)?.product.id, 10);
  assert.equal(matchSealed("Cyberpunk TCG: Welcome to Night City Booster Box (36 Packs)", idx)?.product.id, 10);
  assert.equal(matchSealed("Cyberpunk TCG Kickstarter Booster Box - Welcome to Night City", idx)?.product.id, 10);
});

test("a title pointing at both editions matches neither", () => {
  assert.equal(titleEdition("Welcome to Night City Beta Booster Box (not retail)", EDITIONS), false);
  assert.equal(matchSealed("Welcome to Night City Beta + Retail Booster Box", idx), null);
});

test("cards follow their set's edition", () => {
  assert.equal(matchCard("Adam Smasher - Ender of Legends 012/140 Beta", idx)?.product.id, 20);
  assert.equal(matchCard("Adam Smasher - Ender of Legends 012/140", idx)?.product.id, 21);
});

test("games without editions are unchanged", () => {
  const plain = buildIndex(products, sets, "fraction");
  // Both editions' boxes fit an unmarked title, and a tie is no match.
  assert.equal(plain.editions, null);
  assert.equal(matchSealed("Welcome to Night City Booster Box", plain), null);
});

// "plain" numbers (Cyberpunk TCG): "001" in Retail, "B001" in Beta, "006" in
// Pre-Release Beta. Real store titles from the 2026-11-01 probe.
test("plain numbers with editions: real store singles", () => {
  const s2 = [set(1, "Welcome to Night City - Beta"), set(2, "Welcome to Night City - Retail"), set(4, "Pre-Release Beta")];
  const ps = [
    card(30, "Adam Smasher - Ender of Legends (Epic)", "B001", 1),
    card(31, "Adam Smasher - Ender of Legends (Epic)", "001", 2),
    { ...card(32, "Adam Smasher - Ender of Legends", "001", 4), rarity: "Epic" },
    card(33, "Detonate", "B031", 1),
    card(34, "Detonate", "031", 2),
    card(35, "Goro Takemura - Vengeful Bodyguard", "006", 4),
  ];
  const i = buildIndex(ps, s2, "plain", { setEditions: EDITIONS });
  assert.equal(matchCard("Adam Smasher - Ender of Legends Epic B001 (Welcome to Night City - Beta)  - Foil", i)?.product.id, 30);
  assert.equal(matchCard("Adam Smasher - Ender of Legends [PRR - 001 - Epic] - Pre-Release Beta", i)?.product.id, 32);
  // "B031" alone says Beta, even with no edition word.
  assert.equal(matchCard("Detonate [B031]", i)?.product.id, 33);
  assert.equal(matchCard("Detonate (031) - Welcome to Night City", i)?.product.id, 34);
  assert.equal(matchCard("Goro Takemura Vengeful Bodyguard 006 (Pre-Release Beta)  - Foil", i)?.product.id, 35);
  // Pack counts and years are not card numbers.
  assert.deepEqual(numbersInTitle("Booster Box (24 Packs) November 6, 2026 ST01", "plain"), []);
});

test("a single titled \"Card [Set]\" is never sealed, even when the set is a starter deck", () => {
  assert.equal(looksSealed("MT0D12 Flathead [The Heist - Beta Starter Deck]"), false);
  assert.equal(looksSealed("Starter Deck: The Heist - Beta [The Heist - Beta Starter Deck]"), true);
  assert.equal(looksSealed("Cyberpunk TCG: Starter Deck - Embracing Power [Beta]"), true);
  // Real punkouter.com title, 2026-11-01: the card number makes it a single.
  assert.equal(looksSealed("MT0D12 Flathead [B015 - Uncommon] - The Heist - Beta Starter Deck", "", "plain"), false);
  assert.equal(looksSealed("Cyberpunk TCG: Booster Display – Welcome to Night City (24 packs)", "", "plain"), true);
});
