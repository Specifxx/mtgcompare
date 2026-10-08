// The Magic vocabulary of src/lib/constants.ts (owner WP01a). Persisted lists are APPEND-ONLY: the published catalogue files and the Neon rows store keys, letters and bit positions
// (Card.treat, Oracle.legal, Card.flags, the price mask, Card.ptype), so a reordering corrupts data that already exists. Each list is pinned here as a PREFIX: appending a key at the end passes
// the order test and fails the count test next to it, which is the prompt to extend the pin (and to say so in DECISIONS). Everything else is checked against the real catalogue: the 454
// TCGCSV groups of tests/fixtures/tcgcsv-groups.json, real product names, real Scryfall type lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "../src/lib/constants";
import * as Co from "../src/lib/country";
import { HISTORY_MARKETS } from "../src/lib/history";

const groups: { groupId: number; name: string; abbreviation: string; publishedOn: string; kind: string }[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/tcgcsv-groups.json"), "utf8"));
const prefixIs = (actual: readonly unknown[], pinned: readonly unknown[], what: string): void => assert.deepEqual(actual.slice(0, pinned.length), pinned, `${what}: persisted lists are append-only`);

// ── persisted lists ──
const TREATMENT_PIN = [
  "borderless", "extended", "showcase", "scroll", "sketch", "retro", "inverted", "fullart", "anime", "poster", "concept", "stainedglass", "shatteredglass", "jp", "phyrexian", "schematic", "futuresight", "whiteborder", "nopw", "display", "ce", "ie",
  "prerelease", "promopack", "thelist", "specialguest", "secretlair", "buyabox", "bundle", "launch", "gameday", "fnm", "judge", "arenaleague", "wpn", "datestamped", "stamped", "placing", "planechase", "archenemy", "sb", "serial",
  "etched", "surge", "galaxy", "ripple", "rainbow", "doublerainbow", "textured", "halo", "fracture", "confetti", "raised", "compleat", "gilded", "silverscroll", "silverfoil", "manafoil", "neon", "oilslick", "invisible", "facet", "firstplace", "embossed", "otherfoil",
  "lang-es", "lang-it", "lang-fr", "lang-de", "lang-ja", "lang-pt", "lang-ko", "lang-zh", "lang-ru",
];
test("the treatment keys keep their order and their number (74 today; an append extends this pin)", () => {
  prefixIs(C.TREATMENT_KEYS, TREATMENT_PIN, "TREATMENT_KEYS");
  assert.equal(C.TREATMENT_KEYS.length, 74);
  assert.equal(new Set(C.TREATMENT_KEYS).size, C.TREATMENT_KEYS.length, "keys are unique");
  assert.ok(C.TREATMENT_KEYS.every((k) => /^[a-z][a-z-]*$/.test(k)), "a key is a lower-case word; there are no raw: keys");
});
test("treatments: 9 frame, 8 art, 5 edition, 19 promo, 1 serial, 23 foil pattern, 9 language; 13 hidden, 33 chase, 22 with a Scryfall implication", () => {
  const by: Record<string, number> = {};
  for (const t of C.TREATMENTS) by[t.kind] = (by[t.kind] ?? 0) + 1;
  assert.deepEqual(by, { frame: 9, art: 8, edition: 5, promo: 19, serial: 1, foil: 23, language: 9 });
  assert.deepEqual(C.TREATMENTS.filter((t) => t.hidden).map((t) => t.key), ["nopw", "placing", "sb", "otherfoil", "lang-es", "lang-it", "lang-fr", "lang-de", "lang-ja", "lang-pt", "lang-ko", "lang-zh", "lang-ru"]);
  assert.equal(C.TREATMENTS.filter((t) => t.chase).length, 33);
  assert.equal(C.TREATMENTS.filter((t) => t.sf.length > 0).length, 22);
  assert.equal(C.FOIL_PATTERN_KEYS.size, 23);
  assert.ok(C.TREATMENTS.every((t) => t.foil === (t.kind === "foil")), "foil: true exactly for the foil patterns");
});
test("synonyms: 128 folded phrases, no phrase belongs to two keys, only the three group-derived promo keys have none", () => {
  assert.equal(C.TREATMENT_BY_SYNONYM.size, 128);
  const seen = new Map<string, string>();
  for (const t of C.TREATMENTS) for (const s of t.syn) {
    const folded = C.fold(s.replace(/\*$/, "")) + (s.endsWith("*") ? " *" : "");
    assert.ok(!seen.has(folded) || seen.get(folded) === t.key, `"${s}" is claimed by ${seen.get(folded)} and ${t.key}`);
    seen.set(folded, t.key);
    assert.equal(C.TREATMENT_BY_SYNONYM.get(folded), t.key);
  }
  assert.deepEqual(C.TREATMENTS.filter((t) => t.syn.length === 0).map((t) => t.key), ["thelist", "specialguest", "secretlair"]);
  assert.equal(C.TREATMENT_BY_SYNONYM.get("neon ink *"), "neon", "a trailing * is a prefix synonym");
  for (const w of C.IGNORED_FINISH_WORDS) assert.ok(!C.TREATMENT_BY_SYNONYM.has(C.fold(w)), `the finish word "${w}" is never a treatment`);
});
test("rule S: a Scryfall fact implies a key only when its kind is frame, art, serial, edition or promo; never a foil pattern, retro, futuresight or whiteborder", () => {
  const facts = new Map<string, string>();
  for (const t of C.TREATMENTS) {
    for (const f of t.sf) {
      assert.ok(["frame", "art", "serial", "edition", "promo"].includes(t.kind), `${t.key} (${t.kind}) must not carry a Scryfall fact`);
      assert.match(f, /^(border|frame|promo|flag):[a-z_]+$/, f);
      assert.ok(!facts.has(f), `${f} implies two keys: ${facts.get(f)} and ${t.key}`);
      facts.set(f, t.key);
    }
  }
  for (const k of ["retro", "futuresight", "whiteborder", "etched"]) assert.deepEqual(C.TREATMENT_BY_KEY[k]!.sf, [], `${k} is a property of the product name, not of a Scryfall fact`);
  assert.equal(facts.size, 23);
});
test("hidden keys and the OP-compatible views: PRINTINGS has `standard` first, then every key in vocabulary order; printingOf picks the first key by that order", () => {
  assert.deepEqual(C.PRINTING_KEYS, ["standard", ...C.TREATMENT_KEYS]);
  assert.equal(C.printingOf([]), "standard");
  assert.equal(C.printingOf(["galaxy", "borderless"]), "borderless");
  assert.equal(C.joinTreat(["galaxy", "borderless", "galaxy"]), "borderless galaxy", "sorted by vocabulary order, de-duplicated");
  assert.deepEqual(C.parseTreat("borderless nope galaxy"), ["borderless", "galaxy"], "an unknown key in a stored string is dropped, never kept");
});

const FORMAT_PIN = ["standard", "future", "historic", "timeless", "gladiator", "pioneer", "modern", "legacy", "pauper", "vintage", "penny", "commander", "oathbreaker", "standardbrawl", "brawl", "competitivebrawl", "alchemy", "paupercommander", "duel", "premodern", "predh", "tlr"];
test("the 22 formats keep their position (Oracle.legal is one character per format) and every one has a label; oldschool is not stored", () => {
  prefixIs(C.FORMATS, FORMAT_PIN, "FORMATS");
  assert.equal(C.FORMATS.length, 22);
  for (const f of C.FORMATS) { assert.ok(C.FORMAT_LABEL[f], f); assert.equal(C.FORMAT_INDEX[f], FORMAT_PIN.indexOf(f)); }
  assert.ok(!(C.FORMATS as readonly string[]).includes("oldschool"));
  assert.ok(C.FORMAT_UI.every((f) => (C.FORMATS as readonly string[]).includes(f)) && !(C.FORMAT_UI as readonly string[]).includes("tlr"), "tlr is hidden from the UI list");
});
test("flag bits: Card.flags is a smallint (bits 0 to 13, bit 15 never used); the price mask has 13 bits; the oracle flags 6; none overlaps", () => {
  prefixIs(Object.keys(C.CARD_FLAGS), ["ETCHED", "SERIAL", "PROMO", "FULLART", "DFC", "SCRYIMG", "TCGIMG", "JOINED", "FUTURE", "FOILONLY", "STAR", "NOTPLAY", "UB", "LOWRES"], "CARD_FLAGS");
  assert.deepEqual(Object.values(C.CARD_FLAGS), [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
  prefixIs(Object.keys(C.PRICE_MASK), ["HASN", "HASF", "HEADF", "TRACKN", "TRACKF", "LOWN", "LOWF", "GONE", "LISTED", "TOP", "CHEAP", "THIN", "GONEP"], "PRICE_MASK");
  assert.deepEqual(Object.values(C.PRICE_MASK), [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);
  prefixIs(Object.keys(C.ORACLE_FLAGS), ["RESERVED", "GAME_CHANGER", "COMMANDER", "PARTNER", "BACKGROUND", "CHOOSE_BACKGROUND"], "ORACLE_FLAGS");
  assert.deepEqual(Object.values(C.ORACLE_FLAGS), [1, 2, 4, 8, 16, 32]);
  for (const table of [C.CARD_FLAGS, C.PRICE_MASK, C.ORACLE_FLAGS]) {
    const bits = Object.values(table);
    assert.equal(new Set(bits).size, bits.length);
    assert.ok(bits.every((b) => b > 0 && (b & (b - 1)) === 0 && b < 32768), "single bits below 2^15");
  }
  assert.equal(C.trackedBits(C.PRICE_MASK.TRACKN | C.PRICE_MASK.TRACKF), 3);
  assert.equal(C.trackedBits(C.PRICE_MASK.TRACKF), 2);
});
test("small persisted lists: classes, link levels, conditions, store ids, rarities, primary types, sealed kinds, set kinds, finishes", () => {
  assert.deepEqual(C.CARD_CLASS, { CARD: 0, TOKEN: 1, ART: 2, OVERSIZED: 3, HELPER: 4 });
  assert.deepEqual(C.LINK, { NONE: 0, ID: 1, ETCHED: 2, FALLBACK: 3, VARIANT: 4, ORACLE_NAME: 5 });
  assert.deepEqual(C.CONDITIONS, ["NM", "LP", "MP", "HP", "DMG"]);
  assert.deepEqual(C.STORE_ID, { TCGPLAYER_VIRTUAL: 0, EBAY_BASE: 1, FEED_BASE: 8, REGISTRY_MIN: 10, MAX: 32767 });
  assert.equal(C.STALE_HOURS, 72);
  assert.deepEqual(C.RARITY_KEYS, ["M", "R", "U", "C", "S", "P", "L", "T"]);
  assert.deepEqual(C.PRIMARY_TYPES, ["creature", "planeswalker", "battle", "land", "artifact", "enchantment", "instant", "sorcery", "kindred", "other"]);
  assert.deepEqual(C.SEALED_KINDS, ["Booster Box", "Case", "Booster Pack", "Bundle", "Commander Deck", "Prerelease Pack", "Starter Product", "Secret Lair Drop", "Collection & Gift", "Tin & Box Set", "Other"]);
  assert.deepEqual(C.SET_KIND_KEYS, ["expansion", "core", "masters", "commander", "deck", "secret-lair", "list", "promo", "promo-pack", "gold-border", "unset", "art-series", "oversized"]);
  assert.deepEqual(C.FINISH_KEYS, ["N", "F"]);
  assert.deepEqual(C.FINISH_INDEX, { N: 0, F: 1 });
});
test("RARITIES and SET_KINDS are Record<string, Info> like OP's: any string indexes them; L is Land and T is Token; Leader and DON!! are gone", () => {
  const byString: Record<string, C.RarityInfo> = C.RARITIES;
  assert.equal(byString["M"]!.label, "Mythic Rare");
  assert.equal(byString["L"]!.label, "Basic Land");
  assert.equal(byString["SEC"], undefined);
  assert.equal(C.SET_KINDS["booster"], undefined);
  assert.deepEqual(Object.keys(C.RARITIES), [...C.RARITY_KEYS]);
  assert.deepEqual(Object.keys(C.RARITIES).map((k) => C.RARITIES[k]!.order), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(C.rarityLabel("U"), "Uncommon");
  assert.equal(C.rarityLabel(null), "—");
  assert.ok(C.isRarity("T") && !C.isRarity("UC"));
  assert.deepEqual(C.RARITY_KEYS.map((k) => C.RARITY_SLUGS[k]), ["mythic", "rare", "uncommon", "common", "special", "promo", "land", "token"]);
  assert.deepEqual(Object.fromEntries(Object.entries(C.SCRYFALL_RARITY)), { common: "C", uncommon: "U", rare: "R", mythic: "M", special: "S", bonus: "S" });
});

// ── the real groups ──
test("classifyGroup reproduces the kind of all 454 real TCGCSV groups; the counts per kind are the ones the contract quotes", () => {
  assert.equal(groups.length, 454);
  const wrong = groups.filter((g) => C.classifyGroup(g) !== g.kind).map((g) => `${g.name}: ${C.classifyGroup(g)} != ${g.kind}`);
  assert.deepEqual(wrong, []);
  const by: Record<string, number> = {};
  for (const g of groups) by[g.kind] = (by[g.kind] ?? 0) + 1;
  assert.deepEqual(by, { expansion: 127, deck: 73, masters: 52, commander: 43, "art-series": 39, promo: 36, "promo-pack": 28, core: 20, unset: 8, "secret-lair": 6, "gold-border": 4, list: 2, oversized: 1, foreign: 8, "non-card": 7 });
  const included = groups.filter((g) => g.kind !== "foreign" && g.kind !== "non-card");
  assert.equal(included.length, 439);
  assert.equal(included.filter((g) => C.isBucketGroup(g)).length, 31, "31 rolling-date bucket groups");
  assert.ok(included.filter((g) => C.isBucketGroup(g)).every((g) => ["promo", "promo-pack", "list", "secret-lair", "deck", "oversized", "gold-border", "unset", "masters", "expansion", "commander", "core"].includes(g.kind)));
});
test("classifyGroup decides on the NAME, first rule wins: real names that straddle two rules", () => {
  const kind = (name: string, publishedOn?: string): string => C.classifyGroup({ name, publishedOn });
  assert.equal(kind("Commander Legends: Battle for Baldur's Gate"), "masters", "Commander Legends is a Masters-style set, not a Commander product");
  assert.equal(kind("Commander: Murders at Karlov Manor"), "commander");
  assert.equal(kind("Mystery Booster Commander Edition"), "masters");
  assert.equal(kind("Planechase: Universes Beyond: Doctor Who"), "deck");
  assert.equal(kind("Promo Pack: Reality Fracture"), "promo-pack");
  assert.equal(kind("Secret Lair Drop Series"), "secret-lair");
  assert.equal(kind("Mystery Booster 2 Playtest Cards"), "unset");
  assert.equal(kind("Collector's Edition"), "gold-border");
  assert.equal(kind("Art Series: Reality Fracture"), "art-series");
  assert.equal(kind("Oversize Cards"), "oversized");
  assert.equal(kind("Foreign Black Border"), "foreign");
  assert.equal(kind("Box Sets"), "non-card");
  assert.equal(kind("Reality Fracture"), "expansion", "everything else is an expansion");
  assert.equal(kind("A Brand New Bucket", "2026-10-07T00:00:00.123Z"), "promo", "an unnamed rolling-date group is a promo bucket");
  assert.equal(kind("A Brand New Bucket", "2026-10-07T00:00:00"), "expansion", "a real release date is not a bucket");
});
test("hidden set kinds are art-series and oversized only; collectibles stay visible and their printings are not tournament-legal as printed", () => {
  assert.deepEqual(C.HIDDEN_SET_KINDS, ["art-series", "oversized"]);
  assert.deepEqual(C.SET_KIND_KEYS.filter((k) => C.SET_KINDS[k]!.hidden), [...C.HIDDEN_SET_KINDS]);
  assert.ok(C.isHiddenKind("art-series") && !C.isHiddenKind("gold-border") && !C.isHiddenKind("unset"));
  assert.deepEqual(C.NOTPLAY_SET_KINDS, ["gold-border", "unset", "art-series", "oversized"]);
  assert.deepEqual(C.MAIN_SET_KINDS, ["expansion", "core", "masters"]);
  assert.deepEqual(C.RELEASE_SET_KINDS, ["expansion", "core", "masters", "commander"]);
  assert.deepEqual(C.TRACKER_SET_KINDS, ["expansion", "core", "masters", "commander", "deck", "secret-lair", "list"]);
  for (const k of C.SET_KIND_KEYS) assert.equal(C.SET_KINDS[k]!.order, C.SET_KIND_KEYS.indexOf(k));
});
test("group-derived treatments: the group IS the treatment where the product name has no word for it (real group names)", () => {
  const of = (name: string): string | null => C.GROUP_TREATMENTS.find(([rx]) => rx.test(name))?.[1] ?? null;
  assert.equal(of("Prerelease Cards"), "prerelease");
  assert.equal(of("Promo Pack: Reality Fracture"), "promopack");
  assert.equal(of("The List Reprints"), "thelist");
  assert.equal(of("Special Guests"), "specialguest");
  assert.equal(of("Secret Lair Drop Series"), "secretlair");
  assert.equal(of("SLX Cards"), "secretlair");
  assert.equal(of("Buy-A-Box Promos"), "buyabox");
  assert.equal(of("Collector's Edition"), "ce");
  assert.equal(of("International Edition"), "ie");
  assert.equal(of("Modern Horizons 3"), null);
  const matched = groups.filter((g) => of(g.name) !== null);
  assert.equal(matched.length, 46, "46 of the 454 real groups give their products a treatment");
  assert.ok(matched.every((g) => (C.TREATMENT_KEYS as readonly string[]).includes(of(g.name)!)));
});

// ── sealed kinds (real product names of the 2026-10-07 TCGCSV snapshot) ──
test("sealedKind: first rule wins on the lower-cased name; real products of every kind", () => {
  const real: [string, C.SealedKind][] = [
    ["Star Trek - Play Booster Pack", "Booster Pack"],
    ["Star Trek - Play Booster Display", "Booster Box"],
    ["Double Masters 2022 - Collector Booster Display", "Booster Box"],
    ["Magic: The Gathering Foundations - Jumpstart Booster Display Case", "Case"],
    ["Streets of New Capenna - Theme Booster Display Case", "Case"],
    ["Commander Legends: Battle for Baldur's Gate - Bundle", "Bundle"],
    ["Avacyn Restored - Fat Pack", "Bundle"],
    ["Modern Horizons 3 Commander Deck - Tricky Terrain", "Commander Deck"],
    ["Strixhaven: School of Mages - Prerelease Pack [Quandrix]", "Prerelease Pack"],
    ["Secret Lair Drop: Legendary Flyers (Not That Kind) - Traditional Foil Edition", "Secret Lair Drop"],
    ["Reality Fracture - Secret Lair Bundle", "Secret Lair Drop"],
    ["Marvel Super Heroes Commander Kit - Doom Prevails", "Starter Product"],
    ["Eldritch Moon - Intro Pack - Shallow Graves", "Starter Product"],      // a 60-card deck and two boosters: not a booster pack (172 such products)
    ["Journey Into Nyx - Intro Pack - The Wilds and the Deep", "Starter Product"],
    ["Streets of New Capenna - Theme Booster [Obscura]", "Booster Pack"],
    ["Reality Fracture - Promo Pack", "Booster Pack"],
    ["Torment - Theme Deck - Waking Nightmares", "Starter Product"],
    ["Teenage Mutant Ninja Turtles - Tin (Michelangelo)", "Tin & Box Set"],
    ["Duel Decks: Izzet vs. Golgari - Box Set", "Tin & Box Set"],
    ["Ravnica: Clue Edition", "Collection & Gift"],
    ["Amonkhet Land Station", "Other"],
    ["Star Trek - Draft Night", "Other"],
  ];
  for (const [name, kind] of real) assert.equal(C.sealedKind(name), kind, name);
  assert.equal(C.sealedKindSlug("Tin & Box Set"), "tin-and-box-set");
  assert.equal(C.sealedKindSlug("Booster Box"), "booster-box");
  assert.equal(C.SEALED_RULES.length, 11, "eleven rules; Other is the remainder");
});

// ── text primitives ──
test("fold is the one normaliser of search, join and match: accents, ligatures, apostrophes and punctuation", () => {
  assert.equal(C.fold("Æther Vial"), "aether vial");
  assert.equal(C.fold("Lim-Dûl's Vault"), "lim duls vault");
  assert.equal(C.fold("Jötun Grunt"), "jotun grunt");
  assert.equal(C.fold("Dandân"), "dandan");
  assert.equal(C.fold("Sheoldred, the Apocalypse"), "sheoldred the apocalypse");
  assert.equal(C.fold("Kayla’s Music Box"), "kaylas music box");
  assert.equal(C.fold("Who // What // When // Where // Why"), "who what when where why");
  assert.equal(C.fold(null), "");
  assert.equal(C.fold(undefined), "");
});

// ── collector numbers: nkey is the lookup key, nsort the natural-sort integer ──
test("nkey: zeros and /total go, stars go, letters and prefixes stay (real TCGplayer and Scryfall numbers)", () => {
  const cases: [string | null, string | null][] = [
    ["029/281", "29"], ["0205", "205"], ["7 // 2", "7"], ["213★", "213"], ["231★", "231"], ["A39", "a39"], ["551a", "551a"], ["165p", "165p"], ["155s", "155s"], ["KHC-29", "khc-29"],
    ["230a", "230a"], ["49b", "49b"], ["1079", "1079"], ["2138", "2138"], ["bl5", "bl5"], ["dz348", "dz348"], ["12", "12"], ["1 // 2", "1"], ["17 // 18", "17"], ["", null], [null, null], ["0", "0"],
  ];
  for (const [raw, key] of cases) assert.equal(C.nkey(raw), key, String(raw));
});
test("nsort: 2 < 10 < 10★ < 10a < 11, prefixed numbers after plain ones, no number last; values the contract quotes", () => {
  const order = ["2", "10", "10★", "10a", "10b", "11", "999", "KHC-29", "A39"];   // prefixed numbers come after every plain one, then by their digits
  assert.deepEqual([...order].reverse().sort((a, b) => C.nsort(a) - C.nsort(b)), order);
  assert.ok(C.nsort(null) > C.nsort("A39"));
  assert.deepEqual([C.nsort("205"), C.nsort("231★"), C.nsort("165p"), C.nsort("155s"), C.nsort("0007"), C.nsort(null)], [205000, 231001, 165017, 155020, 7000, 2_000_000_000]);
  assert.ok(C.nsort("1000000") <= 999_999 * 1000 + 30, "digits are capped below 2^31");
  for (const n of ["1", "999999", "A99999", "z"]) assert.ok(C.nsort(n) < 2 ** 31);
});
test("displayNumber: the Foil unit of a shared id shows the star printing's number", () => {
  assert.equal(C.displayNumber({ number: "231", fnum: "231★" }, "N"), "231");
  assert.equal(C.displayNumber({ number: "231", fnum: "231★" }, "F"), "231★");
  assert.equal(C.displayNumber({ number: "205", fnum: null }, "F"), "205");
  assert.equal(C.displayNumber({ number: null, fnum: null }, "N"), "—");
});

// ── effective rarity ──
test("effectiveRarity: tokens are T, TCGplayer's L stays L, a joined card shows Scryfall's true rarity, an unjoined card keeps TCGplayer's letter", () => {
  assert.equal(C.effectiveRarity({ tcg: "P", scry: "rare", cls: 0 }), "R", "Sol Ring in Buy-A-Box Promos: TCGplayer files it Promo, Scryfall says rare");
  assert.equal(C.effectiveRarity({ tcg: "L", scry: "common", cls: 0 }), "L");
  assert.equal(C.effectiveRarity({ tcg: "S", scry: null, cls: 0 }), "S");
  assert.equal(C.effectiveRarity({ tcg: "R", scry: null, cls: 1 }), "T");
  assert.equal(C.effectiveRarity({ tcg: null, scry: null, cls: 0 }), "S");
  assert.equal(C.effectiveRarity({ tcg: "P", scry: "bonus", cls: 0 }), "S");
  assert.equal(C.effectiveRarity({ tcg: "M", scry: "mythic", cls: 0 }), "M");
  assert.equal(C.effectiveRarity({ tcg: "weird", scry: null, cls: 0 }), "S");
});

// ── colours and types ──
test("colours: WUBRG bits, the 32 identities all have a name, colour pages match exactly", () => {
  assert.deepEqual(C.COLOR_KEYS, ["White", "Blue", "Black", "Red", "Green"]);
  assert.deepEqual(C.COLOR_KEYS.map((k) => C.COLORS[k].bit), [1, 2, 4, 8, 16]);
  assert.deepEqual(C.COLOR_KEYS.map((k) => C.COLORS[k].letter), [...C.COLOR_LETTERS]);
  assert.deepEqual(C.COLOR_PAGES, ["white", "blue", "black", "red", "green", "colorless", "multicolor"]);
  assert.equal(C.colorMask(["White", "Blue"]), 3);
  assert.equal(C.colorMask(["G", "R"]), 24);
  assert.deepEqual(C.colorsOfMask(31), [...C.COLOR_KEYS]);
  assert.deepEqual(C.colorsOfMask(0), []);
  assert.deepEqual(C.maskLetters(0b10101), ["W", "B", "G"]);
  assert.deepEqual([C.colorKind(0), C.colorKind(4), C.colorKind(5)], ["colorless", "mono", "multi"]);
  assert.ok(C.matchesColorPage(0, "colorless") && !C.matchesColorPage(1, "colorless"));
  assert.ok(C.matchesColorPage(1, "white") && !C.matchesColorPage(3, "white"), "a white page is EXACTLY white");
  assert.ok(C.matchesColorPage(3, "multicolor") && !C.matchesColorPage(1, "multicolor"));
  for (let m = 0; m < 32; m++) assert.ok(m in C.IDENTITY_NAMES, `identity ${m} has an explicit name`);
  assert.deepEqual([C.identityName(0), C.identityName(7), C.identityName(15), C.identityName(31), C.identityName(30)], ["Colorless", "Esper", "Yore-Tiller", "Five-color", "Glint-Eye"]);
  assert.equal(C.identityName(99), "Colorless");
  assert.ok(C.identityFits(1, 3) && !C.identityFits(4, 3) && C.identityFits(0, 0), "Atraxa's four colours do not fit Esper; a colourless card fits anywhere");
  assert.equal(C.colorMask(["G", "W", "U", "B"]), 1 | 2 | 4 | 16, "Atraxa, Praetors' Voice");
});
test("primaryType reads the FRONT face before the dash, first match in vocabulary order (real type lines)", () => {
  const real: [string, C.PrimaryType][] = [
    ["Legendary Creature — Phyrexian Angel Horror", "creature"], ["Artifact Creature — Golem", "creature"], ["Artifact", "artifact"], ["Artifact Land", "land"], ["Basic Land — Forest", "land"], ["Land", "land"],
    ["Instant", "instant"], ["Sorcery", "sorcery"], ["Kindred Instant — Elf", "instant"], ["Tribal Instant — Elf", "instant"], ["Legendary Planeswalker — Jace", "planeswalker"], ["Battle — Siege", "battle"],
    ["Enchantment — Aura", "enchantment"], ["Enchantment Creature — Nymph", "creature"], ["Plane — Dominaria", "other"], ["Scheme", "other"], ["Vanguard", "other"], ["Conspiracy", "other"], ["Dungeon", "other"],
    ["Land // Legendary Creature — Demon", "land"], ["Creature — Human Wizard // Creature — Human Insect", "creature"], ["Summon — Wolf", "creature"], ["Interrupt", "instant"], ["Legendary Kindred Artifact — Wizard Vehicle", "artifact"], ["", "other"],
  ];
  for (const [line, type] of real) assert.equal(C.primaryType(line), type, line);
  assert.equal(C.primaryType(null), "other");
  assert.equal(C.ptypeOf("Instant"), 6);
  assert.equal(C.ptypeOf("Plane — Dominaria"), 9);
  assert.deepEqual(C.CARD_TYPES, ["Creature", "Planeswalker", "Battle", "Land", "Artifact", "Enchantment", "Instant", "Sorcery", "Kindred", "Other"]);
  assert.equal(C.CARD_TYPES.length, C.PRIMARY_TYPES.length);
});

// ── markets: a position in a published array is a market ──
test("the six markets keep their order: MARKETS, MARKET_INDEX, HISTORY_MARKETS and the per-market arrays of the published files all count US AU UK SG CA EU", () => {
  assert.deepEqual(Co.MARKETS, ["US", "AU", "UK", "SG", "CA", "EU"]);
  assert.deepEqual(Co.MARKETS.map((m) => Co.MARKET_INDEX[m]), [0, 1, 2, 3, 4, 5]);
  for (const m of Co.MARKETS) assert.equal(Co.marketFromIndex(Co.MARKET_INDEX[m]), m);
  assert.deepEqual([Co.marketFromIndex(6), Co.marketFromIndex(-1), Co.marketFromIndex(Number.NaN)], ["US", "US", "US"], "an index outside the six reads as the default market, never undefined");
  assert.deepEqual([...HISTORY_MARKETS], [...Co.MARKETS]);
  assert.deepEqual(Co.COUNTRY_LIST.map((c) => c.code), [...Co.MARKETS]);
  for (const m of Co.MARKETS) assert.equal(C.STORE_ID.EBAY_BASE + Co.MARKET_INDEX[m] < C.STORE_ID.FEED_BASE, true, `${m}: its display-only eBay store id stays below the feed ids`);
  assert.deepEqual(Co.MARKETS.map((m) => C.STORE_ID.EBAY_BASE + Co.MARKET_INDEX[m]), [1, 2, 3, 4, 5, 6], "eBay display stores are 1 to 6 by market index");
});
test("normalizeCountry and the market tables: GB is the UK, an EU member is the EU market, anything else is the US; every market has its currency symbol", () => {
  assert.deepEqual(["gb", "GB", "uk", "de", "ES", "ie", "JP", "", undefined, null].map((v) => Co.normalizeCountry(v)), ["UK", "UK", "UK", "EU", "EU", "EU", "US", "US", "US", "US"]);
  assert.deepEqual([Co.isoCountry("UK"), Co.isoCountry("EU"), Co.isoCountry("AU")], ["GB", "ES", "AU"], "the EU market is anchored to Spain");
  assert.deepEqual(Co.MARKETS.map((m) => Co.currencyOf(m)), ["USD", "AUD", "GBP", "SGD", "CAD", "EUR"]);
  assert.deepEqual(Co.MARKETS.map((m) => Co.COUNTRIES[m].symbol), ["US$", "A$", "£", "S$", "C$", "€"]);
  assert.ok(Co.isCountry("SG") && !Co.isCountry("GB") && !Co.isCountry(5));
  assert.equal(Co.DEFAULT_COUNTRY, "US");
});
