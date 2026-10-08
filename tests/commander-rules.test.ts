// The deck rules of Magic (src/lib/commander-rules.ts, owner WP10): format sizes and copy limits, legality from Scryfall's 22-character string, the Commander family (who may lead, the
// partner pairs, colour identity, singleton), Pauper's rarity note. Pure: every card below is a REAL card with the facts the importer published on 2026-10-07 (tests/helpers/deck-watch-harness.ts:
// REAL_ORACLES), and the three decks are real lists a player would paste (a Modern Boros burn 60 + 15, a Pauper burn 60 + 15, an Atraxa, Praetors' Voice Commander 100).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMANDER_DECK_SIZE,
  COMMANDER_FORMATS,
  DECK_FORMATS,
  canPair,
  checkDeck,
  commanderEligible,
  commanderNeedsPrintings,
  copyLimitFromText,
  deckIdentity,
  entryKey,
  firstError,
  inferCommanders,
  isBasicLand,
  isCommanderFormat,
  isDeckFormat,
  partnerKind,
  type DeckEntry,
  type DeckReport,
} from "../src/lib/commander-rules";
import { FORMATS, ORACLE_FLAGS, identityFits, legalityOf, type Format } from "../src/lib/constants";
import { DECKS, REAL_ORACLES, REAL_TEXTS, entriesFor, ruleOracle } from "./helpers/deck-watch-harness";

const W = 1, U = 2, B = 4, R = 8, G = 16;
const check = (text: string, format: Format, rarity: Record<string, string> = {}): DeckReport => checkDeck(format, entriesFor(text, rarity));
const codes = (r: DeckReport): string[] => r.issues.map((i) => i.code);
const errors = (r: DeckReport): string[] => r.issues.filter((i) => i.level === "error").map((i) => i.code);
const named = (r: DeckReport, code: string): string[] => r.issues.find((i) => i.code === code)?.names ?? [];
/** The text with every line that matches replaced (or removed with null): the way a player edits a list. */
const edit = (text: string, from: string, to: string | null): string => {
  assert.ok(text.includes(from), `"${from}" is in the list`);
  return text.replace(from, to ?? "").replace(/\n\n\n+/g, "\n\n").replace(/^\n+|\n+$/g, "");
};

// ══ the registry ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("every format of the published legality string has a rule row, and the rows say what Magic says", () => {
  assert.deepEqual(Object.keys(DECK_FORMATS).sort(), [...FORMATS].sort());
  for (const f of ["standard", "pioneer", "modern", "legacy", "vintage", "pauper", "historic", "timeless"] as const) {
    assert.deepEqual([DECK_FORMATS[f].min, DECK_FORMATS[f].max, DECK_FORMATS[f].side, DECK_FORMATS[f].copies, DECK_FORMATS[f].family], [60, null, 15, 4, "constructed"], f);
  }
  for (const f of ["commander", "paupercommander", "duel", "predh"] as const) assert.deepEqual([DECK_FORMATS[f].min, DECK_FORMATS[f].max, DECK_FORMATS[f].side, DECK_FORMATS[f].copies], [100, 100, 0, 1], f);
  assert.equal(COMMANDER_DECK_SIZE, 100);
  assert.deepEqual([DECK_FORMATS.brawl.min, DECK_FORMATS.standardbrawl.min, DECK_FORMATS.oathbreaker.min, DECK_FORMATS.gladiator.min], [100, 60, 60, 100], "Brawl (Historic Brawl) 100, Standard Brawl 60, Oathbreaker 60, Gladiator 100");
  assert.equal(DECK_FORMATS.gladiator.family, "gladiator", "singleton, but no commander");
  assert.deepEqual(DECK_FORMATS.commander.label, "Commander");
  assert.equal(DECK_FORMATS.competitivebrawl.verified, false, "a size this file cannot confirm is not enforced");
  assert.equal(DECK_FORMATS.tlr.verified, false);
});

test("which formats lead with a commander; isDeckFormat refuses anything outside the list (oldschool is not stored)", () => {
  assert.deepEqual([...COMMANDER_FORMATS].sort(), ["brawl", "commander", "competitivebrawl", "duel", "oathbreaker", "paupercommander", "predh", "standardbrawl"]);
  assert.equal(isCommanderFormat("commander"), true);
  assert.equal(isCommanderFormat("modern"), false);
  assert.equal(isCommanderFormat("gladiator"), false);
  for (const f of FORMATS) assert.equal(isDeckFormat(f), true, f);
  for (const f of ["oldschool", "", "Modern", null, undefined, 7, "__proto__", "constructor"]) assert.equal(isDeckFormat(f), false, String(f));
});

// ══ small rules on real cards ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("a basic land is any 'Basic' type line, snow and Wastes included; a dual land with basic land TYPES is not", () => {
  for (const n of ["Mountain", "Snow-Covered Island", "Wastes"]) assert.equal(isBasicLand(REAL_ORACLES[n]![1]), true, n);
  for (const n of ["Sacred Foundry", "Breeding Pool", "Gaea's Cradle", "Command Tower"]) assert.equal(isBasicLand(REAL_ORACLES[n]![1]), false, n);
});

test("'A deck can have any number / up to N cards named ...' is read from the oracle text, nothing else is a limit", () => {
  assert.equal(copyLimitFromText(REAL_TEXTS["Relentless Rats"]!.text), Number.POSITIVE_INFINITY);
  assert.equal(copyLimitFromText(REAL_TEXTS["Dragon's Approach"]!.text), Number.POSITIVE_INFINITY);
  assert.equal(copyLimitFromText(REAL_TEXTS["Persistent Petitioners"]!.text), Number.POSITIVE_INFINITY);
  assert.equal(copyLimitFromText(REAL_TEXTS["Shadowborn Apostle"]!.text), Number.POSITIVE_INFINITY);
  assert.equal(copyLimitFromText(REAL_TEXTS["Seven Dwarves"]!.text), 7);
  assert.equal(copyLimitFromText(REAL_TEXTS["Nazgûl"]!.text), 9, "a word number");
  assert.equal(copyLimitFromText(REAL_TEXTS["Atraxa, Praetors' Voice"]!.text), null);
  assert.equal(copyLimitFromText(null), null);
  assert.equal(copyLimitFromText("A deck can have up to 12 cards named Foo."), 12, "a digit number");
});

test("legality has five states and an unknown one is judged as nothing, never as 'not legal'", () => {
  const bolt = ruleOracle("Lightning Bolt");
  assert.equal(bolt.legal.length, FORMATS.length, "22 characters");
  assert.deepEqual([legalityOf(bolt.legal, "modern"), legalityOf(bolt.legal, "standard"), legalityOf(bolt.legal, "historic")], ["legal", "not_legal", "banned"]);
  assert.equal(legalityOf(ruleOracle("Sol Ring").legal, "vintage"), "restricted");
  assert.equal(legalityOf("?".repeat(22), "modern"), "unknown");
  const unknown: DeckEntry = { key: entryKey({ no: bolt.no }, "Lightning Bolt"), name: "Lightning Bolt", qty: 4, zone: "main", oracle: { ...bolt, legal: "?".repeat(22) } };
  const r = checkDeck("modern", [unknown]);
  assert.deepEqual(r.unchecked, ["Lightning Bolt"]);
  assert.deepEqual(errors(r), ["size"], "only the size is wrong: an unknown legality is not an error");
  assert.ok(r.issues.some((i) => i.code === "unchecked" && i.level === "note"));
  const nofacts: DeckEntry = { key: entryKey(null, "Nobody At All"), name: "Nobody At All", qty: 1, zone: "main", oracle: null };
  assert.deepEqual(checkDeck("modern", [nofacts]).unchecked, ["Nobody At All"], "a card whose facts could not be read is not judged either");
});

test("the entry key is the oracle, so two printings of one card are one name; without facts it is the folded name", () => {
  assert.equal(entryKey(ruleOracle("Counterspell"), "Counterspell"), `o${REAL_ORACLES["Counterspell"]![0]}`);
  assert.equal(entryKey(null, "Lim-Dûl's Vault"), "n:lim duls vault");
});

// ══ Modern: a real 60 + 15 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("Modern: the Boros burn list is 60 + 15, every card legal, four of each, basics unlimited", () => {
  const r = check(DECKS.modern, "modern");
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { main: 60, side: 15, commander: 0, companion: 0, deck: 60 });
  assert.deepEqual(r.issues, []);
  assert.equal(r.identity, null, "no commander, no identity");
  assert.equal(r.label, "Modern");
  assert.equal(r.verified, true);
  assert.equal(firstError(r), null);
});

test("Modern: a short main deck, a fifth copy, a sideboard of 16 and a card that is not legal each break their own rule", () => {
  const short = check(edit(DECKS.modern, "4 Mountain", "3 Mountain"), "modern");
  assert.deepEqual(errors(short), ["size"]);
  assert.match(firstError(short)!, /at least 60 cards in the main deck \(this list has 59\)/);
  const five = check(edit(DECKS.modern, "4 Lightning Bolt", "5 Lightning Bolt").replace("4 Mountain", "3 Mountain"), "modern");
  assert.deepEqual(errors(five), ["copies"]);
  assert.deepEqual(named(five, "copies"), ["Lightning Bolt (5)"]);
  const bigSide = check(edit(DECKS.modern, "2 Dragon's Rage Channeler", "3 Dragon's Rage Channeler"), "modern");
  assert.deepEqual(errors(bigSide), ["side-size"]);
  assert.match(firstError(bigSide)!, /sideboard holds at most 15 cards \(this one has 16\)/);
  const chain = check(edit(DECKS.modern, "4 Mountain", "4 Chain Lightning"), "modern");
  assert.deepEqual(errors(chain), ["not-legal"]);
  assert.equal(firstError(chain), "Not legal in Modern: Chain Lightning.");
  const dig = check(edit(DECKS.modern, "4 Mountain", "4 Dig Through Time"), "modern");
  assert.deepEqual(errors(dig), ["banned"], "Dig Through Time is banned in Modern");
  assert.equal(firstError(dig), "Banned in Modern: Dig Through Time.");
});

test("the same card in the main deck and the sideboard counts as one name, and a 61-card main deck is fine", () => {
  const split = check(edit(DECKS.modern, "4 Lightning Bolt", "2 Lightning Bolt").replace("Sideboard\n", "Sideboard\n3 Lightning Bolt\n").replace("3 Smash to Smithereens\n", "").replace("4 Mountain", "5 Mountain"), "modern");
  assert.deepEqual(named(split, "copies"), ["Lightning Bolt (5)"], "2 main + 3 side is 5 copies of one card");
  const long = check(edit(DECKS.modern, "4 Mountain", "5 Mountain"), "modern");
  assert.equal(long.ok, true);
  assert.equal(long.counts.deck, 61);
});

test("a card that lifts the limit ('any number of cards named', 'up to seven') is read from its text, and only that card", () => {
  const rats = (n: number) => `${n} Relentless Rats\n${60 - n} Mountain\n`;
  assert.equal(check(rats(20), "modern").ok, true, "any number of Relentless Rats");
  assert.ok(!errors(check(rats(20), "commander")).includes("copies"), "the clause overrides the singleton rule too");
  assert.ok(errors(check("4 Lightning Bolt\n56 Mountain", "commander")).includes("copies"), "and only for the card that has it");
  assert.equal(check(`7 Seven Dwarves\n${53} Mountain`, "modern").ok, true);
  assert.deepEqual(named(check(`8 Seven Dwarves\n${52} Mountain`, "modern"), "copies"), ["Seven Dwarves (8)"], "up to seven, not eight");
  assert.equal(check(`9 Nazgûl\n51 Swamp`.replace("Swamp", "Mountain"), "modern").ok, true);
});

// ══ Legacy, Vintage, Timeless: banned and restricted ════════════════════════════════════════════════════════════════════════════════════════════════════

test("Legacy bans Sol Ring and Mental Misstep; Vintage restricts them to one copy and says nothing else; Timeless restricts Demonic Tutor", () => {
  const base = "56 Island\n";
  assert.equal(firstError(check(`${base}4 Sol Ring`, "legacy")), "Banned in Legacy: Sol Ring.");
  assert.equal(check(`${base}4 Sol Ring`, "modern").issues.some((i) => i.code === "not-legal"), true, "not legal in Modern");
  const one = check(`1 Sol Ring\n1 Mental Misstep\n58 Island`, "vintage");
  assert.equal(one.ok, true, "one copy of a restricted card");
  assert.deepEqual(codes(one), [], "no note either: restricted is the format's ordinary state");
  const two = check(`2 Sol Ring\n58 Island`, "vintage");
  assert.deepEqual(errors(two), ["copies"]);
  assert.deepEqual(named(two, "copies"), ["Sol Ring (2)"]);
  assert.match(firstError(two)!, /restricted card in Vintage or Timeless is limited to one/);
  assert.deepEqual(errors(check(`2 Demonic Tutor\n58 Swamp`, "timeless")), ["copies"]);
  assert.equal(check(`4 Lightning Bolt\n56 Mountain`, "vintage").ok, true, "a card that is not restricted keeps its four");
  const lotus = check(`1 Black Lotus\n59 Island`, "vintage");
  assert.equal(lotus.ok, true);
  assert.equal(firstError(check(`1 Black Lotus\n59 Island`, "legacy")), "Banned in Legacy: Black Lotus.");
});

test("Pioneer and Standard refuse what is not in them, with the card named", () => {
  assert.equal(firstError(check("4 Lightning Bolt\n56 Mountain", "pioneer")), "Not legal in Pioneer: Lightning Bolt.");
  assert.equal(firstError(check("4 Lightning Bolt\n56 Mountain", "standard")), "Not legal in Standard: Lightning Bolt.");
  assert.equal(check("4 Lightning Bolt\n56 Mountain", "legacy").ok, true);
});

// ══ Pauper: a real 60 + 15 and the rarity note ═══════════════════════════════════════════════════════════════════════════════════════════════════════

test("Pauper: the mono-red burn list is legal; Goblin Guide is not legal there and Monastery Swiftspear is banned, each named", () => {
  const r = check(DECKS.pauper, "pauper");
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { main: 60, side: 15, commander: 0, companion: 0, deck: 60 });
  assert.deepEqual(r.issues, []);
  const goblin = check(edit(DECKS.pauper, "16 Mountain", "12 Mountain\n4 Goblin Guide"), "pauper");
  assert.deepEqual(errors(goblin), ["not-legal"]);
  assert.equal(firstError(goblin), "Not legal in Pauper: Goblin Guide.");
  const swift = check(edit(DECKS.pauper, "16 Mountain", "12 Mountain\n4 Monastery Swiftspear"), "pauper");
  assert.equal(firstError(swift), "Banned in Pauper: Monastery Swiftspear.");
});

test("Pauper: legal through a common printing, so a list that NAMES an uncommon or rare printing gets a note, never an error; a bare name says nothing", () => {
  const named_ = check(DECKS.pauper, "pauper", { "Lava Spike": "U", Fireblast: "U", "Lightning Bolt": "C", Mountain: "L" });
  assert.equal(named_.ok, true, "the note is not an error");
  assert.deepEqual(codes(named_), ["pauper-rarity"]);
  assert.deepEqual(named(named_, "pauper-rarity"), ["Lava Spike", "Fireblast"], "a common and a basic land are not named");
  assert.deepEqual(codes(check(DECKS.pauper, "pauper")), [], "no printing named: nothing to say");
  assert.deepEqual(codes(check(DECKS.modern, "modern", { "Lava Spike": "U" })), [], "the note is Pauper's");
});

// ══ Commander: a real 100 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("Commander: Atraxa's deck is a commander and 99 singleton cards inside white, blue, black and green", () => {
  const r = check(DECKS.atraxa, "commander");
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { main: 99, side: 0, commander: 1, companion: 0, deck: 100 });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.commanders, ["Atraxa, Praetors' Voice"]);
  assert.equal(r.identity, W | U | B | G);
  assert.equal(r.identity, 23);
  assert.equal(deckIdentity([ruleOracle("Atraxa, Praetors' Voice")]), 23);
  assert.equal(commanderEligible("commander", ruleOracle("Atraxa, Praetors' Voice")), true);
});

test("Commander: a red card outside the colours, a banned card, a second Sol Ring, 99 cards and no commander each say so", () => {
  const swampOut = (to: string | null) => edit(DECKS.atraxa, "7 Swamp", to);
  const bolt = check(swampOut("6 Swamp\n1 Lightning Bolt"), "commander");
  assert.deepEqual(errors(bolt), ["identity"]);
  assert.equal(firstError(bolt), "Outside the commander's colour identity: Lightning Bolt.");
  const crypt = check(swampOut("6 Swamp\n1 Mana Crypt"), "commander");
  assert.deepEqual(errors(crypt), ["banned"], "Mana Crypt is banned in Commander (colourless, so inside every identity)");
  assert.equal(firstError(crypt), "Banned in Commander: Mana Crypt.");
  const rings = check(swampOut("6 Swamp\n1 Sol Ring"), "commander");
  assert.deepEqual(errors(rings), ["copies"]);
  assert.deepEqual(named(rings, "copies"), ["Sol Ring (2)"]);
  assert.match(firstError(rings)!, /singleton format: one copy of each card, except basic lands/);
  const short = check(swampOut("6 Swamp"), "commander");
  assert.deepEqual(errors(short), ["size"]);
  assert.match(firstError(short)!, /exactly 100 cards, the commander included \(this list has 99\)/);
  const none = check(edit(DECKS.atraxa, "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n", "1 Atraxa, Praetors' Voice\n"), "commander");
  assert.deepEqual(errors(none), ["no-commander"], "Atraxa in the main deck is a card, not a commander");
  assert.equal(none.identity, null);
});

test("Commander: ten Forests are fine (basic lands), a colourless card fits any identity, and a Wastes is a basic", () => {
  assert.equal(check(edit(DECKS.atraxa, "7 Swamp", "6 Swamp\n1 Wastes"), "commander").ok, true);
  assert.equal(check(edit(DECKS.atraxa, "7 Swamp", "6 Swamp\n1 Snow-Covered Island"), "commander").ok, true);
  assert.ok(identityFits(0, 23), "the empty identity fits everything");
  assert.ok(!identityFits(R, W | U | B | G));
});

test("who may lead: a legendary creature (flag), not an artifact, a land or a planeswalker; Brawl also takes a planeswalker; Oathbreaker needs one", () => {
  const eligible = (f: Format, n: string) => commanderEligible(f, ruleOracle(n));
  for (const n of ["Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King", "Sheoldred, the Apocalypse", "Thrasios, Triton Hero"]) assert.equal(eligible("commander", n), true, n);
  for (const n of ["Sol Ring", "Gaea's Cradle", "Lightning Bolt", "Chandra, Torch of Defiance", "Jace, the Mind Sculptor", "Relentless Rats"]) assert.equal(eligible("commander", n), false, n);
  assert.equal(eligible("duel", "Atraxa, Praetors' Voice"), true);
  assert.equal(eligible("brawl", "Chandra, Torch of Defiance"), true, "Brawl: a planeswalker may lead");
  assert.equal(eligible("standardbrawl", "Jace, the Mind Sculptor"), true);
  assert.equal(eligible("brawl", "Sol Ring"), false);
  assert.equal(eligible("oathbreaker", "Chandra, Torch of Defiance"), true);
  assert.equal(eligible("oathbreaker", "Atraxa, Praetors' Voice"), false, "Oathbreaker: a planeswalker, not a creature");
  assert.ok((ruleOracle("Atraxa, Praetors' Voice").flags & ORACLE_FLAGS.COMMANDER) !== 0);
  // Pauper Commander: a creature that is legal there, or whose printing is an uncommon or a common
  assert.equal(commanderEligible("paupercommander", ruleOracle("Atraxa, Praetors' Voice"), "M"), false, "a mythic creature cannot lead");
  assert.equal(commanderEligible("paupercommander", ruleOracle("Ravenous Chupacabra"), "U"), true, "printed at uncommon");
  assert.equal(commanderEligible("paupercommander", ruleOracle("Ravenous Chupacabra"), "R"), false);
  assert.equal(commanderEligible("paupercommander", ruleOracle("Lightning Bolt"), "C"), false, "an instant is not a creature");
});

test("a commander that cannot lead is named, whatever else the list does right", () => {
  const cradle = check(edit(DECKS.atraxa, "1 Atraxa, Praetors' Voice", "1 Gaea's Cradle"), "commander");
  assert.ok(errors(cradle).includes("bad-commander"), "a land cannot lead");
  assert.equal(cradle.issues.find((i) => i.code === "bad-commander")!.message, "Gaea's Cradle can't be a Commander commander.");
  assert.equal(cradle.identity, G, "the identity is still the commander's, so the rest of the deck is outside it");
  assert.ok(errors(cradle).includes("identity"));
});

test("the sideboard of a Commander list is no part of the deck: noted, not counted, not judged for size", () => {
  const withSide = check(`${DECKS.atraxa}\n\nSideboard\n1 Lightning Bolt`, "commander");
  assert.equal(withSide.ok, true);
  assert.equal(withSide.counts.side, 1);
  assert.equal(withSide.counts.deck, 100);
  assert.deepEqual(codes(withSide), ["side-size"]);
  assert.equal(withSide.issues[0]!.level, "note");
});

// ══ Pauper Commander: the commander is the one card that may be printed at uncommon ════════════════════════════════════════════════════════════════════

/** A Pauper Commander list: the commander and 99 cards of the colours it allows (a real Mind Stone, and basics for the rest). */
const pdh = (commander: string, rarity: string | null, main: [string, number][]): DeckEntry[] => [
  { key: entryKey(ruleOracle(commander), commander), name: commander, qty: 1, zone: "commander", oracle: ruleOracle(commander), rarity },
  ...main.map(([n, qty]): DeckEntry => ({ key: entryKey(ruleOracle(n), n), name: n, qty, zone: "main", oracle: ruleOracle(n), rarity: null })),
];

test("Pauper Commander: Scryfall marks an uncommon-only creature not legal in the 99, yet it may lead: the commander slot is not judged by the legality of the 99", () => {
  const chupacabra = ruleOracle("Ravenous Chupacabra");
  assert.equal(legalityOf(chupacabra.legal, "paupercommander"), "not_legal", "the published fact: no common printing, so not legal in the 99");
  const led = checkDeck("paupercommander", pdh("Ravenous Chupacabra", "U", [["Mind Stone", 1], ["Swamp", 98]]));
  assert.equal(led.ok, true);
  assert.deepEqual(led.issues, []);
  assert.deepEqual(led.commanders, ["Ravenous Chupacabra"]);
  assert.equal(led.identity, B);
  assert.deepEqual(led.counts, { main: 99, side: 0, commander: 1, companion: 0, deck: 100 });
});

test("Pauper Commander: a commander that was never printed at uncommon or common, or one of the 99 that was only uncommon, is refused by name", () => {
  const unknown = checkDeck("paupercommander", pdh("Ravenous Chupacabra", null, [["Mind Stone", 1], ["Swamp", 98]]));
  assert.deepEqual(errors(unknown), ["not-legal", "bad-commander"], "no printing known: it cannot lead, and it is not legal in the 99 either");
  assert.equal(unknown.issues.find((i) => i.code === "bad-commander")!.message, "Ravenous Chupacabra can't be a Pauper Commander commander.");
  const mythic = checkDeck("paupercommander", pdh("Atraxa, Praetors' Voice", "M", [["Mind Stone", 1], ["Swamp", 98]]));
  assert.ok(errors(mythic).includes("bad-commander") && errors(mythic).includes("not-legal"), "a mythic-only creature cannot lead");
  const twice = checkDeck("paupercommander", pdh("Ravenous Chupacabra", "U", [["Ravenous Chupacabra", 1], ["Swamp", 98]]));
  assert.deepEqual(errors(twice), ["not-legal", "copies"], "the same uncommon creature among the 99 is not legal there, and it is a second copy");
  assert.deepEqual(named(twice, "not-legal"), ["Ravenous Chupacabra"]);
  const bolt = checkDeck("paupercommander", pdh("Ravenous Chupacabra", "U", [["Lightning Bolt", 1], ["Swamp", 98]]));
  assert.deepEqual(errors(bolt), ["identity"], "a red card under a black commander; Lightning Bolt itself is legal in Pauper Commander");
});

test("which commanders the rules must read the printings of: a Pauper Commander creature that is not legal in the 99, and nobody else", () => {
  const as = (zone: DeckEntry["zone"], name: string): Pick<DeckEntry, "zone" | "oracle"> => ({ zone, oracle: ruleOracle(name) });
  assert.equal(commanderNeedsPrintings("paupercommander", as("commander", "Ravenous Chupacabra")), true);
  assert.equal(commanderNeedsPrintings("paupercommander", as("commander", "Atraxa, Praetors' Voice")), true, "asked, and the answer is no: only mythic printings");
  assert.equal(commanderNeedsPrintings("paupercommander", as("commander", "Sakura-Tribe Elder")), false, "legal in the 99 (printed at common): nothing to ask");
  assert.equal(commanderNeedsPrintings("paupercommander", as("commander", "Lightning Bolt")), false, "not a creature");
  assert.equal(commanderNeedsPrintings("paupercommander", as("main", "Ravenous Chupacabra")), false, "the 99 are legal or they are not");
  assert.equal(commanderNeedsPrintings("commander", as("commander", "Ravenous Chupacabra")), false);
  assert.equal(commanderNeedsPrintings("paupercommander", { zone: "commander", oracle: null }), false);
});

// ══ partners ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const pair = (a: string, b: string, format: Format = "commander") => checkDeck(format, entriesFor(`Commander\n1 ${a}\n1 ${b}`));
const notSize = (r: DeckReport) => errors(r).filter((c) => c !== "size");

test("Partner: two plain partners share the slot and their colours add up; a partner with a non-partner does not", () => {
  const r = pair("Thrasios, Triton Hero", "Tymna the Weaver");
  assert.deepEqual(notSize(r), []);
  assert.equal(r.identity, U | G | W | B);
  assert.deepEqual(r.commanders, ["Thrasios, Triton Hero", "Tymna the Weaver"]);
  assert.equal(canPair(ruleOracle("Thrasios, Triton Hero"), ruleOracle("Tymna the Weaver")), true);
  assert.equal(canPair(ruleOracle("Tymna the Weaver"), ruleOracle("Thrasios, Triton Hero")), true, "order does not matter");
  assert.deepEqual(notSize(pair("Atraxa, Praetors' Voice", "Tymna the Weaver")), ["partner"]);
  assert.match(pair("Atraxa, Praetors' Voice", "Tymna the Weaver").issues.find((i) => i.code === "partner")!.message, /can't be commanders together/);
  assert.equal(partnerKind(ruleOracle("Thrasios, Triton Hero")).plain, true);
  assert.equal(partnerKind(ruleOracle("Atraxa, Praetors' Voice")).plain, false);
});

test("Partner with: Pir and Toothy name each other and nobody else", () => {
  const pir = ruleOracle("Pir, Imaginative Rascal"), toothy = ruleOracle("Toothy, Imaginary Friend");
  assert.equal(partnerKind(pir).mate, "toothy imaginary friend");
  assert.equal(partnerKind(pir).plain, false, "a Partner-with card is not a plain partner");
  assert.deepEqual(notSize(pair("Pir, Imaginative Rascal", "Toothy, Imaginary Friend")), []);
  assert.deepEqual(notSize(pair("Pir, Imaginative Rascal", "Thrasios, Triton Hero")), ["partner"], "Pir may not pair with another plain partner");
  assert.deepEqual(notSize(pair("Toothy, Imaginary Friend", "Tymna the Weaver")), ["partner"]);
  assert.equal(canPair(pir, toothy), true);
});

test("Choose a Background pairs a creature with a Background and nothing else; two Backgrounds are not a pair", () => {
  assert.equal(partnerKind(ruleOracle("Wilson, Refined Grizzly")).chooseBackground, true);
  assert.equal(partnerKind(ruleOracle("Acolyte of Bahamut")).background, true);
  for (const bg of ["Acolyte of Bahamut", "Raised by Giants"]) assert.deepEqual(notSize(pair("Wilson, Refined Grizzly", bg)), [], bg);
  assert.equal(pair("Wilson, Refined Grizzly", "Raised by Giants").identity, G, "the Background's colours add to the creature's");
  assert.deepEqual(notSize(pair("Wilson, Refined Grizzly", "Tymna the Weaver")), ["partner"]);
  assert.deepEqual(notSize(pair("Acolyte of Bahamut", "Raised by Giants")), ["partner"]);
  assert.deepEqual(notSize(pair("Atraxa, Praetors' Voice", "Acolyte of Bahamut")), ["partner"], "a creature without 'Choose a Background' has no Background");
});

test("Doctor's companion pairs with a Time Lord Doctor", () => {
  assert.equal(partnerKind(ruleOracle("Rose Tyler")).doctorsCompanion, true);
  assert.equal(partnerKind(ruleOracle("The Tenth Doctor")).timeLordDoctor, true);
  assert.deepEqual(notSize(pair("Rose Tyler", "The Tenth Doctor")), []);
  assert.deepEqual(notSize(pair("Rose Tyler", "Thrasios, Triton Hero")), ["partner"]);
  assert.deepEqual(notSize(pair("Rose Tyler", "Rose Tyler")), ["copies", "partner"], "one card twice is a second copy, not a second commander");
});

test("three commanders, or two that were not read, are not a deck", () => {
  const three = checkDeck("commander", entriesFor("Commander\n1 Thrasios, Triton Hero\n1 Tymna the Weaver\n1 Atraxa, Praetors' Voice"));
  assert.ok(errors(three).includes("partner"));
  assert.match(three.issues.find((i) => i.code === "partner")!.message, /one commander, or two that are partners \(this one has 3\)/);
});

// ══ other commander-style formats ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("Oathbreaker: one planeswalker and one instant or sorcery whose colours fit; Standard Brawl is 60", () => {
  const oath = (a: string, b: string) => checkDeck("oathbreaker", entriesFor(`Commander\n1 ${a}\n1 ${b}`));
  const ok = oath("Chandra, Torch of Defiance", "Lightning Bolt");
  assert.deepEqual(notSize(ok), []);
  assert.equal(ok.identity, R, "the Oathbreaker's identity");
  assert.deepEqual(notSize(oath("Jace, the Mind Sculptor", "Lightning Bolt")), ["signature-spell"], "a red spell under a blue Oathbreaker");
  assert.deepEqual(notSize(oath("Atraxa, Praetors' Voice", "Lightning Bolt")), ["bad-commander"]);
  assert.deepEqual(notSize(oath("Chandra, Torch of Defiance", "Mind Stone")), ["bad-commander"], "an artifact is not a signature spell");
  assert.equal(DECK_FORMATS.standardbrawl.min, 60);
  assert.match(firstError(checkDeck("standardbrawl", entriesFor("Commander\n1 Chandra, Torch of Defiance\n\nDeck\n20 Mountain")))!, /exactly 60 cards, the commander included \(this list has 21\)/);
});

test("MTGO and Moxfield text exports file the commander in the sideboard: it is read from there, once, and said so", () => {
  const side = `${edit(DECKS.atraxa, "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n", "")}\n\nSideboard\n1 Atraxa, Praetors' Voice`;
  const entries = entriesFor(side);
  const { entries: moved, inferred } = inferCommanders("commander", entries);
  assert.deepEqual(inferred, ["Atraxa, Praetors' Voice"]);
  assert.equal(moved.filter((e) => e.zone === "commander").length, 1);
  const r = checkDeck("commander", entries);
  assert.equal(r.ok, true);
  assert.deepEqual(r.commanders, ["Atraxa, Praetors' Voice"]);
  assert.deepEqual(codes(r), ["inferred"]);
  const off = checkDeck("commander", entries, { inferCommander: false });
  assert.deepEqual(errors(off), ["size", "no-commander"], "inference can be switched off: no commander, and so 99 cards");
  assert.deepEqual(inferCommanders("modern", entries).inferred, [], "a format without a commander never infers one");
  assert.deepEqual(inferCommanders("commander", entriesFor("Commander\n1 Atraxa, Praetors' Voice\n\nSideboard\n1 Tymna the Weaver")).inferred, [], "a commander already named is not replaced");
});

test("an inferred pair: the partner beside the commander in the sideboard", () => {
  const { inferred } = inferCommanders("commander", entriesFor("Sideboard\n1 Thrasios, Triton Hero\n1 Tymna the Weaver\n\nDeck\n98 Island"));
  assert.deepEqual(inferred, ["Thrasios, Triton Hero", "Tymna the Weaver"]);
});

test("a maybeboard is neither counted nor judged", () => {
  const entries = entriesFor(DECKS.modern);
  const maybe: DeckEntry = { key: "n:mana crypt", name: "Mana Crypt", qty: 1, zone: "maybe", oracle: ruleOracle("Mana Crypt") };
  assert.equal(checkDeck("modern", [...entries, maybe]).ok, true);
});

test("a real deck judged in every format at once: only the format changes the verdict, never a crash", () => {
  for (const f of FORMATS) {
    const r = checkDeck(f, entriesFor(DECKS.modern));
    assert.equal(r.format, f);
    assert.ok(Array.isArray(r.issues));
  }
});
