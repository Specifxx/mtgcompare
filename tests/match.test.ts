import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  bestVariant,
  buildCardIndex,
  buildDonIndex,
  buildNameIndex,
  canonSet,
  cardNumbersIn,
  conditionRank,
  matchByName,
  matchCardBySku,
  matchCardTitle,
  matchDonTitle,
  matchSealedTitle,
  matchStoreProduct,
  foreignByTags,
  plausibleSinglePrice,
  setCodesIn,
  skuCardNumber,
  type PrintingRef,
  type SealedRef,
  type StoreMatchIndexes,
} from "../src/lib/match";

// A slice of the real catalogue: OP01-120 Shanks's three printings, a release-
// event reprint, a Premium Booster alt art and promo prints that share a number.
const idx = buildCardIndex([
  { id: 1, name: "Shanks", number: "OP01-120", variant: null, setCode: "OP01", setName: "Romance Dawn" },
  { id: 2, name: "Shanks", number: "OP01-120", variant: "Parallel", setCode: "OP01", setName: "Romance Dawn" },
  { id: 3, name: "Shanks", number: "OP01-120", variant: "Parallel · Manga · Alternate Art", setCode: "OP01", setName: "Romance Dawn" },
  { id: 4, name: "Shanks", number: "OP01-120", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 10, name: "Curiel", number: "OP16-004", variant: null, setCode: "OP16", setName: "The Time of Battle" },
  { id: 11, name: "Curiel", number: "OP16-004", variant: "Release Event", setCode: "OP16 RE", setName: "The Time of Battle Release Event Cards" },
  { id: 20, name: "Franky", number: "OP01-021", variant: null, setCode: "OP01", setName: "Romance Dawn" },
  { id: 21, name: "Franky", number: "OP01-021", variant: "Tournament Pack Vol. 2", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
  { id: 22, name: "Franky", number: "OP01-021", variant: "Tournament Pack Vol. 2 · Winner", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
  { id: 30, name: "Portgas.D.Ace", number: "OP13-119", variant: "Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
  { id: 31, name: "Portgas.D.Ace", number: "OP13-119", variant: "Red Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
  { id: 40, name: "Luffy", number: "OP01-024", variant: null, setCode: "OP01", setName: "Romance Dawn" },
  { id: 41, name: "Luffy", number: "OP01-024", variant: null, setCode: "OP-DD", setName: "One Piece Demo Deck Cards" },
  { id: 50, name: "Gecko Moria", number: "ST03-004", variant: "SP", setCode: "OP08", setName: "Two Legends" },
]);
const id = (t: string) => {
  const r = matchCardTitle(t, idx);
  return "id" in r ? r.id : r.miss;
};

test("card numbers are normalised", () => {
  assert.deepEqual(cardNumbersIn("Shanks [OP-01-120] SEC"), ["OP01-120"]);
  assert.deepEqual(cardNumbersIn("Uta (p-011)"), ["P-011"]);
  assert.deepEqual(cardNumbersIn("One Piece OP-13 Booster Box"), []);
});

test("the printing words decide which Shanks", () => {
  assert.equal(id("Shanks - OP01-120 - SEC"), 1);
  assert.equal(id("Shanks (Parallel) OP01-120"), 2);
  assert.equal(id("[ALTERNATE ART] Shanks (OP01-120) SEC"), 2);
  assert.equal(id("Shanks (Parallel) (Manga) (Alternate Art) OP01-120"), 3);
  assert.equal(id("Shanks OP01-120 Alternate Art PRB-01 The Best"), 4);
});

test("event prints need their stamp in the title", () => {
  assert.equal(id("Curiel OP16-004 Common"), 10);
  assert.equal(id("Curiel (Release Event) OP16-004"), 11);
});

test("the most specific promo wins when it is unique", () => {
  assert.equal(id("Franky OP01-021"), 20);
  assert.equal(id("Franky - OP01-021 - Tournament Pack Vol. 2"), 21);
  assert.equal(id("Franky - OP01-021 - Tournament Pack Vol. 2 [Winner]"), 22);
});

test("leftover words in a printing token are required", () => {
  assert.equal(id("Portgas.D.Ace OP13-119 Super Alternate Art"), 30);
  assert.equal(id("Portgas.D.Ace OP13-119 Red Super Alternate Art"), 31);
});

test("with no other signal, the number's home set wins", () => {
  assert.equal(id("Luffy OP01-024 Super Rare"), 40);
});

test("Special Card means SP", () => {
  assert.equal(id("One Piece - Two Legends - Gecko Moria (Special Card) - ST03-004"), 50);
});

test("a title naming a stamp, promo or reprint the printing lacks is skipped", () => {
  const ix = buildCardIndex([
    { id: 60, name: "Koala", number: "OP13-081", variant: null, setCode: "OP13", setName: "Carrying On His Will" },
    { id: 61, name: "Silvers Rayleigh", number: "OP14-108", variant: null, setCode: "OP14", setName: "The Azure Sea's Seven" },
    { id: 62, name: "Silvers Rayleigh", number: "OP14-108", variant: "Dash Pack", setCode: "OP14", setName: "The Azure Sea's Seven" },
    { id: 63, name: "Boa Marigold", number: "OP07-052", variant: null, setCode: "OP07", setName: "500 Years in the Future" },
    { id: 64, name: "Baby 5", number: "OP04-032", variant: null, setCode: "OP04", setName: "Kingdoms of Intrigue" },
    { id: 65, name: "Brannew", number: "OP03-089", variant: null, setCode: "OP03", setName: "Pillars of Strength" },
    { id: 66, name: "Vinsmoke Judge", number: "OP11-044", variant: null, setCode: "OP11", setName: "A Fist of Divine Speed" },
    { id: 67, name: "Alvida", number: "OP15-003", variant: null, setCode: "OP15", setName: "Adventure on Kami's Island" },
    { id: 68, name: "Concelot", number: "OP08-024", variant: null, setCode: "OP08", setName: "Two Legends" },
    { id: 69, name: "Concelot", number: "OP08-024", variant: "Pre-Release", setCode: "OP08 PRE", setName: "Two Legends Pre-Release Cards" },
    { id: 70, name: "Adio", number: "P-078", variant: null, setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
    { id: 74, name: "Uta", number: "ST08-002", variant: null, setCode: "ST-08", setName: "Starter Deck 8: Monkey.D.Luffy" },
    { id: 71, name: "Sabo", number: "ST13-007", variant: null, setCode: "ST-13", setName: "Ultra Deck: The Three Brothers" },
    { id: 72, name: "Sabo", number: "ST13-007", variant: "Reprint", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
    { id: 73, name: "Sabo", number: "ST13-007", variant: "Pirate Foil", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  ]);
  const m = (t: string) => {
    const r = matchCardTitle(t, ix);
    return "id" in r ? r.id : r.miss;
  };
  // Real titles whose printing TCGplayer doesn't list: once priced as the plain card.
  assert.equal(m("Koala (3rd Anniversary Stamp) - C - OP13-081"), "no-printing");
  assert.equal(m("Silvers Rayleigh (OP14-108) (V.2) - Unnumbered Promos (Rare) [UP-OP14-108]"), "no-printing");
  assert.equal(m("Boa Marigold [OP07 PRE - OP07-052 - Common] - 500 Years in the Future Pre-Release Cards"), "no-printing");
  assert.equal(m("Baby 5 (OP04-032) (V.2) PRB01 Uncommon Near Mint Englisch"), "no-printing");
  assert.equal(m("Brannew (OP03-089) (V.2) - The Best (Rare) [OP03-089]"), "no-printing");
  // Still matched: the word is the card's own name, its set, its tag or a P- promo.
  assert.equal(m("Vinsmoke Judge [OP11 - OP11-044]"), 66);
  assert.equal(m("Alvida (OP15-003) (V.1) - Adventure on Kami’s Island (Rare) [OP15-003]"), 67);
  assert.equal(m("Concelot [Two Legends Pre-Release Cards] OP08-024"), 69);
  assert.equal(m("Concelot OP08-024"), 68);
  assert.equal(m("Adio (P-078) (Promo)"), 70);
  assert.equal(m("Uta - ST08-002 - Starter Deck 8: Monkey.D.Luffy Promo"), 74);
  assert.equal(m("Uta (ST08-002) - Unnumbered Promos"), "no-printing");
  // A Premium Booster title with no printing words is the booster's reprint.
  assert.equal(m("One Piece - Premium Booster 02 - Sabo (Common) - ST13-007"), 72);
  assert.equal(m("Sabo (ST13-007) [PRB02 Foil]"), 72);
  assert.equal(m("Sabo - ST13-007 (Pirate Foil) [Premium Booster -The Best- Vol. 2]"), 73);
  assert.equal(m("Sabo ST13-007"), 71);
});

test("the set a title names decides, and a stray plain print is not a guess", () => {
  const ix = buildCardIndex([
    { id: 80, name: "Roronoa Zoro", number: "OP06-118", variant: null, setCode: "OP06", setName: "Wings of the Captain" },
    { id: 81, name: "Roronoa Zoro", number: "OP06-118", variant: "Alternate Art", setCode: "OP06", setName: "Wings of the Captain" },
    { id: 82, name: "Roronoa Zoro", number: "OP06-118", variant: "Alternate Art · Manga", setCode: "OP06", setName: "Wings of the Captain" },
    { id: 83, name: "Roronoa Zoro", number: "OP06-118", variant: "Manga", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
    { id: 84, name: "Roronoa Zoro", number: "OP06-118", variant: "Reprint", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
    { id: 85, name: "Van Augur", number: "OP09-083", variant: null, setCode: "OP09", setName: "Emperors in the New World" },
    { id: 86, name: "Van Augur", number: "OP09-083", variant: "Reprint", setCode: "ST-27", setName: "Starter Deck 27: BLACK Marshall.D.Teach" },
    { id: 87, name: "Charlotte Praline", number: "OP03-111", variant: null, setCode: "OP03", setName: "Pillars of Strength" },
    { id: 88, name: "Charlotte Praline", number: "OP03-111", variant: "Pre-Release", setCode: "OP03 PRE", setName: "Pillars of Strength Pre-Release Cards" },
    { id: 89, name: "Braham", number: "OP15-110", variant: null, setCode: "OP15", setName: "Adventure on Kami's Island" },
    { id: 90, name: "Monkey.D.Luffy", number: "P-001", variant: null, setCode: "OP-DD", setName: "One Piece Demo Deck Cards" },
    { id: 91, name: "Monkey.D.Luffy", number: "P-001", variant: "Promotion Pack 2022", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
    { id: 92, name: "Monkey.D.Luffy", number: "P-001", variant: "Premium Card Collection -BANDAI CARD GAMES Fest. 23-24 Edition-", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
    { id: 93, name: "Sabo", number: "OP13-120", variant: null, setCode: "OP13", setName: "Carrying On His Will" },
    { id: 94, name: "Sabo", number: "OP13-120", variant: "Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
    { id: 95, name: "Sabo", number: "OP13-120", variant: "Red Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
    { id: 96, name: "Monkey.D.Luffy", number: "OP17-079", variant: "Alternate Art", setCode: "OP17", setName: "The World's Strongest Warriors" },
    { id: 97, name: "Monkey.D.Luffy", number: "OP17-079", variant: "Super Leader Alternate Art", setCode: "OP17", setName: "The World's Strongest Warriors" },
  ]);
  const m = (t: string) => {
    const r = matchCardTitle(t, ix);
    return "id" in r ? r.id : r.miss;
  };
  // A store's "Manga" is the original set's Manga unless the title says The Best.
  assert.equal(m("Roronoa Zoro (OP06-118) - Wings of the Captain (Manga Rare) [OP06-118]"), 82);
  assert.equal(m("Roronoa Zoro OP06-118 Manga Alt Art"), 82);
  assert.equal(m("Roronoa Zoro - OP06-118 - Secret Rare (Manga) - The Best"), 83);
  // A set code for another printing of the number: that printing or nothing.
  assert.equal(m("Van Augur (OP09-083) - Starter Deck: Black Marshall.D.Teach (Rare) [ST-27-OP09-083]"), 86);
  assert.equal(m("Van Augur (OP09-083) - Emperors in the New World (Rare)"), 85);
  // Event stamps written as set-code suffixes.
  assert.equal(m("Charlotte Praline [OP03 PRE - OP03-111]"), 88);
  assert.equal(m("Braham [OP15 RE - OP15-110]"), "no-printing");
  // Every promo P-001 is tagged; the untagged title is not the Demo Deck card.
  assert.equal(m("Monkey.D.Luffy (P-001)"), "ambiguous");
  assert.equal(m("Monkey.D.Luffy (Promotion Pack 2022) (P-001)"), 91);
  assert.equal(m("Monkey.D.Luffy (P-001) One Piece Demo Deck Cards"), 90);
  // "Red" and "Leader" count only as part of the printing's phrase.
  assert.equal(m("Sabo - OP13-120 - Red Leader (Super Alternate Art)"), 94);
  assert.equal(m("Sabo OP13-120 Red Super Alternate Art"), 95);
  assert.equal(m("Monkey.D.Luffy - OP17-079 - Leader (Alternate Art)"), 96);
  assert.equal(m("Monkey.D.Luffy (Super Leader Alternate Art) (OP17-079)"), 97);
  // Other graders' slabs.
  assert.equal(m("2024 Monkey.D.Luffy #P-001 Card Games Fest TAG 9"), "not-single");
});

test("never matched: foreign, graded, playsets, wrong names, unknown printings", () => {
  assert.equal(id("Shanks OP01-120 (Japanese)"), "foreign");
  assert.equal(id("Shanks (OP01-120) (V.1) - The Best (Non-English) (Secret Rare) [OP01-120]"), "foreign");
  assert.equal(id("PSA 10 Shanks OP01-120 Parallel"), "not-single");
  assert.equal(id("Playset (4) 4x Shanks OP01-120"), "not-single");
  assert.equal(id("Kaido OP01-120"), "name");
  assert.equal(id("Shanks OP01-120 Jolly Roger Foil"), "no-printing");
  assert.equal(id("Shanks OP01-120 / Shanks OP01-121"), "many-numbers");
});

test("the TCGplayer-name path", () => {
  const n = buildNameIndex([
    { id: 7, tcgName: "Arlong (Alternate Art)", setNames: ["A Fist of Divine Speed", "A Fist of Divine Speed"] },
    { id: 8, tcgName: "Monet", setNames: ["Legacy of the Master Release Event Cards", "Legacy of the Master Release Event Cards"] },
    { id: 9, tcgName: "DON!! Card (Alternate Art)", setNames: ["Kingdoms of Intrigue", "Kingdoms of Intrigue"] },
    { id: 10, tcgName: "DON!! Card (Alternate Art)", setNames: ["Kingdoms of Intrigue", "Kingdoms of Intrigue"] },
  ]);
  assert.equal(matchByName("Arlong (Alternate Art) [A Fist of Divine Speed]", n), 7);
  assert.equal(matchByName("Monet - Legacy of the Master Release Event Cards Foil", n), 8);
  assert.equal(matchByName("DON!! Card (Alternate Art) [Kingdoms of Intrigue]", n), null);
  assert.equal(matchByName("Arlong (Alternate Art) [A Fist of Divine Speed] (Japanese)", n), null);
});

const sealed: SealedRef[] = [
  { id: 100, name: "Carrying On His Will Booster Box", kind: "Booster Box", setCode: "OP13", setName: "Carrying On His Will" },
  { id: 101, name: "Carrying On His Will Booster Pack", kind: "Booster Pack", setCode: "OP13", setName: "Carrying On His Will" },
  { id: 102, name: "Romance Dawn - Booster Box (Wave 1 - Blue)", kind: "Booster Box", setCode: "OP01", setName: "Romance Dawn" },
  { id: 103, name: "Romance Dawn - Booster Box (Wave 2 - White)", kind: "Booster Box", setCode: "OP01", setName: "Romance Dawn" },
  { id: 104, name: "Starter Deck 36: YELLOW Eustass\"Captain\"Kid", kind: "Starter Deck", setCode: "ST-36", setName: "Starter Deck 36: YELLOW Eustass\"Captain\"Kid" },
  { id: 105, name: "Carrying On His Will Booster Box Case", kind: "Booster Case", setCode: "OP13", setName: "Carrying On His Will" },
];
const sid = (t: string) => {
  const r = matchSealedTitle(t, sealed);
  return "id" in r ? r.id : r.miss;
};

test("sealed titles", () => {
  assert.deepEqual(setCodesIn("[OP-13] Box"), ["OP13"]);
  assert.equal(sid("One Piece Card Game: Booster Box – Carrying On His Will [OP-13]"), 100);
  assert.equal(sid("One Piece OP13 Display (24 Packs) EN"), 100);
  assert.equal(sid("One Piece Card Game [OP-13] Carrying On His Will Booster Pack"), 101);
  assert.equal(sid("One Piece Romance Dawn Booster Box"), "ambiguous");
  assert.equal(sid("One Piece Romance Dawn Booster Box Wave 2"), 103);
  assert.equal(sid("One Piece Starter Deck ST36 - Eustass Captain Kid"), 104);
  assert.equal(sid("One Piece OP-13 Booster Box (Japanese)"), "foreign");
  assert.equal(sid("Koala (Alternate Art) [Premium Booster -The Best-]"), "no-kind");
  assert.equal(sid("One Piece OP-13 Booster Box - Empty"), "not-sealed");
  // Cases: only when the title says "box case" or similar; accessories never.
  assert.equal(sid("One Piece Card Game OP-13 Booster Box Case (12 Boxes)"), 105);
  assert.equal(sid("One Piece OP13 Booster Box (Case Fresh)"), 100);
  assert.equal(sid("Alaris Design: Premium Acrylic Case for One Piece Card Game Booster Boxes (OP-13 onwards)"), "not-sealed");
  assert.equal(sid("One Piece OP-13 Booster Box with Magnetic Case"), "not-sealed");
  assert.equal(sid("One Piece OP-13 Booster Box Protector Case"), "not-sealed");
  assert.equal(sid("Super Pre-Release Starter Deck 36: Yellow Eustass Captain Kid ST-36"), "no-product");
  // A Dash Pack single is not a booster pack.
  assert.equal(sid("Nami (Dash Pack) [Adventure on Kami's Island]"), "no-kind");
});

test("conditions and variants", () => {
  assert.equal(conditionRank("Near Mint"), 0);
  assert.equal(conditionRank("Lightly Played"), 1);
  assert.equal(conditionRank("Moderately Played"), 2);
  assert.equal(conditionRank("Heavily Played"), 3);
  assert.equal(conditionRank("Damaged"), 4);
  assert.deepEqual(
    bestVariant([
      { title: "Lightly Played", price: "8.00", available: true },
      { title: "Near Mint", price: "10.00", available: true },
      { title: "Near Mint Japanese", price: "2.00", available: true },
      { title: "Near Mint", price: "9.00", available: false },
    ]),
    { priceCents: 1000, condition: "NM" },
  );
  assert.equal(bestVariant([{ title: "Near Mint", price: "9.00", available: false }]), null);
});

test("prices far from market are treated as mismatches", () => {
  assert.equal(plausibleSinglePrice(1000, 10000), false);
  assert.equal(plausibleSinglePrice(9000, 10000), true);
  assert.equal(plausibleSinglePrice(50000, 1000), false);
  assert.equal(plausibleSinglePrice(25, 10), true);
});

// ── A real catalogue slice (TCGplayer, 2026-10-03) and real store titles ─────
// Every printing of each number below, exactly as the import indexes it, so
// "exactly one printing fits" is tested against the real competition.
const REAL: PrintingRef[] = [
  { id: 643731, name: "Shanks", number: "OP12-007", variant: null, setCode: "OP12", setName: "Legacy of the Master", setTcgName: "Legacy of the Master" },
  { id: 649293, name: "Shanks", number: "OP12-007", variant: "Release Event", setCode: "OP12 RE", setName: "Legacy of the Master Release Event Cards", setTcgName: "Legacy of the Master Release Event Cards" },
  { id: 707116, name: "Charlotte Chiffon", number: "OP17-105", variant: null, setCode: "OP17", setName: "The World's Strongest Warriors", setTcgName: "The World's Strongest Warriors" },
  { id: 712733, name: "Charlotte Chiffon", number: "OP17-105", variant: "Release Event", setCode: "OP17 RE", setName: "The World's Strongest Warriors Release Event Cards", setTcgName: "The World's Strongest Warriors Release Event Cards" },
  { id: 685382, name: "Rebecca", number: "OP15-039", variant: null, setCode: "OP15-EB04", setName: "Adventure on Kami's Island", setTcgName: "Adventure on Kami's Island" },
  { id: 685383, name: "Rebecca", number: "OP15-039", variant: "Alternate Art", setCode: "OP15-EB04", setName: "Adventure on Kami's Island", setTcgName: "Adventure on Kami's Island" },
  { id: 719666, name: "Rebecca", number: "OP15-039", variant: "Flame-Flame Fruit Coliseum", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 500116, name: "Sogeking", number: "OP03-122", variant: "Alternate Art", setCode: "OP03", setName: "Pillars of Strength", setTcgName: "Pillars of Strength" },
  { id: 500118, name: "Sogeking", number: "OP03-122", variant: "Alternate Art · Manga", setCode: "OP03", setName: "Pillars of Strength", setTcgName: "Pillars of Strength" },
  { id: 501997, name: "Sogeking", number: "OP03-122", variant: null, setCode: "OP03", setName: "Pillars of Strength", setTcgName: "Pillars of Strength" },
  { id: 587710, name: "Sogeking", number: "OP03-122", variant: "Manga", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 615564, name: "Monkey.D.Luffy", number: "ST21-001", variant: null, setCode: "ST-21", setName: "Starter Deck 21: EX Gear 5", setTcgName: "ST-21: Starter Deck 21 EX Gear 5" },
  { id: 615565, name: "Monkey.D.Luffy", number: "ST21-001", variant: "Parallel", setCode: "ST-21", setName: "Starter Deck 21: EX Gear 5", setTcgName: "ST-21: Starter Deck 21 EX Gear 5" },
  { id: 656655, name: "Monkey.D.Luffy", number: "ST21-001", variant: "Luffy Deck", setCode: "LT-01", setName: "Learn Together Deck Set", setTcgName: "Learn Together Deck Set" },
  { id: 706313, name: "Monkey.D.Luffy", number: "ST21-001", variant: null, setCode: "ST-31", setName: "Starter Deck 31: RED Monkey.D.Luffy", setTcgName: "ST-31: Starter Deck 31 RED Monkey.D.Luffy" },
  { id: 288298, name: "Blast Breath", number: "ST04-016", variant: null, setCode: "ST-04", setName: "Starter Deck 4: Animal Kingdom Pirates", setTcgName: "ST-04: Starter Deck 4 Animal Kingdom Pirates" },
  { id: 426897, name: "Blast Breath", number: "ST04-016", variant: "Super Pre-Release", setCode: "ST-04 PRE", setName: "Starter Deck 4: Animal Kingdom Pirates (Super Pre-Release Edition)", setTcgName: "ST-04: Starter Deck 4 Animal Kingdom Pirates (Super Pre-Release Edition)" },
  { id: 546671, name: "Blast Breath", number: "ST04-016", variant: "Premium Card Collection -Best Selection Vol. 1-", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 593589, name: "Blast Breath", number: "ST04-016", variant: "Jolly Roger Foil", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593902, name: "Blast Breath", number: "ST04-016", variant: "Textured Foil", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 599780, name: "Blast Breath", number: "ST04-016", variant: null, setCode: "OP-RP", setName: "Revision Pack Cards", setTcgName: "Revision Pack Cards" },
  { id: 706355, name: "Bartholomew Kuma", number: "ST35-005", variant: null, setCode: "ST-35", setName: "Starter Deck 35: RED/BLACK Sabo", setTcgName: "ST-35: Starter Deck 35 RED/BLACK Sabo" },
  { id: 685362, name: "Brook", number: "OP15-022", variant: null, setCode: "OP15-EB04", setName: "Adventure on Kami's Island", setTcgName: "Adventure on Kami's Island" },
  { id: 685363, name: "Brook", number: "OP15-022", variant: "Alternate Art", setCode: "OP15-EB04", setName: "Adventure on Kami's Island", setTcgName: "Adventure on Kami's Island" },
  { id: 596924, name: "Shanks", number: "OP09-004", variant: null, setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 596925, name: "Shanks", number: "OP09-004", variant: "Manga", setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 596926, name: "Shanks", number: "OP09-004", variant: "Alternate Art", setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 596927, name: "Shanks", number: "OP09-004", variant: "Wanted Poster", setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 635477, name: "Shanks", number: "OP09-004", variant: "English Version 2nd Anniversary Set", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 646743, name: "Shanks", number: "OP09-004", variant: "Championship 25-26 Offline Regionals Season 2", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 656025, name: "Shanks", number: "OP09-004", variant: "Reprint", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 657442, name: "Shanks", number: "OP09-004", variant: "SP · Gold", setCode: "OP13", setName: "Carrying On His Will", setTcgName: "Carrying On His Will" },
  { id: 657443, name: "Shanks", number: "OP09-004", variant: "SP · Silver", setCode: "OP13", setName: "Carrying On His Will", setTcgName: "Carrying On His Will" },
  { id: 288235, name: "Tony Tony.Chopper", number: "ST01-006", variant: null, setCode: "ST-01", setName: "Starter Deck 1: Straw Hat Crew", setTcgName: "ST-01: Starter Deck 1 Straw Hat Crew" },
  { id: 416671, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Super Pre-Release", setCode: "ST-01 PRE", setName: "Starter Deck 1: Straw Hat Crew (Super Pre-Release Edition)", setTcgName: "ST-01: Starter Deck 1 Straw Hat Crew (Super Pre-Release Edition)" },
  { id: 455815, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Treasure Cup", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 485267, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Alternate Art", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 501749, name: "Tony Tony.Chopper", number: "ST01-006", variant: "3-on-3 Cup · Winner", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 501750, name: "Tony Tony.Chopper", number: "ST01-006", variant: "3-on-3 Cup · Participant", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 504476, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Premium Card Collection -ONE PIECE FILM RED Edition-", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 523819, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Gift Collection 2023", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 557289, name: "Tony Tony.Chopper", number: "ST01-006", variant: "English Version 1st Anniversary Set", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 586180, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Jolly Roger Foil", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593574, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Full Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593575, name: "Tony Tony.Chopper", number: "ST01-006", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 602800, name: "Tony Tony.Chopper", number: "ST01-006", variant: null, setCode: "OP-DD", setName: "One Piece Demo Deck Cards", setTcgName: "One Piece Demo Deck Cards" },
  { id: 528666, name: "Satori", number: "OP05-105", variant: null, setCode: "OP05", setName: "Awakening of the New Era", setTcgName: "Awakening of the New Era" },
  { id: 586804, name: "Satori", number: "OP05-105", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 586805, name: "Satori", number: "OP05-105", variant: "Jolly Roger Foil", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593476, name: "Satori", number: "OP05-105", variant: "Full Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 594332, name: "Satori", number: "OP05-105", variant: "Reprint", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 599736, name: "Satori", number: "OP05-105", variant: "Welcome Pack Vol. 1", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 545825, name: "Crocodile", number: "OP07-040", variant: null, setCode: "OP07", setName: "500 Years in the Future", setTcgName: "500 Years in the Future" },
  { id: 552110, name: "Crocodile", number: "OP07-040", variant: "Pre-Release", setCode: "OP07 PRE", setName: "500 Years in the Future Pre-Release Cards", setTcgName: "500 Years in the Future Pre-Release Cards" },
  { id: 588175, name: "Crocodile", number: "OP07-040", variant: "ST15 - ST20 Release Event Winner Pack", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 588176, name: "Crocodile", number: "OP07-040", variant: "ST15 - ST20 Release Event Pack", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 641222, name: "Crocodile", number: "OP07-040", variant: "Judge Pack Vol. 6", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 648089, name: "Crocodile", number: "OP07-040", variant: "Seven Warlords of the Sea Binder Set", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 656197, name: "Crocodile", number: "OP07-040", variant: "Reprint", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 656198, name: "Crocodile", number: "OP07-040", variant: "Pirate Foil", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 656200, name: "Crocodile", number: "OP07-040", variant: "Alternate Art", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 454556, name: "Okiku", number: "OP01-035", variant: null, setCode: "OP01", setName: "Romance Dawn", setTcgName: "Romance Dawn" },
  { id: 499432, name: "Okiku", number: "OP01-035", variant: "Judge", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 503243, name: "Okiku", number: "OP01-035", variant: "Tournament Pack Vol. 4", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 503247, name: "Okiku", number: "OP01-035", variant: "Winner Pack Vol. 4", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 525308, name: "Okiku", number: "OP01-035", variant: "CS 2023 Celebration Pack", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 545922, name: "Okiku", number: "OP01-035", variant: "SP", setCode: "OP07", setName: "500 Years in the Future", setTcgName: "500 Years in the Future" },
  { id: 564253, name: "Okiku", number: "OP01-035", variant: "Premium Card Collection -BANDAI CARD GAMES Fest. 23-24 Edition-", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 653430, name: "Roronoa Zoro", number: "PRB02-006", variant: null, setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 653431, name: "Roronoa Zoro", number: "PRB02-006", variant: "Alternate Art", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2", setTcgName: "Premium Booster -The Best- Vol. 2" },
  { id: 670642, name: "Roronoa Zoro", number: "PRB02-006", variant: "SP", setCode: "OP14", setName: "The Azure Sea's Seven", setTcgName: "The Azure Sea's Seven" },
  { id: 693119, name: "Roronoa Zoro", number: "PRB02-006", variant: "Welcome Pack 2026 Vol.1", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 707252, name: "Roronoa Zoro", number: "PRB02-006", variant: "Round 1 Promo", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 482423, name: "Edward.Newgate", number: "OP02-004", variant: null, setCode: "OP02", setName: "Paramount War", setTcgName: "Paramount War" },
  { id: 485861, name: "Edward.Newgate", number: "OP02-004", variant: "Alternate Art", setCode: "OP02", setName: "Paramount War", setTcgName: "Paramount War" },
  { id: 514045, name: "Edward.Newgate", number: "OP02-004", variant: "Championship 2023", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 516553, name: "Edward.Newgate", number: "OP02-004", variant: "SP", setCode: "OP04", setName: "Kingdoms of Intrigue", setTcgName: "Kingdoms of Intrigue" },
  { id: 586182, name: "Edward.Newgate", number: "OP02-004", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 594317, name: "Edward.Newgate", number: "OP02-004", variant: "Reprint", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 596970, name: "Buggy", number: "OP09-042", variant: null, setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 596971, name: "Buggy", number: "OP09-042", variant: "Parallel", setCode: "OP09", setName: "Emperors in the New World", setTcgName: "Emperors in the New World" },
  { id: 633944, name: "Buggy", number: "OP09-042", variant: null, setCode: "ST-25", setName: "Starter Deck 25: BLUE Buggy", setTcgName: "ST-25: Starter Deck 25 BLUE Buggy" },
  { id: 635470, name: "Buggy", number: "OP09-042", variant: "English Version 2nd Anniversary Set", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 615590, name: "Monkey.D.Luffy", number: "ST21-014", variant: null, setCode: "ST-21", setName: "Starter Deck 21: EX Gear 5", setTcgName: "ST-21: Starter Deck 21 EX Gear 5" },
  { id: 615591, name: "Monkey.D.Luffy", number: "ST21-014", variant: "Parallel", setCode: "ST-21", setName: "Starter Deck 21: EX Gear 5", setTcgName: "ST-21: Starter Deck 21 EX Gear 5" },
  { id: 656673, name: "Monkey.D.Luffy", number: "ST21-014", variant: "Luffy Deck", setCode: "LT-01", setName: "Learn Together Deck Set", setTcgName: "Learn Together Deck Set" },
  { id: 661704, name: "Monkey.D.Luffy", number: "ST21-014", variant: "3rd Anniversary Treasure Campaign Pack", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 541637, name: "Kumacy", number: "OP06-085", variant: null, setCode: "OP06", setName: "Wings of the Captain", setTcgName: "Wings of the Captain" },
  { id: 541744, name: "Kumacy", number: "OP06-085", variant: "Pre-Release", setCode: "OP06 PRE", setName: "Wings of the Captain Pre-Release Cards", setTcgName: "Wings of the Captain Pre-Release Cards" },
  { id: 708072, name: "Charlotte Linlin", number: "OP17-112", variant: "Manga", setCode: "OP17", setName: "The World's Strongest Warriors", setTcgName: "The World's Strongest Warriors" },
  { id: 711324, name: "Charlotte Linlin", number: "OP17-112", variant: "Alternate Art", setCode: "OP17", setName: "The World's Strongest Warriors", setTcgName: "The World's Strongest Warriors" },
  { id: 711325, name: "Charlotte Linlin", number: "OP17-112", variant: null, setCode: "OP17", setName: "The World's Strongest Warriors", setTcgName: "The World's Strongest Warriors" },
  { id: 558036, name: "Robson", number: "OP08-013", variant: null, setCode: "OP08", setName: "Two Legends", setTcgName: "Two Legends" },
  { id: 576455, name: "Robson", number: "OP08-013", variant: "Pre-Release", setCode: "OP08 PRE", setName: "Two Legends Pre-Release Cards", setTcgName: "Two Legends Pre-Release Cards" },
  { id: 454554, name: "Izo", number: "OP01-033", variant: null, setCode: "OP01", setName: "Romance Dawn", setTcgName: "Romance Dawn" },
  { id: 483155, name: "Izo", number: "OP01-033", variant: "Tournament Pack Vol. 2", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 483156, name: "Izo", number: "OP01-033", variant: "Tournament Pack Vol. 2 · Winner", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 525307, name: "Izo", number: "OP01-033", variant: "CS 2023 Celebration Pack", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 564252, name: "Izo", number: "OP01-033", variant: "Premium Card Collection -BANDAI CARD GAMES Fest. 23-24 Edition-", setCode: "OP-PR", setName: "One Piece Promotion Cards", setTcgName: "One Piece Promotion Cards" },
  { id: 586589, name: "Izo", number: "OP01-033", variant: "Jolly Roger Foil", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593284, name: "Izo", number: "OP01-033", variant: "Full Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
  { id: 593285, name: "Izo", number: "OP01-033", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", setTcgName: "Premium Booster -The Best-" },
];
const real = buildCardIndex(REAL);
const r = (t: string) => {
  const x = matchCardTitle(t, real);
  return "id" in x ? x.id : x.miss;
};
const bySku = (t: string, ...skus: string[]) => {
  const x = matchCardBySku(t, skus, real);
  return "id" in x ? x.id : x.miss;
};

test("SKU numbers: one number, never a foreign SKU", () => {
  assert.equal(skuCardNumber(["OP12-007-EN-NF-1", "OP12-007-EN-NF-2"]), "OP12-007");
  assert.equal(skuCardNumber(["op17-105-Normal-707116"]), "OP17-105");
  assert.equal(skuCardNumber(["OP15-EB04-OP15-039-AA-EN-FO-1"]), "OP15-039");
  assert.equal(skuCardNumber(["ST-21-ST21-001-EN-NF-1"]), "ST21-001");
  assert.equal(skuCardNumber(["OP12007-1234567"]), "OP12-007");
  assert.equal(skuCardNumber(["op12-66-Normal-643805"]), "OP12-066");
  assert.equal(skuCardNumber(["OP12-007-JP-NF-1"]), null);
  assert.equal(skuCardNumber(["OP12-007-EN-1", "OP12-008-EN-1"]), null);
  assert.equal(skuCardNumber(["8355828", ""]), null);
});

test("SKU numbers lend a number to a numberless title, strictly", () => {
  assert.equal(bySku("Shanks [Legacy of the Master]", "OP12-007-EN-NF-1"), 643731);
  assert.equal(bySku("Charlotte Chiffon", "op17-105-Normal-707116"), 707116);
  assert.equal(bySku("Rebecca (Alternate Art) [Adventure on Kami's Island]", "OP15-EB04-OP15-039-AA-EN-FO-1"), 685383);
  assert.equal(bySku("Sogeking (Alternate Art)", "SNG-OZC-OP03-122-SEC-NM-1"), 500116);
  // Not the Learn Together deck's ST21-001 (its "Luffy Deck" tag is in the title by accident).
  assert.equal(bySku("Monkey.D.Luffy [Starter Deck EX: Gear 5]", "ST-21-ST21-001-EN-NF-1"), 615564);
  // A set the catalogue doesn't know is a printing it doesn't list.
  assert.equal(bySku("Blast Breath [Best Selection Vol.1]", "OP-PR-ST04-016-EN-FO-1"), "unknown-set");
  assert.equal(bySku("Bartholomew Kuma [One Piece Film: Red]", "OP-PR-ST35-005-EN-FO-1"), "unknown-set");
  // A known set that isn't the matched printing's: the SKU's card, not this listing.
  assert.equal(bySku("Bartholomew Kuma [Starter Deck: Blue Buggy]", "ST35-005-EN-1"), "set-mismatch");
});

test("Alternative Art, Alt. Art and SP said as a set's special", () => {
  assert.equal(r("Brook (OP15-022) - Op15-022, Alternative Art"), 685363);
  assert.equal(r("Shanks (OP09-004) - Alternative Art"), 596926);
  assert.equal(r("Okiku (OP07 Special) - OP01-035 - Rare"), 545922);
  assert.equal(r("Roronoa Zoro (PRB02-006) - The Azure Sea's Seven (Special Rare) [OP14-PRB02-006]"), 670642);
  assert.equal(r("Edward.Newgate (OP04 Special) - OP02-004"), 516553);
  // OP13's Shanks SP is Gold or Silver; a title that says neither stays unmatched.
  assert.equal(typeof r("Shanks (OP09-004) - Carrying on his Will (Special Rare) [OP13-OP09-004]"), "string");
});

test("Full Art and Alternate Art share a key; the phrase decides between them", () => {
  assert.equal(r("Tony Tony.Chopper (ST01-006) (Full Art) (ST01-006) [Premium Booster -The Best-]"), 593574);
  assert.equal(r("Satori (Full Art) (OP05-105) [Premium Booster -The Best-]"), 593476);
  assert.equal(r("Satori (Alternate Art) (OP05-105) [Premium Booster -The Best-]"), 586804);
});

test("the Seven Warlords Binder Set is a promo, not a binder", () => {
  assert.equal(r("Crocodile (Seven Warlords of the Sea Binder Set) - OP07-040"), 648089);
  assert.equal(r("Crocodile OP07-040 in a 9-pocket binder"), "not-single");
});

test("a bracketed set in its older TCGplayer name still names the set", () => {
  assert.equal(r("Buggy (OP09-042) [Starter Deck: Blue Buggy]"), 633944);
  assert.equal(r("Monkey.D.Luffy (014) (ST21-014) [Starter Deck EX: Gear 5] Foil"), 615590);
});

test("numbers with a rarity suffix or written as the set's short number", () => {
  assert.deepEqual(cardNumbersIn("Kumacy - OP06-085UC - Wings of the Captain"), ["OP06-085"]);
  assert.equal(r("Kumacy - OP06-085UC - Wings of the Captain"), 541637);
  assert.equal(r("Charlotte Linlin (112) (Alternate Art) - The World's Strongest Warriors (OP17)"), 711324);
  assert.deepEqual(setCodesIn("Sai [OP15 Release Event]"), ["OP15 RE"]);
  assert.deepEqual(setCodesIn("OP-05 Pre-Release"), ["OP05 PRE"]);
  assert.deepEqual(setCodesIn("OP09 Anniversary"), ["OP09 ANN"]);
});

test("store words for printings TCGplayer doesn't list are never the plain card", () => {
  assert.equal(r("Robson (OP08-013) OP08P Uncommon Near Mint Englisch"), "no-printing");
  assert.equal(r("Izo (OP01-033) (Extended Art)"), "no-printing");
  assert.equal(r("Izo OP01-033 - OP-13 Carrying On His Will Box Topper"), "no-printing");
  assert.equal(r("Blast Breath (-Best Selection Vol. 1-) - ST04-016 - Common"), "no-printing");
});

test("canonical set names on the name path", () => {
  const n = buildNameIndex([
    { id: 288272, tcgName: "Dracule Mihawk", setNames: ["Starter Deck 3: The Seven Warlords of The Sea", "ST-03: Starter Deck 3 The Seven Warlords of The Sea"] },
    { id: 422377, tcgName: "Dracule Mihawk", setNames: ["Starter Deck 3: The Seven Warlords of The Sea (Super Pre-Release Edition)", "ST-03: Starter Deck 3 The Seven Warlords of The Sea (Super Pre-Release Edition)"] },
    { id: 454527, tcgName: "Sai", setNames: ["Romance Dawn", "Romance Dawn"] },
    { id: 454598, tcgName: "Dracule Mihawk", setNames: ["Romance Dawn", "Romance Dawn"] },
    { id: 454664, tcgName: "Shanks", setNames: ["Romance Dawn", "Romance Dawn"] },
    { id: 477316, tcgName: "Shanks", setNames: ["Starter Deck 5: Film Edition", "ST-05: Starter Deck 5 Film Edition"] },
    { id: 486394, tcgName: "Dracule Mihawk", setNames: ["Paramount War", "Paramount War"] },
    { id: 486644, tcgName: "Dracule Mihawk", setNames: ["Paramount War Pre-Release Cards", "Paramount War Pre-Release Cards"] },
    { id: 503224, tcgName: "Shanks", setNames: ["Starter Deck 8: Monkey.D.Luffy", "ST-08: Starter Deck 8 Monkey.D.Luffy"] },
    { id: 539282, tcgName: "Shanks", setNames: ["Wings of the Captain", "Wings of the Captain"] },
    { id: 541639, tcgName: "Sai", setNames: ["Wings of the Captain", "Wings of the Captain"] },
    { id: 541745, tcgName: "Sai", setNames: ["Wings of the Captain Pre-Release Cards", "Wings of the Captain Pre-Release Cards"] },
    { id: 542109, tcgName: "Dracule Mihawk", setNames: ["Starter Deck 12: Zoro and Sanji", "ST-12: Starter Deck 12 Zoro and Sanji"] },
    { id: 543611, tcgName: "Shanks", setNames: ["Ultra Deck: The Three Brothers", "ST-13: Ultra Deck The Three Brothers"] },
    { id: 545829, tcgName: "Dracule Mihawk", setNames: ["500 Years in the Future", "500 Years in the Future"] },
    { id: 552071, tcgName: "Dracule Mihawk", setNames: ["500 Years in the Future Pre-Release Cards", "500 Years in the Future Pre-Release Cards"] },
    { id: 581004, tcgName: "Shanks", setNames: ["Starter Deck 16: GREEN Uta", "ST-16: Starter Deck 16 GREEN Uta"] },
    { id: 596978, tcgName: "Dracule Mihawk", setNames: ["Emperors in the New World", "Emperors in the New World"] },
    { id: 597025, tcgName: "Catarina Devon", setNames: ["Emperors in the New World", "Emperors in the New World"] },
    { id: 600781, tcgName: "Catarina Devon", setNames: ["Emperors in the New World: 2nd Anniversary Tournament Cards", "Emperors in the New World: 2nd Anniversary Tournament Cards"] },
    { id: 602807, tcgName: "Sai", setNames: ["One Piece Demo Deck Cards", "One Piece Demo Deck Cards"] },
    { id: 617065, tcgName: "Dracule Mihawk", setNames: ["Royal Blood", "Royal Blood"] },
    { id: 617090, tcgName: "Sai", setNames: ["Royal Blood", "Royal Blood"] },
    { id: 620769, tcgName: "Sai", setNames: ["Royal Blood Release Event Cards", "Royal Blood Release Event Cards"] },
    { id: 633180, tcgName: "Catarina Devon", setNames: ["Starter Deck 27: BLACK Marshall.D.Teach", "ST-27: Starter Deck 27 BLACK Marshall.D.Teach"] },
    { id: 634282, tcgName: "Come On!! We'll Fight You!! (Reprint)", setNames: ["Starter Deck 23: RED Shanks", "ST-23: Starter Deck 23 RED Shanks"] },
    { id: 643758, tcgName: "Dracule Mihawk", setNames: ["Legacy of the Master", "Legacy of the Master"] },
    { id: 648094, tcgName: "Trafalgar Law (Seven Warlords of the Sea Binder Set)", setNames: ["One Piece Promotion Cards", "One Piece Promotion Cards"] },
    { id: 656042, tcgName: "Come On!! We'll Fight You!! (Reprint)", setNames: ["Premium Booster -The Best- Vol. 2", "Premium Booster -The Best- Vol. 2"] },
    { id: 671370, tcgName: "Shanks", setNames: ["The Azure Sea's Seven", "The Azure Sea's Seven"] },
    { id: 685369, tcgName: "Dracule Mihawk", setNames: ["Adventure on Kami's Island", "Adventure on Kami's Island"] },
    { id: 685389, tcgName: "Sai", setNames: ["Adventure on Kami's Island", "Adventure on Kami's Island"] },
    { id: 686365, tcgName: "Dracule Mihawk", setNames: ["Adventure on Kami's Island Release Event Cards", "Adventure on Kami's Island Release Event Cards"] },
    { id: 686433, tcgName: "Sai", setNames: ["Adventure on Kami's Island Release Event Cards", "Adventure on Kami's Island Release Event Cards"] },
    { id: 695990, tcgName: "Shanks", setNames: ["The Time of Battle", "The Time of Battle"] },
    { id: 696072, tcgName: "Dracule Mihawk", setNames: ["The Time of Battle", "The Time of Battle"] },
    { id: 696086, tcgName: "Catarina Devon", setNames: ["The Time of Battle", "The Time of Battle"] },
    { id: 696714, tcgName: "Shanks", setNames: ["The Time of Battle Release Event Cards", "The Time of Battle Release Event Cards"] },
    { id: 696758, tcgName: "Dracule Mihawk", setNames: ["The Time of Battle Release Event Cards", "The Time of Battle Release Event Cards"] },
    { id: 706325, tcgName: "Dracule Mihawk", setNames: ["Starter Deck 32: GREEN Roronoa Zoro", "ST-32: Starter Deck 32 GREEN Roronoa Zoro"] },
  ]);
  assert.equal(matchByName("Catarina Devon [Starter Deck: Black Marshall.D.Teach]", n), 633180);
  assert.equal(matchByName("Dracule Mihawk [Starter Deck: Zoro and Sanji]", n), 542109);
  assert.equal(matchByName("Sai [Adventure on Kami's Island Release Event]", n), 686433);
  assert.equal(matchByName("Shanks [Starter Deck: GREEN Uta]", n), 581004);
  assert.equal(matchByName("Come On!! We'll Fight You!! (Reprint) [Starter Deck: Red Shanks]", n), 634282);
  assert.equal(matchByName("Trafalgar Law (Seven Warlords of the Sea Binder Set) [One Piece Promotion Cards]", n), 648094);
  assert.equal(canonSet("ST-01: Starter Deck 1 Straw Hat Crew (Super Pre-Release Edition)"), canonSet("Super Pre-Release Starter Deck: Straw Hat Crew"));
  // A canonical key that names two products is no key at all.
  const two = buildNameIndex([
    { id: 1, tcgName: "Nami", setNames: ["Starter Deck 1: Straw Hat Crew"] },
    { id: 2, tcgName: "Nami", setNames: ["ST-01: Starter Deck Straw Hat Crew Cards"] },
  ]);
  assert.equal(matchByName("Nami [Starter Deck: Straw Hat Crew]", two), null);
});

const DONS = buildDonIndex([
  { id: 456059, tcgName: "DON!! Card (Manga) (Alternate Art)", setCode: "OP01", setName: "Romance Dawn" },
  { id: 456320, tcgName: "DON!! Card // One Piece Film RED Promo", setCode: "OP01", setName: "Romance Dawn" },
  { id: 482273, tcgName: "DON!! Card (Manga)", setCode: "OP02", setName: "Paramount War" },
  { id: 517476, tcgName: "DON!! Card (Alternate Art)", setCode: "OP04", setName: "Kingdoms of Intrigue" },
  { id: 517477, tcgName: "DON!! Card (Color) (Special DON!! Card Pack)", setCode: "OP04", setName: "Kingdoms of Intrigue" },
  { id: 517478, tcgName: "DON!! Card (Black & White) (Special DON!! Card Pack)", setCode: "OP04", setName: "Kingdoms of Intrigue" },
  { id: 549342, tcgName: "DON!! Card", setCode: "OP02", setName: "Paramount War" },
  { id: 586188, tcgName: "DON!! Card (Sakazuki) (Gold)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 586886, tcgName: "DON!! Card (Perona) (Gold)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 587706, tcgName: "DON!! Card (Luffy) (Gold)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 593814, tcgName: "DON!! Card (Luffy)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 593817, tcgName: "DON!! Card (Perona)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 593824, tcgName: "DON!! Card (Sakazuki)", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 655118, tcgName: "DON!! Card (GEAR5 Luffy) (Gold)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  { id: 655119, tcgName: "DON!! Card (GEAR5 Luffy)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  { id: 655126, tcgName: "DON!! Card (Teach) (Gold)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  { id: 655128, tcgName: "DON!! Card (Teach)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  { id: 655895, tcgName: "DON!! Card (Gear 4 Luffy)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
  { id: 655896, tcgName: "DON!! Card (Gear 4 Luffy) (Gold)", setCode: "PRB-02", setName: "Premium Booster -The Best- Vol. 2" },
]);
const don = (t: string) => {
  const x = matchDonTitle(t, DONS);
  return "id" in x ? x.id : x.miss;
};

test("DON!! cards: the set, every word of the printing, nothing it lacks, one fit", () => {
  assert.equal(don("DON!! Card (Teach) (Gold) [PRB-02]"), 655126);
  assert.equal(don("DON!! Card (Teach) [PRB-02]"), 655128);
  assert.equal(don("DON!! Card (Sakazuki) [Premium Booster -The Best-]"), 593824);
  assert.equal(don("DON!! Card (Perona) - Premium Booster -The Best-"), 593817);
  assert.equal(don("DON!! Card (Black & White) (Special DON!! Card Pack) [OP04]"), 517478);
  assert.equal(don("DON!! Card (Special DON!! Card Pack) (Color) [Kingdoms of Intrigue]"), 517477);
  // Romance Dawn has no plain alternate-art DON!!: not the Film RED promo.
  assert.equal(don("DON!! Card (Alternate Art) - Romance Dawn"), "no-printing");
  // "Vol. 2" names PRB-02, which has no plain Luffy: not PRB-01's.
  assert.equal(don("DON!! Card (Luffy) - Premium Booster -The Best- Vol. 2"), "no-printing");
  // A store's own version numbers are never readable; no set, no match.
  assert.equal(don("Don!! (PRB Perona) (V.2) PRB01 DON!! Near Mint Englisch"), "no-printing");
  assert.equal(don("DON!! Card (Teach) (Gold)"), "no-set");
});

test("a store product runs every path in order and says which one missed", () => {
  const ix: StoreMatchIndexes = {
    cards: real,
    names: buildNameIndex([{ id: 581004, tcgName: "Shanks", setNames: ["Starter Deck 16: GREEN Uta"] }]),
    dons: DONS,
    sealed: [
      ...sealed,
      { id: 106, name: "Adventure on Kami's Island Booster Pack", kind: "Booster Pack", setCode: "OP15-EB04", setName: "Adventure on Kami's Island" },
    ],
  };
  const m = (t: string, ...skus: string[]) => {
    const x = matchStoreProduct(t, skus, ix);
    return "id" in x ? `${x.path}:${x.id}` : x.miss;
  };
  assert.equal(m("Shanks (OP12-007) [Legacy of the Master]"), "number:643731");
  assert.equal(m("Shanks [Starter Deck: GREEN Uta]"), "name:581004");
  assert.equal(m("DON!! Card (Teach) [PRB-02]"), "don:655128");
  assert.equal(m("Shanks [Legacy of the Master]", "OP12-007-EN-NF-1"), "sku:643731");
  assert.equal(m("One Piece OP13 Display (24 Packs) EN"), "sealed:100");
  assert.equal(m("Nami (Dash Pack) [Adventure on Kami's Island]"), "name-unmatched");
  assert.equal(m("DON!! Card (Alternate Art) - Romance Dawn"), "don-no-printing");
  assert.equal(m("Blast Breath [Best Selection Vol.1]", "OP-PR-ST04-016-EN-FO-1"), "sku-unknown-set");
  assert.equal(m("One Piece Romance Dawn Booster Box"), "sealed-ambiguous");
  assert.equal(m("Shanks OP01-120 (Japanese)"), "foreign");
});

test("a bare \"Name [Set]\" title never takes a card whose SKUs name another number (wrong-price report: Rhystic Nostalgia Gaming, OP16-015 vs OP16-052)", () => {
  const luffy = (id: number, number: string) => ({ id, name: "Monkey.D.Luffy", number, variant: null, setCode: "OP16", setName: "The Time of Battle" });
  const ix: StoreMatchIndexes = {
    cards: buildCardIndex([luffy(693419, "OP16-015"), luffy(693420, "OP16-052"), luffy(693421, "OP16-095")]),
    // The plain name is the one unique key; the other printings carry "(052)" in TCGplayer's name.
    names: buildNameIndex([
      { id: 693419, tcgName: "Monkey.D.Luffy", setNames: ["The Time of Battle"] },
      { id: 693420, tcgName: "Monkey.D.Luffy (052)", setNames: ["The Time of Battle"] },
    ]),
    dons: [],
    sealed: [],
  };
  const m = (t: string, ...skus: string[]) => {
    const x = matchStoreProduct(t, skus, ix);
    return "id" in x ? `${x.path}:${x.id}` : x.miss;
  };
  // Five products at one store, one title (rhysticnostalgiagaming.com.au, handles -1 .. -4):
  assert.equal(m("Monkey.D.Luffy [The Time of Battle]", "OP16-015-EN-FO-1", "OP16-015-EN-FO-2"), "name:693419");
  assert.equal(m("Monkey.D.Luffy [The Time of Battle]", "OP16-052-EN-NF-1", "OP16-052-EN-NF-2"), "sku:693420");
  assert.equal(m("Monkey.D.Luffy [The Time of Battle]", "OP16-095-EN-FO-1"), "sku:693421");
  // A SKU number the catalogue doesn't list is a miss, never the card the name index knows.
  assert.notEqual(m("Monkey.D.Luffy [The Time of Battle]", "OP16-999-EN-NF-1"), "name:693419");
  // No SKU at all: the name path still answers (the import then refuses duplicated titles).
  assert.equal(m("Monkey.D.Luffy [The Time of Battle]"), "name:693419");
});

test("a store's own language tag marks a foreign card even when the title says nothing (wrong-price report: The Card Spot, OP16-118)", () => {
  // thecardspot.com.au/products/op16-118-portgas-d-ace-one-piece-tcg-1: tags ["Japanese"], body "Language: Japanese"
  assert.equal(foreignByTags(["Japanese"]), true);
  assert.equal(foreignByTags("Japanese, Singles"), true);
  assert.equal(foreignByTags(["English"]), false);
  assert.equal(foreignByTags(["English", "Japanese"]), true, "a mixed listing is not safe to price");
  assert.equal(foreignByTags([], "Japanese"), true);
  assert.equal(foreignByTags(undefined), false);
  assert.equal(foreignByTags(["Alternate Art", "OP16"]), false);
  const ix: StoreMatchIndexes = { cards: buildCardIndex([{ id: 694932, name: "Portgas.D.Ace", number: "OP16-118", variant: null, setCode: "OP16", setName: "The Time of Battle" }]), names: buildNameIndex([]), dons: [], sealed: [] };
  const title = "OP16-118 Portgas D.Ace - One Piece TCG";
  const hit = matchStoreProduct(title, [], ix);
  assert.ok("id" in hit && hit.id === 694932, "without the tag the title alone matches");
  assert.deepEqual(matchStoreProduct(title, [], ix, { tags: ["Japanese"] }), { miss: "foreign" });
  assert.ok("id" in matchStoreProduct(title, [], ix, { tags: ["English"] }));
});

test("every path answers to the SKU number: a title number and a SKU number that disagree is no match", () => {
  const luffy = (id: number, number: string) => ({ id, name: "Monkey.D.Luffy", number, variant: null, setCode: "OP16", setName: "The Time of Battle" });
  const ix: StoreMatchIndexes = { cards: buildCardIndex([luffy(1, "OP16-015"), luffy(2, "OP16-052")]), names: buildNameIndex([]), dons: [], sealed: [] };
  const r = (t: string, ...skus: string[]) => { const x = matchStoreProduct(t, skus, ix); return "id" in x ? x.id : x.miss; };
  assert.equal(r("Monkey.D.Luffy (OP16-015) [The Time of Battle]", "OP16-015-EN-NF-1"), 1);
  assert.equal(r("Monkey.D.Luffy (OP16-015) [The Time of Battle]", "OP16-052-EN-NF-1"), "sku-number-mismatch");
  assert.equal(r("Monkey.D.Luffy (OP16-015) [The Time of Battle]", "OP16-015-EN-NF-1", "OP16-052-EN-NF-2"), 1, "SKUs that disagree among themselves give no number to compare");
});

test("the import skips a bare title that a store shares between products, whatever path matched the twin", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../src/lib/import.ts"), "utf8");
  assert.match(src, /for \(const \{ p \} of matched\) sameTitle\.set\(/);
  assert.match(src, /name-duplicate-title/);
  assert.match(src, /tags: p\.tags, productType: p\.product_type/);
});
