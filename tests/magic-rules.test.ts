// The Magic rules of contract 3.2 that live in pure code (owner WP01a), pinned on the 57 real products of tests/fixtures/magic-products.json and on real Scryfall oracles:
// rule E (what is etched), the star twin of a shared id, effective rarity, display names and reskins, commander eligibility, and the group and class rules. The importer (WP01b) and the join
// (scryfall.ts) implement rule E and the star twin against Scryfall rows; the predicate below is the rule as the contract states it, so the importer's own tests have something to agree with.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "../src/lib/constants";
import * as K from "../src/lib/catalog";

interface Scry { id: string; set: string; cn: string; name: string; layout: string; finishes: string[]; rarity: string; oracle_id: string; tcgplayer_id: number | null; tcgplayer_etched_id: number | null; flavor_name: string | null; faces: string[]; reserved: boolean; edhrec_rank: number | null }
interface Fx {
  productId: number; rule: string; name: string; groupId: number; group: string; groupKind: string; tcgNumber: string | null; tcgRarity: string | null;
  expect: { cls: number | "sealed"; rarity: string | null; etched: boolean; star: boolean; displayName: string | null; alt: string | null; fnum: string | null; sc: string | null; layout: string | null; link: string; nkey: string | null; nsort: number; scryFinishes?: string[] };
  scryfall: Scry[];
}
const fixtures: Fx[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/magic-products.json"), "utf8"));
const fx = (id: number): Fx => fixtures.find((f) => f.productId === id)!;
const parse = (f: Fx) => K.parseTcgName(f.name, { setCodes: new Set(), groupKind: f.groupKind as C.SetKind });
const singles = fixtures.filter((f) => f.expect.cls !== "sealed");

// ── rule E ──
/** The Scryfall row a fixture is joined to: through tcgplayer_etched_id for an etched link, through tcgplayer_id otherwise. */
const joinedRow = (f: Fx): Scry | undefined => f.scryfall.find((r) => (f.expect.link === "etched" ? r.tcgplayer_etched_id : r.tcgplayer_id) === f.productId);
const isEtched = (f: Fx): boolean => parse(f).treat.includes("etched") || (f.expect.link === "etched" && (joinedRow(f)?.finishes ?? []).includes("etched"));
test("rule E: ETCHED iff the product name carries the Foil Etched token OR the product is joined through tcgplayer_etched_id and that Scryfall row's finishes contain etched", () => {
  for (const f of singles) assert.equal(isEtched(f), f.expect.etched, `${f.productId} ${f.name}`);
  assert.deepEqual(singles.filter((f) => f.expect.etched).map((f) => f.productId), [541332, 251776, 532997]);
});
test("rule E on the six named fixtures", () => {
  // 541332: the Foil Etched token AND the etched id
  assert.deepEqual([parse(fx(541332)).treat, fx(541332).expect.link, joinedRow(fx(541332))!.finishes], [["etched"], "etched", ["etched"]]);
  // 251776 Griselbrand (Secret Lair): the token; the row that carries the etched id lists nonfoil and foil only (its finishes LACK etched): the name wins
  assert.deepEqual([parse(fx(251776)).treat, fx(251776).expect.link, joinedRow(fx(251776))!.finishes], [["etched"], "etched", ["nonfoil", "foil"]]);
  // 532997: no token ("Display Commander ... Thick Stock"), but the etched id and an etched row: etched
  assert.deepEqual([parse(fx(532997)).treat, fx(532997).expect.link, joinedRow(fx(532997))!.finishes], [["display"], "etched", ["etched"]]);
  // 594545 (id == etched id, the row lists foil only) and 286677 (both indexes hit, no etched finish): NOT etched
  for (const id of [594545, 286677]) { assert.equal(isEtched(fx(id)), false, String(id)); assert.ok(!joinedRow(fx(id))!.finishes.includes("etched")); }
  // 238617: a BASE product whose Scryfall row lists etched is not etched (326 such rows today)
  assert.deepEqual([fx(238617).expect.link, joinedRow(fx(238617))!.finishes.includes("etched"), isEtched(fx(238617))], ["id", true, false]);
});

// ── the star twin of a shared id ──
test("a shared TCGplayer id is one Card: Normal = the printing without a star, Foil = the star printing (fnum); the lookup key ignores the star and the sort puts it right after", () => {
  for (const id of [2831, 3077]) {
    const f = fx(id), plain = f.scryfall.find((r) => !r.cn.includes("★"))!, star = f.scryfall.find((r) => r.cn.includes("★"))!;
    assert.equal(f.scryfall.length, 2);
    assert.deepEqual([plain.finishes, star.finishes], [["nonfoil"], ["foil"]], "the two printings split the finishes");
    assert.equal(plain.tcgplayer_id, id); assert.equal(star.tcgplayer_id, id);
    assert.deepEqual([f.expect.star, f.expect.fnum, f.expect.nkey, f.expect.nsort], [true, star.cn, C.nkey(plain.cn), C.nsort(plain.cn)], "the Card keeps the plain number; the star number is fnum");
    assert.equal(C.nsort(star.cn), C.nsort(plain.cn) + 1);
    assert.equal(C.displayNumber({ number: plain.cn, fnum: star.cn }, "F"), star.cn);
  }
});

// ── effective rarity ──
test("effective rarity on every fixture: a joined card shows Scryfall's true rarity, TCGplayer's L stays L, tokens are T, an unjoined card keeps TCGplayer's letter", () => {
  for (const f of singles) {
    const scry = f.scryfall[0]?.rarity ?? null;
    assert.equal(C.effectiveRarity({ tcg: f.tcgRarity, scry, cls: f.expect.cls as number }), f.expect.rarity, `${f.productId} ${f.name}`);
  }
  const joined = (id: number) => C.effectiveRarity({ tcg: fx(id).tcgRarity, scry: fx(id).scryfall[0]?.rarity ?? null, cls: 0 });
  assert.equal(fx(594545).tcgRarity, "P"); assert.equal(joined(594545), "R", "Sol Ring: Promo on TCGplayer, rare on Scryfall");
  assert.equal(fx(158462).tcgRarity, "S"); assert.equal(joined(158462), "R", "World Championship Decks: Special on TCGplayer, rare on Scryfall");
  assert.equal(joined(496078), "L");
});

// ── names ──
test("Card.name = displayName(layout, oracle name): split and fuse keep 'A // B', transform, adventure, flip, mutate-free layouts show the front face (fixtures)", () => {
  for (const f of singles) {
    const row = f.scryfall[0];
    if (!row || f.expect.displayName === null) continue;
    const oracleName = row.name;
    assert.equal(C.displayName(row.layout, oracleName), f.expect.displayName, `${f.productId}: ${oracleName} (${row.layout})`);
  }
  assert.equal(C.displayName("transform", "Delver of Secrets // Insectile Aberration"), "Delver of Secrets");
  assert.equal(C.displayName("adventure", "Brazen Borrower // Petty Theft"), "Brazen Borrower");
  assert.equal(C.displayName("modal_dfc", "Esika, God of the Tree // The Prismatic Bridge"), "Esika, God of the Tree");
  assert.equal(C.displayName("reversible_card", "Blightsteel Colossus // Blightsteel Colossus"), "Blightsteel Colossus");
  assert.equal(C.displayName("split", "Fire // Ice"), "Fire // Ice");
  assert.equal(C.displayName("normal", "Sol Ring"), "Sol Ring");
  assert.equal(C.displayName(null, "Sol Ring"), "Sol Ring");
  assert.equal(C.displayName("fuse", "Wear // Tear"), "Wear // Tear");
  assert.equal(C.displayName("aftermath", "Commit // Memory"), "Commit // Memory");
  assert.equal(C.frontFace("Delver of Secrets // Insectile Aberration"), "Delver of Secrets");
  assert.deepEqual([...C.FRONT_ONLY_LAYOUTS], ["transform", "modal_dfc", "adventure", "flip", "prepare", "reversible_card"]);
});
test("a Universes Beyond reskin: TCGplayer writes '<printed name> - <oracle name>'; the grammar hands over head and tail, the printed name is Card.alt, the join decides which side is the oracle", () => {
  for (const id of [456592, 560662, 706216, 652038, 253194, 541495]) {
    const f = fx(id), p = parse(f);
    assert.equal(p.dash?.kind, "reskin?", f.name);
    assert.equal(p.dash!.tail, f.expect.displayName, `${f.name}: the tail is the oracle's display name`);
    assert.equal(p.dash!.head, f.expect.alt, `${f.name}: the head is the printed name (Card.alt)`);
    assert.equal(p.base, p.core, "a reskin keeps both names: the pair is part of the product name");
  }
  const khan = fx(706216).scryfall[0]!;
  assert.equal(C.reskinAlt({ flavorName: khan.flavor_name, faceFlavorNames: [] }), "Khan, Engineered Evil", "Scryfall's flavor_name is the printed name");
  assert.equal(C.reskinAlt({ flavorName: null, faceFlavorNames: ["Toxic Sheepsquatch", null] }), "Toxic Sheepsquatch", "else the front face's flavor name");
  assert.equal(C.reskinAlt({ flavorName: null, faceFlavorNames: [] }), null);
  assert.deepEqual(C.nameForms({ name: "Sheoldred, the Apocalypse", alt: "Khan, Engineered Evil", tcgName: "Khan, Engineered Evil - Sheoldred, the Apocalypse (Borderless)" }), ["sheoldred the apocalypse", "khan engineered evil", "khan engineered evil sheoldred the apocalypse borderless"]);
  assert.deepEqual(C.nameForms({ name: "Fire // Ice", alt: null, tcgName: "Fire // Ice" }, { name: "Fire // Ice" }), ["fire ice", "fire", "ice"], "every face of a split card is a form of its name");
  assert.deepEqual(C.nameForms({ name: "Delver of Secrets", alt: null, tcgName: "Delver of Secrets" }, { name: "Delver of Secrets // Insectile Aberration" }), ["delver of secrets", "delver of secrets insectile aberration", "insectile aberration"]);
});
test("a ligature is transliterated before folding: Aether Vial is `aether-vial`, never `ther-vial` (fold, slugify and the oracle slug agree)", () => {
  assert.equal(C.fold("Æther Vial"), "aether vial");
  assert.equal(K.slugify("Æther Vial"), "aether-vial");
  assert.equal(K.oracleSlugOf({ id: "d1ccd7f3-0d47-4e19-89c6-0d9bdb2b0b8d", name: "Æther Vial" }, false), "aether-vial");
  assert.equal(K.slugify("Ætherling"), "aetherling");
  assert.equal(K.slugify("Jötun Grunt"), "jotun-grunt");
  assert.equal(K.slugify("Lim-Dûl's Vault"), "lim-duls-vault");
  assert.equal(K.slugify("Dandân"), "dandan");
});

// ── commander eligibility (real oracles, Scryfall oracle-cards 2026-10-07) ──
interface Oracle { name: string; typeLine: string; oracleText: string | null; keywords: string[]; power: string | null; toughness: string | null; reserved: boolean; gameChanger: boolean; commanderLegal: boolean }
const O = (name: string, typeLine: string, o: Partial<Oracle> = {}): Oracle => ({ name, typeLine, oracleText: null, keywords: [], power: null, toughness: null, reserved: false, gameChanger: false, commanderLegal: true, ...o });
const flagsOf = (o: Oracle): number => C.oracleFlags(o);
const { COMMANDER, PARTNER, BACKGROUND, CHOOSE_BACKGROUND, RESERVED, GAME_CHANGER } = C.ORACLE_FLAGS;
test("COMMANDER: commander-legal AND (a Legendary Creature on the FRONT face, or a Legendary Vehicle or Spacecraft with power and toughness, or the text says it can be your commander)", () => {
  assert.equal(flagsOf(O("Atraxa, Praetors' Voice", "Legendary Creature — Phyrexian Angel Horror", { power: "4", toughness: "4", keywords: ["Deathtouch", "Flying", "Lifelink", "Vigilance", "Proliferate"] })), COMMANDER);
  assert.equal(flagsOf(O("Teferi, Temporal Archmage", "Legendary Planeswalker — Teferi", { oracleText: "−1: Untap up to four target permanents.\nTeferi, Temporal Archmage can be your commander." })), COMMANDER);
  assert.equal(flagsOf(O("Ob Nixilis of the Black Oath", "Legendary Planeswalker — Nixilis", { oracleText: "Ob Nixilis of the Black Oath can be your commander." })), COMMANDER);
  assert.equal(flagsOf(O("Jace, the Mind Sculptor", "Legendary Planeswalker — Jace", { oracleText: "+2: Look at the top card of target player's library." })), 0, "most planeswalkers are not commanders");
  assert.equal(flagsOf(O("Birds of Paradise", "Creature — Bird", { power: "0", toughness: "1" })), 0, "not legendary");
  assert.equal(flagsOf(O("Esika's Chariot", "Legendary Artifact — Vehicle", { power: "4", toughness: "4", keywords: ["Crew"] })), COMMANDER, "a Legendary Vehicle with power and toughness");
  assert.equal(flagsOf(O("Hearthhull, the Worldseed", "Legendary Artifact — Spacecraft", { power: "6", toughness: "7", keywords: ["Station"] })), COMMANDER, "and a Legendary Spacecraft");
  assert.equal(flagsOf(O("Candela, Aegis of Adagia", "Legendary Artifact — Spacecraft", { power: "3", toughness: "3", commanderLegal: false })), 0, "not Commander-legal: never a commander");
  assert.equal(flagsOf(O("Westvale Abbey // Ormendahl, Profane Prince", "Land // Legendary Creature — Demon")), 0, "legendary only on the BACK face: not a commander (27 oracles)");
  assert.equal(flagsOf(O("Esika, God of the Tree // The Prismatic Bridge", "Legendary Creature — God // Legendary Enchantment", { keywords: ["Vigilance"] })), COMMANDER, "legendary on the FRONT face");
  assert.equal(flagsOf(O("Black Lotus", "Artifact", { reserved: true, commanderLegal: false })), RESERVED);
});
test("PARTNER, BACKGROUND, CHOOSE_BACKGROUND, RESERVED and GAME_CHANGER from real keywords and types", () => {
  assert.equal(flagsOf(O("Tymna the Weaver", "Legendary Creature — Human Cleric", { power: "2", toughness: "2", keywords: ["Lifelink", "Partner"] })), COMMANDER | PARTNER);
  assert.equal(flagsOf(O("Thrasios, Triton Hero", "Legendary Creature — Merfolk Wizard", { power: "1", toughness: "3", keywords: ["Partner", "Scry"] })), COMMANDER | PARTNER);
  assert.equal(flagsOf(O("Will Kenrith", "Legendary Planeswalker — Will", { keywords: ["Partner with", "Partner"], oracleText: "Partner with Rowan Kenrith\nWill Kenrith can be your commander." })), COMMANDER | PARTNER, "Partner with is a partner too");
  assert.equal(flagsOf(O("Candlekeep Sage", "Legendary Enchantment — Background", { oracleText: "Commander creatures you own have \"When this creature enters or leaves the battlefield, draw a card.\"" })), BACKGROUND, "a Background is not itself a commander");
  assert.equal(flagsOf(O("Wilson, Refined Grizzly", "Legendary Creature — Bear Warrior", { power: "2", toughness: "2", keywords: ["Reach", "Vigilance", "Choose a background", "Trample", "Ward"] })), COMMANDER | CHOOSE_BACKGROUND);
  assert.equal(flagsOf(O("Rhystic Study", "Enchantment", { gameChanger: true })), GAME_CHANGER);
  assert.equal(flagsOf(O("Sol Ring", "Artifact")), 0);
});

// ── classes and the rest of the group rules, on the fixtures ──
test("product class on the fixtures: a token or emblem, an art card, an oversized card and a rules card are not cards (cls 1 to 4); every other single is cls 0", () => {
  for (const f of singles) {
    const sf = f.scryfall[0] ? { layout: f.scryfall[0].layout, oversized: false } : f.expect.layout ? { layout: f.expect.layout, oversized: false } : null;
    const kind = f.groupKind as C.SetKind;
    assert.equal(K.productClass({ name: f.name, rarity: f.tcgRarity }, kind, sf), f.expect.cls, `${f.productId} ${f.name}`);
  }
  assert.deepEqual([478655, 165632, 718476, 174434, 189807].map((id) => fx(id).expect.cls), [C.CARD_CLASS.TOKEN, C.CARD_CLASS.TOKEN, C.CARD_CLASS.ART, C.CARD_CLASS.OVERSIZED, C.CARD_CLASS.HELPER]);
  assert.equal(fx(165632).expect.layout, "token", "the Treasure token is a class 1 by its Scryfall layout, whatever TCGplayer files it under");
});
test("sealed or other: a product without a Rarity is sealed (3,725 of 119,147 today), including a token-like 'Clue Token (JP) (Metal Promo)'", () => {
  for (const f of fixtures) {
    const p: K.TcgcsvProduct = { productId: f.productId, name: f.name, imageUrl: "", groupId: f.groupId, url: "", extendedData: f.tcgRarity ? [{ name: "Rarity", value: f.tcgRarity }] : [] };
    assert.equal(K.isSealedProduct(p), f.expect.cls === "sealed", `${f.productId} ${f.name}`);
  }
  assert.equal(fixtures.filter((f) => f.expect.cls === "sealed").length, 2);
});
