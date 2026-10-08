// The decklist parser, resolver and pricer (src/lib/deck.ts, src/lib/deck-price.ts, owner WP10) behind /deck, /api/deck/price, Best Basket's paste box, the published decks and the deck watch.
// Every line, card and price is real Magic: export strings in the shapes MTG Arena, MTGO, Moxfield, Archidekt, TappedOut and TCGplayer write, resolved against the 57 products of Annex A
// (realMiniTree, served as the published data) and, when the dataset of `npm run import:bootstrap` is present in .data, against all 99,079 cards.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CARD_FLAGS, PRICE_MASK } from "../src/lib/constants";
import {
  DECK_LINE_CAP,
  QTY_CAP,
  basePrinting,
  chooseFinish,
  decodeList,
  encodeDeckParam,
  encodeList,
  formatDeckLine,
  formatDeckList,
  isSectionHeader,
  marketTotals,
  mergeLines,
  normName,
  normalizeNumber,
  orderPrintings,
  parseDeckList,
  pickFromSetNumber,
  splitByCheapestStore,
  storeLows,
  unitKeyOf,
  zoneHeaderOf,
  type DeckLine,
  type ResolvedLine,
} from "../src/lib/deck";
import { basketOffers, basketUnits, canonicalText, entriesOf, listingTuples, lineForSlug, loaderData, pinnedIds, priceDeck, resolveDeckLines, resolveDeckText, type DeckRow } from "../src/lib/deck-price";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { getBrowseIndex, getCardsByIds } from "../src/lib/data";
import { DECKS, servePlane } from "./helpers/deck-watch-harness";

// ══ real export strings ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** MTG Arena: "Deck" / "Sideboard" blocks with the set code and the collector number of the printing (the Boros burn list, each card at the cheapest printing of 2026-10-07). */
const ARENA = `About
Name Boros Burn

Deck
4 Goblin Guide (MB2) 58
4 Monastery Swiftspear (KTK) 118
4 Eidolon of the Great Revel (JOU) 94
4 Lightning Bolt (CLB) 401
4 Lava Spike (UMA) 136
4 Rift Bolt (TSR) 184
4 Boros Charm (C21) 210
4 Skewer the Critics (OTP) 26
4 Light Up the Stage (FCA) 39
2 Searing Blaze (PLST) WWK-90
2 Lightning Helix (E02) 39
4 Inspiring Vantage (OTJ) 269
4 Sacred Foundry (PEOE) 256p
4 Sunbaked Canyon (TLE) 58
4 Arid Mesa (MH2) 244
4 Mountain (DDP) 75

Sideboard
3 Smash to Smithereens (MM2) 124
3 Deflecting Palm (SOA) 128
3 Rending Volley (PLST) DTK-150
2 Tormod's Crypt (M21) 241
2 Wear // Tear (DGM) 135
2 Dragon's Rage Channeler (MB2) 56`;

/** The TCGplayer product ids of those printings (stable: the join's key), for the dataset run. */
const ARENA_IDS = [562497, 93281, 82203, 267061, 180812, 233922, 236109, 544873, 633065, 583436, 152501, 544280, 645536, 662543, 238607, 104265, 98822, 689397, 583423, 215346, 67878, 563243];

const sum = (ls: readonly { qty: number }[]) => ls.reduce((n, l) => n + l.qty, 0);
const shape = (ls: readonly DeckLine[]) => ls.map((l) => [l.qty, l.name, l.set ?? null, l.number ?? null, l.finish ?? null, l.zone]);

// ══ the parser ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("MTG Arena: About block skipped, Deck and Sideboard blocks, set code and collector number, 'PLST WWK-90' and '256p' kept as typed", () => {
  const lines = parseDeckList(ARENA);
  assert.equal(lines.length, 22);
  assert.equal(sum(lines.filter((l) => l.zone === "main")), 60);
  assert.equal(sum(lines.filter((l) => l.zone === "side")), 15);
  assert.deepEqual(shape(lines).slice(0, 2), [[4, "Goblin Guide", "mb2", "58", null, "main"], [4, "Monastery Swiftspear", "ktk", "118", null, "main"]]);
  assert.deepEqual(shape(lines).filter((l) => l[1] === "Searing Blaze" || l[1] === "Sacred Foundry"), [[2, "Searing Blaze", "plst", "WWK-90", null, "main"], [4, "Sacred Foundry", "peoe", "256p", null, "main"]]);
  assert.deepEqual(shape(lines).at(-2), [2, "Wear // Tear", "dgm", "135", null, "side"], "a split card keeps its whole name");
  assert.ok(lines.every((l) => l.name !== "Name Boros Burn" && !/about/i.test(l.name)));
});

test("MTG Arena: Commander, Companion, Deck sections (Atraxa excerpt); the zone follows the header, not the line", () => {
  const lines = parseDeckList("Commander\n1 Atraxa, Praetors' Voice (MUL) 33\n\nCompanion\n1 Lurrus of the Dream-Den (IKO) 226\n\nDeck\n1 Sol Ring (FDC) 286\n1 Command Tower (FRC) 22\n7 Swamp (DDK) 78");
  assert.deepEqual(lines.map((l) => [l.name, l.zone]), [["Atraxa, Praetors' Voice", "commander"], ["Lurrus of the Dream-Den", "companion"], ["Sol Ring", "main"], ["Command Tower", "main"], ["Swamp", "main"]]);
  assert.equal(lines[0]!.set, "mul");
  assert.equal(lines[0]!.number, "33");
});

test("MTGO: a bare list is the main deck, and exactly one blank line before the last block makes it the sideboard (the Pauper burn export)", () => {
  const lines = parseDeckList(DECKS.pauper);
  assert.equal(sum(lines.filter((l) => l.zone === "main")), 60);
  assert.equal(sum(lines.filter((l) => l.zone === "side")), 15);
  assert.deepEqual(lines.filter((l) => l.zone === "side").map((l) => l.name), ["Smash to Smithereens", "Flame Slash", "Cleansing Wildfire", "Faithless Looting"]);
  assert.ok(lines.every((l) => l.set === undefined), "MTGO writes no sets");
  const spaced = parseDeckList("4 Lightning Bolt\n\n4 Chain Lightning\n\n2 Negate");
  assert.ok(spaced.every((l) => l.zone === "main"), "two gaps are spacing, not a sideboard");
});

test("MTGO: 'SB:' lines and 'Sideboard' / 'SIDEBOARD:' headers (Moxfield) name the sideboard whatever the blank lines say", () => {
  assert.deepEqual(shape(parseDeckList("4 Lightning Bolt\n4 Goblin Guide\n\nSB: 2 Negate\nSB: 3 Smash to Smithereens")).map((r) => [r[0], r[1], r[5]]), [[4, "Lightning Bolt", "main"], [4, "Goblin Guide", "main"], [2, "Negate", "side"], [3, "Smash to Smithereens", "side"]]);
  assert.deepEqual(parseDeckList("MAINBOARD:\n4 Lightning Bolt\nSIDEBOARD:\n2 Negate").map((l) => l.zone), ["main", "side"]);
  assert.deepEqual(parseDeckList("Sideboard (15)\n3 Smash to Smithereens").map((l) => l.zone), ["side"], "a count after the header");
  assert.deepEqual(parseDeckList("Deck: 60 cards\n4 Lightning Bolt").map((l) => l.zone), ["main"]);
});

test("Moxfield: '*F*' is a foil copy and '*E*' a Foil Etched one, after the set and number", () => {
  const lines = parseDeckList("1 Sol Ring (C21) 263 *F*\n1 Counterspell (MH2) 267 *E*\n1 Atraxa, Praetors' Voice (MUL) 33\n1 Birds of Paradise (7ED) 231 *F*");
  assert.deepEqual(lines.map((l) => [l.name, l.set, l.number, l.finish ?? null, l.etched ?? false]), [
    ["Sol Ring", "c21", "263", 1, false],
    ["Counterspell", "mh2", "267", 1, true],
    ["Atraxa, Praetors' Voice", "mul", "33", null, false],
    ["Birds of Paradise", "7ed", "231", 1, false],
  ]);
});

test("finish words in the other spellings people paste: (foil), (etched), (Foil Etched), [foil]; '(nonfoil)' says nothing", () => {
  const f = (t: string) => { const l = parseDeckList(t)[0]!; return [l.name, l.finish ?? null, l.etched ?? false, l.set ?? null]; };
  assert.deepEqual(f("1 Sol Ring (C21) 263 (foil)"), ["Sol Ring", 1, false, "c21"]);
  assert.deepEqual(f("1 Counterspell (MH2) 267 (etched)"), ["Counterspell", 1, true, "mh2"]);
  assert.deepEqual(f("1 Counterspell (MH2) 267 (Foil Etched)"), ["Counterspell", 1, true, "mh2"]);
  assert.deepEqual(f("1 Sol Ring [foil]"), ["Sol Ring", 1, false, null]);
  assert.deepEqual(f("1 Sol Ring (C21) 263 (nonfoil)"), ["Sol Ring", null, false, "c21"]);
});

test("Archidekt: '1x', a lower-case set, [Category{...}] and ^tags^ after the number; a Maybeboard category is dropped, a Commander category sets the zone", () => {
  const text = [
    "1x Atraxa, Praetors' Voice (mul) 33 [Commander{top}]",
    "1x Sol Ring (fdc) 286 [Ramp] ^Have,#37d67a^",
    "1x Sylvan Library (sld) 2058 *F* [Draw]",
    "1x Mana Crypt (2xm) 270 [Maybeboard{noDeck}{noPrice}]",
    "1x Command Tower (frc) 22 [Land,Ramp]",
  ].join("\n");
  const lines = parseDeckList(text);
  assert.deepEqual(lines.map((l) => [l.qty, l.name, l.set, l.number, l.finish ?? null, l.zone]), [
    [1, "Atraxa, Praetors' Voice", "mul", "33", null, "commander"],
    [1, "Sol Ring", "fdc", "286", null, "main"],
    [1, "Sylvan Library", "sld", "2058", 1, "main"],
    [1, "Command Tower", "frc", "22", null, "main"],
  ]);
  assert.equal(parseDeckList(text, { keepMaybe: true }).find((l) => l.name === "Mana Crypt")?.zone, "maybe", "kept on request");
});

test("TappedOut and Deckbox: '1x Name *CMDR*', 'Name x4' and 'Name [SET]' (TCGplayer Mass Entry)", () => {
  assert.deepEqual(parseDeckList("1x Atraxa, Praetors' Voice *CMDR*").map((l) => [l.name, l.zone]), [["Atraxa, Praetors' Voice", "commander"]]);
  assert.deepEqual(parseDeckList("Lightning Bolt x4\n4 Goblin Guide [ZEN]").map((l) => [l.qty, l.name, l.set ?? null]), [[4, "Lightning Bolt", null], [4, "Goblin Guide", "zen"]]);
});

test("quantities: '4', '4x', '4 x', 'x4' agree; 0 is one copy; more than 99 is 99; a name that starts with a digit is a name", () => {
  for (const t of ["4 Lightning Bolt", "4x Lightning Bolt", "4 x Lightning Bolt", "4xLightning Bolt", "Lightning Bolt x4"]) assert.deepEqual(parseDeckList(t).map((l) => [l.qty, l.name]), [[4, "Lightning Bolt"]], t);
  assert.deepEqual(parseDeckList("Lightning Bolt").map((l) => l.qty), [1], "no quantity is one");
  assert.deepEqual(parseDeckList("0 Lightning Bolt\n999x Mountain").map((l) => l.qty), [1, QTY_CAP]);
  assert.equal(QTY_CAP, 99);
  assert.deepEqual(parseDeckList("4 1996 World Champion\n1996 World Champion").map((l) => [l.qty, l.name]), [[4, "1996 World Champion"], [1, "1996 World Champion"]]);
  assert.deepEqual(parseDeckList("4 Xenagos, God of Revels").map((l) => [l.qty, l.name]), [[4, "Xenagos, God of Revels"]], "'4 X...' is a quantity and a name");
});

test("names that carry punctuation, accents or a parenthesis are kept whole", () => {
  const names = ["Atraxa, Praetors' Voice", "Lim-Dûl's Vault", "Æther Vial", "Who // What // When // Where // Why", "Delver of Secrets // Insectile Aberration", "B.F.M. (Big Furry Monster)", "Erase (Not the Urza's Legacy One)", "Kroxa, Titan of Death's Hunger", "Ach! Hans, Run!"];
  for (const n of names) assert.deepEqual(parseDeckList(`1 ${n}`).map((l) => l.name), [n], n);
  assert.deepEqual(parseDeckList("2 Hazmat Suit (Used)").map((l) => [l.name, l.set]), [["Hazmat Suit", "used"]], "a name that ends in a parenthesis reads as a set code: the resolver asks again with it put back");
  assert.deepEqual(parseDeckList("1 Delver of Secrets // Insectile Aberration (ISD) 51").map((l) => [l.name, l.set, l.number]), [["Delver of Secrets // Insectile Aberration", "isd", "51"]]);
});

test("an exact printing: '#<product id>' wins over everything else on the line (what /deck writes when a set and a number are not enough)", () => {
  const [a, b] = parseDeckList("4 Lightning Bolt (M11) 149 #35427\n1 Black Lotus #8989");
  assert.equal(a!.productId, 35427);
  assert.equal(a!.set, "m11");
  assert.equal(b!.productId, 8989);
  assert.equal(b!.name, "Black Lotus");
  assert.deepEqual(parseDeckList("#35427").map((l) => [l.productId, l.name]), [[35427, ""]], "a bare pin is a line");
});

test("headers, totals, comments and Arena's About block are never cards", () => {
  const text = ["// Boros burn", "# from a tournament", "About", "Name Burn", "", "Creatures (12)", "4 Goblin Guide", "Lands (24)", "20 Mountain", "Total: 60 cards", "Sideboard:", "Maybeboard (2)"].join("\n");
  assert.deepEqual(parseDeckList(text).map((l) => [l.qty, l.name]), [[4, "Goblin Guide"], [20, "Mountain"]]);
  for (const h of ["Deck", "Sideboard (15)", "Commander:", "COMPANION", "Creatures (12)", "Total: 60 cards", "Lands:", "Maybeboard", "Main Deck", "SB"]) assert.ok(isSectionHeader(h), h);
  for (const c of ["Creature Comforts", "Sideboard Surprise", "Land Tax", "Instant Regret", "Commander's Sphere"]) assert.ok(!isSectionHeader(c), c);
  assert.equal(zoneHeaderOf("Sideboard (15)"), "side");
  assert.equal(zoneHeaderOf("Creatures"), "neutral");
  assert.equal(zoneHeaderOf("Lightning Bolt"), null);
});

test("a byte-order mark, no-break spaces and Windows line ends do not change a list", () => {
  const plain = parseDeckList("4 Lightning Bolt\n4 Goblin Guide");
  assert.deepEqual(parseDeckList("\uFEFF4 Lightning Bolt\r\n4\u00A0Goblin Guide\r\n"), plain);
});

test("normalizeNumber is the lookup key: zeros, 'of' counts, stars and prefixes", () => {
  assert.equal(normalizeNumber("029/281"), "29");
  assert.equal(normalizeNumber("231★"), "231");
  assert.equal(normalizeNumber("A39"), "a39");
  assert.equal(normalizeNumber("KHC-29"), "khc-29");
  assert.equal(normalizeNumber("WWK-90"), "wwk-90");
  assert.equal(normalizeNumber("0205"), "205");
});

test("the line cap: 200 card lines are read, the rest are dropped, and a 100-card Commander list fits twice over", () => {
  assert.equal(DECK_LINE_CAP, 200);
  const big = Array.from({ length: 260 }, () => "1 Lightning Bolt").join("\n");
  assert.equal(parseDeckList(big).length, 200);
  assert.equal(parseDeckList(DECKS.atraxa).length, 70, "the Atraxa list: 70 lines for 100 cards");
  assert.equal(sum(parseDeckList(DECKS.atraxa)), 100);
});

// ══ writing a list back ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("formatDeckLine writes what the parser reads: set and number, '*F*' / '*E*', and '#id' only when set and number would not find the product", () => {
  const bolt = { id: 35427, name: "Lightning Bolt", number: "149", setCode: "M11", flags: 0 };
  const ezio = { id: 541332, name: "Ezio Auditore da Firenze", number: "203", setCode: "ACR", flags: CARD_FLAGS.ETCHED };
  const lotus = { id: 8989, name: "Black Lotus", number: null, setCode: "2ED", flags: 0 };
  assert.equal(formatDeckLine(4, bolt), "4 Lightning Bolt (M11) 149");
  assert.equal(formatDeckLine(4, bolt, { finish: "F" }), "4 Lightning Bolt (M11) 149 *F*");
  assert.equal(formatDeckLine(1, ezio, { finish: "F" }), "1 Ezio Auditore da Firenze (ACR) 203 *E*");
  assert.equal(formatDeckLine(1, bolt, true), "1 Lightning Bolt (M11) 149 #35427");
  assert.equal(formatDeckLine(1, lotus), "1 Black Lotus #8989", "no collector number: the pin is the only address");
  for (const t of ["4 Lightning Bolt (M11) 149", "4 Lightning Bolt (M11) 149 *F*", "1 Ezio Auditore da Firenze (ACR) 203 *E*", "1 Lightning Bolt (M11) 149 #35427", "1 Black Lotus #8989"]) {
    const [l] = parseDeckList(t);
    assert.equal(formatDeckLine(l!.qty, { id: l!.productId ?? bolt.id, name: l!.name, number: l!.number ?? null, setCode: (l!.set ?? "").toUpperCase(), flags: l!.etched ? CARD_FLAGS.ETCHED : 0 }, { finish: l!.finish === 1 ? "F" : "N", pinned: !!l!.productId && !!l!.number }), t);
  }
});

test("formatDeckList: plain lines for a one-zone list, Arena sections (Commander, Companion, Deck, Sideboard) when there are more, and parseDeckList reads them back", () => {
  assert.equal(formatDeckList([{ zone: "main", text: "4 Lightning Bolt" }, { zone: "main", text: "4 Goblin Guide" }]), "4 Lightning Bolt\n4 Goblin Guide");
  const mixed = formatDeckList([{ zone: "side", text: "2 Negate" }, { zone: "commander", text: "1 Atraxa, Praetors' Voice" }, { zone: "main", text: "1 Sol Ring" }]);
  assert.equal(mixed, "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n\nSideboard\n2 Negate");
  assert.deepEqual(parseDeckList(mixed).map((l) => [l.name, l.zone]), [["Atraxa, Praetors' Voice", "commander"], ["Sol Ring", "main"], ["Negate", "side"]]);
  const arena = parseDeckList(ARENA);
  const again = parseDeckList(formatDeckList(arena.map((l) => ({ zone: l.zone, text: `${l.qty} ${l.name} (${l.set!.toUpperCase()}) ${l.number}` }))));
  assert.deepEqual(shape(again), shape(arena), "a whole Arena export survives a round trip");
});

test("?list= is UTF-8-safe base64 (accents survive), plain text still decodes, and the encoded parameter is URI-safe", () => {
  const text = "1 Lim-Dûl's Vault\n1 Æther Vial\n4 Lightning Bolt (M11) 149 *F*";
  assert.equal(decodeList(encodeList(text)), text);
  assert.equal(decodeList(text), text, "a plain list passes through");
  assert.equal(decodeList(decodeURIComponent(encodeDeckParam(text))), text);
  assert.doesNotMatch(encodeDeckParam(text), /[+/=\s]/, "+, / and = are escaped");
  assert.equal(decodeList(""), "");
});

test("normName folds punctuation, accents and spacing so two spellings of one name compare equal", () => {
  assert.equal(normName("Lim-Dûl's Vault"), normName("lim dul's vault"));
  assert.equal(normName("Æther Vial"), normName("Aether Vial"));
  assert.notEqual(normName("Fire // Ice"), normName("Fire"));
});

// ══ the rules a resolver applies, on real products ═══════════════════════════════════════════════════════════════════════════════════════════════════

const PRODUCTS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/magic-products.json"), "utf8")) as { productId: number; name: string; prices: Record<string, { market: number | null; low: number | null }> }[];
const real = (id: number) => PRODUCTS.find((p) => p.productId === id)!;
const cents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
/** A printing for the pure rules: the fixture product's own market, its headline finish (Normal when it has a Normal market, else Foil), and the flags given. */
const printing = (id: number, flags = 0, treat: string[] = []) => {
  const n = real(id).prices.Normal, f = real(id).prices.Foil;
  const headFinish = n?.market != null || !f ? ("N" as const) : ("F" as const);
  return { id, flags, treat, marketUsd: cents((headFinish === "N" ? n : f)?.market), headFinish };
};

test("a bare name means the cheapest REGULAR Normal printing: not serialized, not a foil-only product, not Foil Etched, by market, ties to the lower id", () => {
  const birds = [printing(560662), printing(2831)];
  assert.equal(basePrinting(birds)!.id, 2831, "Birds of Paradise: 7th Edition ($22.89) under the Secret Lair African Swallow ($44.23)");
  const withSerial = [printing(719547, CARD_FLAGS.SERIAL), printing(2831)];
  assert.equal(basePrinting([{ ...withSerial[0]!, marketUsd: 1 }, ...withSerial.slice(1)])!.id, 2831, "a serialized printing is never the plain one, however cheap");
  const etched = [{ ...printing(541332, CARD_FLAGS.ETCHED), marketUsd: 710 }, printing(238617)];
  assert.equal(basePrinting(etched)!.id, 238617);
  assert.equal(basePrinting([printing(594545)])!.id, 594545, "only a foil-only product: it is the printing");
  assert.equal(basePrinting([printing(8989), printing(1042)])!.id, 1042, "no priced Normal printing at all: the lowest id");
  assert.equal(basePrinting([]), undefined);
  assert.deepEqual(orderPrintings([printing(560662), printing(2831), { ...printing(719547, CARD_FLAGS.SERIAL), marketUsd: 1 }]).map((c) => c.id), [2831, 560662, 719547], "ordinary first, cheapest first");
});

test("(set, number) can be shared by a base product, its Foil Etched twin and a stamped variant: etched asks for the twin, ordinary ties go to the plainest and are flagged", () => {
  const counter = [{ id: 238617, flags: 0, treat: [] as string[] }, { id: 240803, flags: CARD_FLAGS.ETCHED, treat: ["foiletched"] }];
  assert.deepEqual(pickFromSetNumber(counter, false), { card: counter[0], ambiguous: false, etchedMissed: false });
  assert.deepEqual(pickFromSetNumber(counter, true), { card: counter[1], ambiguous: false, etchedMissed: false });
  assert.deepEqual(pickFromSetNumber([counter[0]!], true), { card: counter[0], ambiguous: false, etchedMissed: true }, "the line asked for etched, the printing has none");
  const setback = [{ id: 537180, flags: 0, treat: [] as string[] }, { id: 535972, flags: 0, treat: [] as string[] }];
  const p = pickFromSetNumber(setback, false)!;
  assert.equal(p.card.id, 535972, "Sudden Setback (a) and (b) share MKM 72: the lower id");
  assert.equal(p.ambiguous, true);
  const war = [{ id: 697908, flags: 0, treat: ["surgefoil"] }, { id: 697293, flags: 0, treat: [] as string[] }];
  assert.equal(pickFromSetNumber(war, false)!.card.id, 697293, "War Machine, Avenging Arsenal: the plain product over its Surge Foil");
  assert.equal(pickFromSetNumber([], false), null);
});

test("the finish of a line: Normal if the product has a Normal row, else the only finish it has; *F* is Foil, and falls back with a flag when there is none", () => {
  const both = { flags: 0, n: { market: 394, low: 199 }, f: { market: 326, low: 187 } };
  const foilOnly = { flags: CARD_FLAGS.FOILONLY, n: null, f: { market: 788, low: 599 } };
  const normalOnly = { flags: 0, n: { market: 17, low: 4 }, f: null };
  assert.deepEqual(chooseFinish(both, undefined), { finish: "N", adjusted: false });
  assert.deepEqual(chooseFinish(both, 1), { finish: "F", adjusted: false });
  assert.deepEqual(chooseFinish(foilOnly, undefined), { finish: "F", adjusted: false }, "Sol Ring (Buy-A-Box Promos) is sold in Foil only");
  assert.deepEqual(chooseFinish(foilOnly, 1), { finish: "F", adjusted: false });
  assert.deepEqual(chooseFinish(normalOnly, 1), { finish: "N", adjusted: true }, "Fire // Ice has no Foil row here: the Normal one is priced and the line says so");
  assert.equal(unitKeyOf(238617, "F", "main"), "238617.1.main");
});

function row(id: number, finish: "N" | "F", line: Partial<DeckLine> = {}, over: Partial<ResolvedLine<{ id: number }>> = {}): ResolvedLine<{ id: number }> {
  return { line: { raw: "", qty: 1, name: "", zone: "main", ...line }, card: { id }, finish, options: [], how: "setnumber", setMissed: false, etchedMissed: false, ambiguous: false, finishAdjusted: false, ...over };
}

test("mergeLines adds a repeated unit (same product, finish, zone) and keeps a request that could not be met; Normal and Foil, main and side stay apart", () => {
  const merged = mergeLines([row(238617, "N", { qty: 2 }), row(238617, "N", { qty: 3 }), row(238617, "F"), row(238617, "N", { zone: "side" }), row(238617, "N", { qty: 1 }, { etchedMissed: true }), row(0, "N")].map((r, i) => (i === 5 ? { ...r, card: null } : r)));
  assert.deepEqual(merged.map((r) => [r.card?.id ?? null, r.finish, r.line.zone, r.line.qty]), [[238617, "N", "main", 6], [238617, "F", "main", 1], [238617, "N", "side", 1], [null, "N", "main", 1]]);
  assert.equal(merged[0]!.etchedMissed, true, "an '*E*' that asked for a twin the printing lacks is not lost in the merge");
  assert.equal(mergeLines([row(1, "N", { qty: 80 }), row(1, "N", { qty: 80 })])[0]!.line.qty, QTY_CAP);
});

test("marketTotals sums qty x cheapest listing per market and counts unpriced copies", () => {
  const t = marketTotals([{ qty: 4, low: { US: 199, AU: null } }, { qty: 1, low: { US: 1749, AU: 2800 } }], ["US", "AU"] as const);
  assert.deepEqual(t.US, { cents: 4 * 199 + 1749, pricedQty: 5, totalQty: 5 });
  assert.deepEqual(t.AU, { cents: 2800, pricedQty: 1, totalQty: 5 });
});

test("splitByCheapestStore groups each line under its cheapest store, biggest basket first, and lists what no store has", () => {
  const o = (source: string, priceCents: number) => ({ source, priceCents, url: `https://${source}`, condition: null });
  const s = splitByCheapestStore([
    { key: "a", qty: 4, offers: [o("store:x", 199), o("store:y", 187)] },
    { key: "b", qty: 1, offers: [o("store:x", 1749)] },
    { key: "c", qty: 2, offers: [o("store:y", 4)] },
    { key: "d", qty: 1, offers: [] },
  ]);
  assert.deepEqual(s.missing, ["d"]);
  assert.equal(s.totalCents, 4 * 187 + 1749 + 2 * 4);
  assert.equal(s.groups[0]!.source, "store:y");
  assert.equal(s.groups[0]!.copies, 6);
  assert.deepEqual(s.groups[1]!.picks.map((p) => p.key), ["b"]);
});

test("storeLows: the cheapest in-stock STORE or TCGplayer listing per market; eBay never counts (it is a search, not a store)", () => {
  const low = storeLows(
    [
      { source: "ebay_us", market: "US", priceCents: 100, inStock: true },
      { source: "tcgplayer", market: "US", priceCents: 199, inStock: true },
      { source: "store:a", market: "US", priceCents: 240, inStock: true },
      { source: "store:b", market: "US", priceCents: 120, inStock: false },
      { source: "store:c", market: "UK", priceCents: 300, inStock: true },
      { source: "store:d", market: "XX", priceCents: 1, inStock: true },
    ],
    ["US", "UK", "EU"] as const,
  );
  assert.deepEqual(low, { US: 199, UK: 300, EU: null });
});

test("live offers as a basket's inputs: in stock, this market, a store or TCGplayer, never eBay; tuples carry the UNIT (productId * 2 + finish) and the CONDITIONS index", () => {
  const offer = (o: Partial<{ productId: number; finish: "N" | "F"; market: "US" | "UK"; source: string; priceCents: number; inStock: boolean; condition: string | null; url: string }>) =>
    ({ productId: 238617, finish: "N", market: "US", storeId: 0, source: "tcgplayer", priceCents: 199, currency: "USD", url: "https://x.invalid/a", condition: null, inStock: true, refreshedAt: new Date(0), ...o }) as never;
  const live = [
    offer({}),
    offer({ source: "store:a", priceCents: 150, condition: "LP", url: "https://x.invalid/b" }),
    offer({ source: "store:b", priceCents: 90, inStock: false }),
    offer({ source: "ebay_us", priceCents: 80 }),
    offer({ finish: "F", priceCents: 187 }),
    offer({ market: "UK", priceCents: 300 }),
  ] as never[];
  assert.deepEqual(basketOffers(live, "US").map((o) => (o as { priceCents: number }).priceCents), [199, 150, 187], "in stock, this market, no eBay");
  assert.deepEqual(basketOffers(live, "UK").map((o) => (o as { priceCents: number }).priceCents), [300]);
  const tuples = listingTuples(basketOffers(live, "US"));
  assert.deepEqual(tuples.map((t) => [t[0], t[1], t[2], t[3]]), [[477234, "store:a", 150, 1], [477234, "tcgplayer", 199, null], [477235, "tcgplayer", 187, null]], "cheapest first within a unit; LP is index 1");
  assert.equal(listingTuples([offer({ source: "ebay_us" })] as never[]).length, 0, "eBay is not a basket source even if a caller passes it");
});

// ══ the resolver over the published data (the 57 real products of Annex A) ═══════════════════════════════════════════════════════════════════════════════

const stop = servePlane();
after(stop);
const BIRDS = 2831, COUNTERSPELL = 238617, FIRE_ICE = 457193, DELVER = 609611, LOTUS = 8989, SOL_RING = 594545;
const shown = (r: DeckRow) => [r.card?.id ?? null, r.finish, r.how];

test("resolve: (set, number) finds the printing and the line's finish picks the unit; every price is that finish's (Counterspell, Modern Horizons 2 267)", async () => {
  const { rows } = await resolveDeckText("3 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*");
  assert.deepEqual(rows.map(shown), [[COUNTERSPELL, "N", "setnumber"], [COUNTERSPELL, "F", "setnumber"]], "two units of one product");
  assert.equal(rows[0]!.card!.marketUsd, 394, "the Normal market, $3.94");
  assert.equal(rows[1]!.card!.marketUsd, 326, "the Foil market, $3.26: the unit view, not the headline");
  assert.equal(rows[1]!.card!.headFinish, "F", "the unit view: the card as a Foil unit, every field that finish's");
  assert.equal(rows[0]!.options.length, 1);
});

test("resolve: a star twin shares one product: Birds of Paradise 7th Edition 231 is Normal at 231 and Foil at the star printing, $22.89 and $3,980.75", async () => {
  const { rows } = await resolveDeckText("1 Birds of Paradise (7ED) 231\n1 Birds of Paradise (7ED) 231 *F*");
  assert.deepEqual(rows.map(shown), [[BIRDS, "N", "setnumber"], [BIRDS, "F", "setnumber"]]);
  assert.deepEqual(rows.map((r) => r.card!.marketUsd), [2289, 398075]);
});

test("resolve: a bare name is the cheapest regular printing; a double-faced card is found by its front face, a split card by its whole name, and the same card twice is one line", async () => {
  const { rows } = await resolveDeckText("1 Fire // Ice\n1 Delver of Secrets\n1 Delver of Secrets // Insectile Aberration\n1 Brazen Borrower");
  assert.deepEqual(rows.map((r) => [r.card?.id ?? null, r.how, r.line.qty]), [[FIRE_ICE, "name", 1], [DELVER, "name", 2], [513650, "name", 1]]);
  assert.ok(rows.every((r) => r.oracle && r.oracle.name.length > 0), "the oracle facts come with the card");
  assert.equal(rows[1]!.oracle!.name, "Delver of Secrets // Insectile Aberration");
});

test("resolve: a card with no Normal row (a foil-only promo) is priced in the one finish it has; a low-only printing is a valid target and says so", async () => {
  const { rows } = await resolveDeckText("1 Sol Ring\n1 Black Lotus");
  const sol = rows.find((r) => r.card?.id === SOL_RING)!, lotus = rows.find((r) => r.card?.id === LOTUS)!;
  assert.equal(sol.finish, "F", "Sol Ring (Buy-A-Box Promos): foil only");
  assert.equal(sol.card!.marketUsd, 788);
  assert.equal(sol.finishAdjusted, false);
  assert.equal(lotus.card!.marketUsd, null, "Black Lotus (Unlimited) has no market price, only one listing");
  assert.equal(lotus.card!.lowOnly, true);
  assert.equal(lotus.card!.valueUsd, 1_814_999, "shown at its low, $18,149.99");
});

test("resolve: a wrong set, a stale number and an unknown name are each reported, never guessed", async () => {
  const { rows } = await resolveDeckText("1 Counterspell (XXX) 5\n1 Lightning Bolt (MH2) 267\n1 Nobody At All\n1 Counterspell (MH2) 999");
  assert.deepEqual(rows.map((r) => [r.card?.id ?? null, r.how, r.setMissed, r.line.qty]), [
    [COUNTERSPELL, "name", true, 2],
    [null, "none", false, 1],
    [null, "none", false, 1],
  ], "a set the card was never printed in falls back to the cheapest printing and says so (the two Counterspell lines are one unit); a collector number that belongs to ANOTHER card prices nothing");
});

test("resolve: an *E* on a printing that has no Foil Etched twin prices its Foil and says so, even when the same unit is also on a plain *F* line", async () => {
  const { rows } = await resolveDeckText("1 Counterspell (MH2) 267 *F*\n1 Counterspell (MH2) 267 *E*");
  assert.equal(rows.length, 1, "one unit");
  assert.equal(rows[0]!.line.qty, 2);
  assert.equal(rows[0]!.finish, "F");
  assert.equal(rows[0]!.etchedMissed, true);
});

test("resolve: '#<product id>' pins the exact product; a pin that is not in the data falls back to the name", async () => {
  const pinned = (await resolveDeckText(`2 Counterspell #${COUNTERSPELL}`)).rows;
  assert.deepEqual(pinned.map((r) => [r.card?.id, r.how]), [[COUNTERSPELL, "pinned"]]);
  const gone = (await resolveDeckText("2 Counterspell #99999999")).rows;
  assert.deepEqual(gone.map((r) => [r.card?.id, r.how]), [[COUNTERSPELL, "name"]], "the pin names no product here: the card is found by name");
  assert.deepEqual((await resolveDeckText("#99999999")).rows.map((r) => r.card), [null], "a pin and nothing else has no fallback");
});

test("resolve: the printing switcher: options are the card's other listed printings, the chosen one first", async () => {
  const { rows } = await resolveDeckText("1 Birds of Paradise");
  assert.equal(rows[0]!.card!.id, BIRDS);
  assert.deepEqual(rows[0]!.options.map((c) => c.id), [BIRDS, 560662], "7th Edition and the Secret Lair African Swallow are the two listed Birds of Paradise here");
  const bare = await resolveDeckLines(parseDeckList("1 Birds of Paradise"), loaderData, { options: false });
  assert.deepEqual(bare.rows[0]!.options.map((c) => c.id), [BIRDS], "the watch and the publisher ask for none");
});

test("a name that ends in a parenthesis ('Hazmat Suit (Used)') reads like a set code: the bare name is asked first, then only the lines that found nothing and named a set are asked again with it put back", async () => {
  const asked: string[][] = [];
  const spy = { ...loaderData, oracles: async (keys: readonly string[]) => { asked.push([...keys]); return loaderData.oracles(keys); } };
  await resolveDeckLines(parseDeckList("2 Hazmat Suit (Used)\n1 Counterspell (MH2)"), spy, { options: false });
  assert.deepEqual(asked[0], ["hazmat suit", "counterspell"], "the bare names first");
  assert.deepEqual(asked[1], ["hazmat suit used"], "then the one line that found nothing and named a set");
  assert.equal(asked.length, 2);
});

// ── pricing ──

test("priceDeck: each line at its unit's price, totals per market, the share text that reads back to the same units, and what did not match", async () => {
  const text = "3 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*\n1 Fire // Ice\n1 Black Lotus\n2 Nobody At All";
  const r = await priceDeck(text, "US");
  assert.equal(r.lineCount, 5);
  assert.deepEqual(r.unmatched, ["2 Nobody At All"]);
  assert.deepEqual(r.lines.map((l) => [l.qty, l.card.name, l.finish, l.finishWord]), [[3, "Counterspell", "N", null], [1, "Counterspell", "F", "Foil"], [1, "Fire // Ice", "N", null], [1, "Black Lotus", "N", null]]);
  assert.deepEqual(r.lines.map((l) => l.card.low.US), [199, 187, 4, 1_814_999], "TCGplayer's own low of each unit (no store offers in this tree)");
  assert.equal(r.totals.US.cents, 3 * 199 + 187 + 4 + 1_814_999);
  assert.equal(r.totals.US.pricedQty, 6);
  assert.equal(r.marketUsdTotal, 3 * 394 + 326 + 17 + 1_814_999, "the market where there is one, the low of a low-only unit");
  assert.equal(r.lowOnlyCopies, 1);
  assert.equal(r.split.groups[0]!.store, "TCGplayer");
  assert.equal(r.split.totalCents, r.totals.US.cents);
  assert.equal(r.text, "3 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*\n1 Fire // Ice (DMR) 215\n1 Black Lotus #8989\n2 Nobody At All");
  assert.equal(r.check, null, "no format, no verdict");
  assert.equal(r.truncated, false);
  const again = await priceDeck(r.text, "US");
  assert.deepEqual(again.lines.map((l) => `${l.card.id}.${l.finish}.${l.qty}`), r.lines.map((l) => `${l.card.id}.${l.finish}.${l.qty}`), "the text reads back to the same units");
  assert.equal(r.lines[0]!.tcgplayerUrl?.includes("tcgplayer") || r.lines[0]!.tcgplayerUrl?.includes("238617"), true);
  assert.match(r.lines[1]!.ebayUrl, /foil/i, "the eBay search for a Foil copy says foil");
});

test("priceDeck: the line cap marks the result truncated; a Commander section makes the format Commander and the result carries the verdict", async () => {
  const many = Array.from({ length: 205 }, (_, i) => `1 Card Number ${i}`).join("\n");
  const big = await priceDeck(many, "US", { withOffers: false });
  assert.equal(big.truncated, true);
  assert.equal(big.lineCount, 200);
  const cmd = await priceDeck("Commander\n1 Birds of Paradise (7ED) 231\n\nDeck\n1 Counterspell (MH2) 267", "US", { withOffers: false });
  assert.equal(cmd.format, "commander");
  assert.ok(cmd.check);
  assert.deepEqual(cmd.check!.counts, { main: 1, side: 0, commander: 1, companion: 0, deck: 2 });
  assert.ok(cmd.check!.issues.some((i) => i.code === "size"));
  const modern = await priceDeck("4 Counterspell (MH2) 267", "US", { withOffers: false, format: "modern" });
  assert.equal(modern.check!.label, "Modern");
  assert.deepEqual(modern.check!.unchecked, ["Counterspell"], "this tree publishes no legality, and 'unknown' is judged as nothing");
  assert.equal((await priceDeck("1 Counterspell (MH2) 267", "US", { withOffers: false, format: null })).check, null, "a caller can switch the verdict off");
});

test("priceDeck without store reads: no offers means each unit's TCGplayer low, and the split is empty", async () => {
  const r = await priceDeck("1 Counterspell (MH2) 267", "US", { withOffers: false });
  assert.equal(r.lines[0]!.card.low.US, 199);
  assert.deepEqual(r.split.groups, []);
  assert.equal(r.lines[0]!.cheapest, null);
});

test("lineForSlug: the line a card picked in the search adds, with its set and number; null for a slug that is not a card", async () => {
  assert.equal(await lineForSlug("counterspell-mh2-267", 4), "4 Counterspell (MH2) 267");
  assert.equal(await lineForSlug("counterspell-mh2-267", 400), `${QTY_CAP} Counterspell (MH2) 267`);
  assert.equal(await lineForSlug("birds-of-paradise-7ed-231", 1), "1 Birds of Paradise (7ED) 231");
  assert.equal(await lineForSlug("no-such-card", 1), null);
});

test("canonicalText and pinnedIds: a printing that set and number find again carries no pin; one that they do not does", async () => {
  const { rows } = await resolveDeckText("Commander\n1 Birds of Paradise (7ED) 231\n\nDeck\n1 Black Lotus\n2 Counterspell (MH2) 267 *F*");
  const pins = await pinnedIds(rows.map((r) => r.card!), loaderData);
  assert.deepEqual([...pins], [LOTUS], "Black Lotus has no collector number in the data: the pin is its address");
  assert.equal(await canonicalText(rows), "Commander\n1 Birds of Paradise (7ED) 231\n\nDeck\n1 Black Lotus #8989\n2 Counterspell (MH2) 267 *F*");
  const back = await resolveDeckText(await canonicalText(rows));
  assert.deepEqual(back.rows.map((r) => `${r.card!.id}.${r.finish}.${r.line.zone}.${r.line.qty}`), rows.map((r) => `${r.card!.id}.${r.finish}.${r.line.zone}.${r.line.qty}`));
});

test("basketUnits: one entry per (product, finish) keyed by the unit as a string, copies summed to the cap, the unmatched apart; the sideboard is bought too", async () => {
  const { rows } = await resolveDeckText("2 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*\nSideboard\n1 Counterspell (MH2) 267\n1 Nobody At All");
  const u = basketUnits(rows);
  assert.deepEqual([...u.wanted], [[String(COUNTERSPELL * 2), 3], [String(COUNTERSPELL * 2 + 1), 1]]);
  assert.equal(u.unmatched.length, 1);
  assert.equal(u.info.get(String(COUNTERSPELL * 2 + 1))!.finish, "F");
  assert.equal(entriesOf(rows).find((e) => e.zone === "side")!.qty, 1, "the rules still see the zones apart");
});

// ══ /api/deck/price ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

test("POST /api/deck/price: a pasted list is priced in the visitor's market, a format is judged, an add by slug joins the list, nothing is cached", async () => {
  const headersKey = require.resolve("next/headers"), saved = require.cache[headersKey];
  require.cache[headersKey] = { id: headersKey, filename: headersKey, loaded: true, exports: { cookies: () => ({ get: () => undefined }), headers: () => ({ get: () => null }) } } as never;
  try {
    const { POST, dynamic } = await import("../src/app/api/deck/price/route");
    assert.equal(dynamic, "force-dynamic");
    const post = (body: unknown, ip = "203.0.113.7") => POST(new Request("http://x/api/deck/price", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) }));
    const ok = await post({ text: "3 Counterspell (MH2) 267\n1 Birds of Paradise (7ED) 231 *F*", format: "modern" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const j = (await ok.json()) as Awaited<ReturnType<typeof priceDeck>>;
    assert.equal(j.market, "US");
    assert.equal(j.check!.format, "modern");
    assert.deepEqual(j.lines.map((l) => [l.qty, l.card.name, l.finish]), [[3, "Counterspell", "N"], [1, "Birds of Paradise", "F"]]);
    const added = (await (await post({ text: "1 Counterspell (MH2) 267", add: { slug: "birds-of-paradise-7ed-231", qty: 2 } })).json()) as typeof j;
    assert.deepEqual(added.lines.map((l) => [l.qty, l.card.name]), [[1, "Counterspell"], [2, "Birds of Paradise"]]);
    assert.equal((await post({ text: "  " })).status, 400);
    assert.equal((await post({ text: "1 Counterspell", add: { slug: "no-such-card" } })).status, 400);
    const odd = (await (await post({ text: "1 Counterspell (MH2) 267", format: "oldschool" })).json()) as typeof j;
    assert.equal(odd.check, null, "an unknown format is not a format: no verdict, no error");
    const flood = await Promise.all(Array.from({ length: 31 }, () => post({ text: "1 Counterspell" }, "198.51.100.9")));
    assert.equal(flood.filter((r) => r.status === 429).length >= 1, true, "30 a minute per address");
  } finally {
    if (saved) require.cache[headersKey] = saved;
    else delete require.cache[headersKey];
  }
});

// ══ the whole dataset (the output of `npm run import:bootstrap`), when it is present ════════════════════════════════════════════════════════════════════

const LAB = path.resolve(__dirname, "../.data");
const labSkip = fs.existsSync(path.join(LAB, "latest.json")) ? false : "needs .data (npm run import:bootstrap)";
async function onLab<T>(fn: () => Promise<T>): Promise<T> {
  const was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = LAB;
  resetPlaneForTests();
  try {
    return await fn();
  } finally {
    if (was === undefined) delete process.env.PLANE_DIR;
    else process.env.PLANE_DIR = was;
    resetPlaneForTests();
  }
}
const deckIds = (rows: readonly DeckRow[]) => rows.filter((r) => r.card).map((r) => r.card!.id);

test("dataset: an Arena export resolves line for line to the printings it names (22 lines, 75 cards, no line unmatched)", { skip: labSkip }, async () => {
  await onLab(async () => {
    const { rows } = await resolveDeckText(ARENA, loaderData, { options: false });
    assert.equal(rows.length, 22);
    assert.deepEqual(deckIds(rows), ARENA_IDS);
    assert.ok(rows.every((r) => r.how === "setnumber" && !r.setMissed && !r.ambiguous && r.finish === "N"));
    assert.equal(sum(rows.map((r) => r.line)), 75);
  });
});

test("dataset: a bare name resolves to the printing the catalogue marks CHEAP (the importer's own flag), for every card of the three real decks", { skip: labSkip }, async () => {
  await onLab(async () => {
    const ix = await getBrowseIndex({ withOracle: false });
    for (const [name, text] of Object.entries(DECKS)) {
      const { rows } = await resolveDeckText(text, loaderData, { options: false });
      assert.equal(rows.filter((r) => !r.card).length, 0, `${name}: every card found`);
      for (const r of rows) {
        const mask = ix.mk[ix.rowOf(r.card!.id)] ?? 0;
        assert.ok((mask & PRICE_MASK.CHEAP) !== 0, `${name}: ${r.card!.name} resolved to ${r.card!.setCode} ${r.card!.number}, which is not the CHEAP printing`);
        assert.equal(r.finish, "N");
        assert.equal(r.how, "name");
      }
    }
  });
});

test("dataset: the price of a deck is the sum of its units' own prices, read independently through getCardsByIds", { skip: labSkip }, async () => {
  await onLab(async () => {
    for (const [name, text] of Object.entries(DECKS)) {
      const r = await priceDeck(text, "US", { withOffers: false });
      assert.deepEqual(r.unmatched, [], name);
      const units = await getCardsByIds(r.lines.map((l) => l.card.id), { unit: "N" });
      let value = 0, low = 0;
      for (const l of r.lines) {
        const c = units.get(l.card.id)!;
        value += l.qty * (c.n?.market ?? c.n?.low ?? 0);
        low += l.qty * (c.n?.low ?? c.n?.market ?? 0);
      }
      assert.equal(r.marketUsdTotal, value, `${name}: market total`);
      assert.equal(r.totals.US.cents, low, `${name}: low total`);
      assert.ok(r.totals.US.cents > 0 && r.totals.US.pricedQty === r.totals.US.totalQty, `${name}: every copy priced`);
    }
  });
});

test("dataset: a list written back as text and read again is the same deck (every unit, finish and zone), for the three real decks", { skip: labSkip }, async () => {
  await onLab(async () => {
    for (const [name, text] of Object.entries(DECKS)) {
      const first = await resolveDeckText(text, loaderData, { options: false });
      const canonical = await canonicalText(first.rows);
      const second = await resolveDeckText(canonical, loaderData, { options: false });
      const key = (rs: readonly DeckRow[]) => rs.map((r) => `${r.card!.id}.${r.finish}.${r.line.zone}.${r.line.qty}`).sort();
      assert.deepEqual(key(second.rows), key(first.rows), name);
      assert.ok(second.rows.every((r) => r.how === "setnumber" || r.how === "pinned"), `${name}: the canonical text names every printing`);
    }
  });
});

test("dataset: foil lines, etched twins, a finish the printing lacks and a card with a parenthesis in its name", { skip: labSkip }, async () => {
  await onLab(async () => {
    const { rows } = await resolveDeckText("1 Counterspell (MH2) 267 *F*\n1 Counterspell (MH2) 267 *E*\n1 Lightning Bolt (M11) 149 *F*\n1 Sol Ring (C21) 263 *F*\n2 Hazmat Suit (Used)", loaderData, { options: false });
    const both = await getCardsByIds([238617, 35427, 236137]);
    const base = both.get(238617)!, bolt = both.get(35427)!, ring = both.get(236137)!;
    const foil = rows.find((r) => r.card?.id === 238617)!;
    assert.deepEqual([foil.finish, foil.card!.marketUsd], ["F", base.f!.market], "the base product at its Foil price");
    const etched = rows.find((r) => r.card && (r.card.flags & CARD_FLAGS.ETCHED) !== 0);
    assert.equal(etched?.card?.id, 240803, "Counterspell (Foil Etched), the twin that shares MH2 267");
    assert.equal(etched?.etchedMissed, false);
    const m11 = rows.find((r) => r.card?.id === 35427)!;
    assert.deepEqual([m11.finish, m11.card!.marketUsd], ["F", bolt.f!.market], "Lightning Bolt M11 at its Foil price, not its headline");
    const sol = rows.find((r) => r.card?.id === 236137)!;
    assert.deepEqual([ring.f, sol.finish, sol.finishAdjusted], [null, "N", true], "Sol Ring C21 263 has no Foil row: the Normal is priced and the line says so");
    const hazmat = rows.find((r) => r.card?.name.startsWith("Hazmat Suit"));
    assert.equal(hazmat?.line.qty, 2, "'(Used)' is part of the name");
    assert.equal(hazmat?.setMissed, false);
  });
});

test("dataset: the three real decks judged in their formats: the sizes, the copies and the colours are right whatever Scryfall's legality says today", { skip: labSkip }, async () => {
  await onLab(async () => {
    const mine = new Set(["size", "side-size", "copies", "no-commander", "bad-commander", "partner", "identity", "signature-spell"]);
    for (const [name, text, format, counts] of [
      ["modern", DECKS.modern, "modern", { main: 60, side: 15, commander: 0, companion: 0, deck: 60 }],
      ["pauper", DECKS.pauper, "pauper", { main: 60, side: 15, commander: 0, companion: 0, deck: 60 }],
      ["atraxa", DECKS.atraxa, "commander", { main: 99, side: 0, commander: 1, companion: 0, deck: 100 }],
    ] as const) {
      const r = await priceDeck(text, "US", { withOffers: false, format });
      assert.deepEqual(r.check!.counts, counts, name);
      assert.deepEqual(r.check!.issues.filter((i) => i.level === "error" && mine.has(i.code)), [], `${name}: nothing this check owns is wrong`);
      assert.deepEqual(r.check!.unchecked, [], `${name}: every card has a published legality`);
    }
    const atraxa = await priceDeck(DECKS.atraxa, "US", { withOffers: false, format: "commander" });
    assert.equal(atraxa.check!.identity, 23);
    assert.deepEqual(atraxa.check!.commanders, ["Atraxa, Praetors' Voice"]);
    assert.equal(atraxa.lines[0]!.commander, true, "the commander is the first line");
  });
});

test("dataset: Commander, Companion and Deck sections, a commander that sits in the sideboard of an MTGO export, and a partner pair", { skip: labSkip }, async () => {
  await onLab(async () => {
    const sideboard = `${DECKS.atraxa.replace("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n", "")}\n\nSideboard\n1 Atraxa, Praetors' Voice`;
    const r = await priceDeck(sideboard, "US", { withOffers: false, format: "commander" });
    assert.equal(r.check!.ok, true);
    assert.deepEqual(r.check!.commanders, ["Atraxa, Praetors' Voice"]);
    assert.ok(r.check!.issues.some((i) => i.code === "inferred"));
    assert.equal(r.lines.find((l) => l.card.name.startsWith("Atraxa"))!.zone, "commander");
    const pair = await priceDeck("Commander\n1 Thrasios, Triton Hero\n1 Tymna the Weaver", "US", { withOffers: false, format: "commander" });
    assert.deepEqual(pair.check!.issues.filter((i) => i.level === "error" && i.code !== "size"), [], "two partners, read from their oracle text");
    assert.equal(pair.check!.identity, 23);
    const bad = await priceDeck("Commander\n1 Atraxa, Praetors' Voice\n1 Tymna the Weaver", "US", { withOffers: false, format: "commander" });
    assert.ok(bad.check!.issues.some((i) => i.code === "partner"));
    const wilson = await priceDeck("Commander\n1 Wilson, Refined Grizzly\n1 Acolyte of Bahamut", "US", { withOffers: false, format: "commander" });
    assert.deepEqual(wilson.check!.issues.filter((i) => i.level === "error" && i.code !== "size"), [], "Choose a Background");
  });
});

test("the /deck share metadata prices under the deck API's per-IP budget (pins WP11's page)", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../src/app/deck/page.tsx"), "utf8");
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("const FAQS"));
  const limit = meta.indexOf("rateLimit(`deck-price:");
  assert.ok(limit > 0, "metadata checks the limit");
  assert.ok(limit < meta.indexOf("await priceDeck("), "before any card is loaded");
});
