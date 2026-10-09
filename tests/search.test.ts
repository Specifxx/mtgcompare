// The search grammar and its planner (Annex C check 9; contract 7.6). Owner WP07. The grammar is pure and runs over real Scryfall set codes; the planner and the typeahead run over a published tree of the 57 REAL products of
// tests/fixtures/magic-products.json (Sol Ring, Birds of Paradise, Fire // Ice, Counterspell, Sheoldred ...) and, when a dataset is on disk (PLANE_SAMPLE_DIR, or .data from `npm run import:bootstrap`), over the real catalogue too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NICKNAMES, didYouMean, editDistance, isOrdinaryPrinting, nameTier, nicknameTargets, ordinaryPrinting, ordinaryRank, ordinaryTier, parseSearch, type PrintingFacts } from "../src/lib/search";
import { CARD_FLAGS, PRICE_MASK, RELEASE_SET_KINDS } from "../src/lib/constants";
import { importCatalog, writeCatalogueFiles } from "../src/lib/import";
import { loadPrevState } from "../src/lib/data/plane/prevstate";
import { memTree } from "../src/lib/data/plane/tree";
import type { NameFile } from "../src/lib/data/plane/formats";
import { TRACK_DEFAULTS } from "../src/lib/track";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";
import { miniMagicDay, tmpRoot } from "./helpers/publish-harness";

// real Scryfall codes (all-letter ones that are also words in card names are in the list on purpose: war, one, all, ice, who, vow)
const CODES = new Set(["mh3", "mh2", "lea", "leb", "pbro", "plst", "khc", "7ed", "m11", "2x2", "c21", "40k", "5dn", "sld", "dmr", "apc", "war", "one", "all", "ice", "who", "vow", "und", "unf", "ust", "30a", "fra", "sds", "ltr", "znr"]);
const P = (q: string) => parseSearch(q, { setCodes: CODES });

test("a set code and a collector number: the last two tokens, `-`, `/` and `:` also separate", () => {
  assert.deepEqual(P("mh3 6"), { text: "", set: "mh3", number: "6", treat: [] });
  assert.deepEqual(P("lea 232"), { text: "", set: "lea", number: "232", treat: [] });
  assert.deepEqual(P("pbro 165p"), { text: "", set: "pbro", number: "165p", treat: [] });
  assert.deepEqual(P("plst khc-29"), { text: "", set: "plst", number: "khc-29", treat: [] });
  assert.deepEqual(P("7ed 231★"), { text: "", set: "7ed", number: "231★", treat: [] });
  for (const q of ["mh3-6", "mh3/6", "mh3:6", "MH3 6"]) assert.deepEqual(P(q), { text: "", set: "mh3", number: "6", treat: [] }, q);
  assert.deepEqual(P("sld 1079"), { text: "", set: "sld", number: "1079", treat: [] });
});

test("a name with a set code that contains a digit, trailing or leading", () => {
  assert.deepEqual(P("bolt m11"), { text: "bolt", set: "m11", treat: [] });
  assert.deepEqual(P("m11 bolt"), { text: "bolt", set: "m11", treat: [] });
  assert.deepEqual(P("thoughtseize 2x2"), { text: "thoughtseize", set: "2x2", treat: [] });
  assert.deepEqual(P("sol ring c21"), { text: "sol ring", set: "c21", treat: [] });
  assert.deepEqual(P("Inquisitor Greyfax 40k"), { text: "inquisitor greyfax", set: "40k", treat: [] });
  assert.deepEqual(P("mh3"), { text: "", set: "mh3", treat: [] }, "a code with a digit alone is a set");
});

test("an all-letter code is a word in a name, never a set (war room, fire ice, one ring, all that glitters)", () => {
  for (const q of ["fire ice", "war room", "one ring", "all that glitters", "one with nothing", "who what when where why", "vow of lightning", "ice age"]) {
    const r = P(q);
    assert.equal(r.set, undefined, q);
    assert.equal(r.text, q.replace(/ of lightning/, " of lightning"), q);
  }
  assert.deepEqual(P("set:ice"), { text: "", set: "ice", treat: [] });
  assert.deepEqual(P("e:war"), { text: "", set: "war", treat: [] });
  assert.deepEqual(P("fire (ice)"), { text: "fire", set: "ice", treat: [] }, "a parenthesised known code is a set");
  assert.deepEqual(P("ice 123"), { text: "", set: "ice", number: "123", treat: [] }, "followed by a collector number it is a set");
  assert.deepEqual(P("mountain cn:271 set:one"), { text: "mountain", set: "one", number: "271", treat: [] });
});

test("finish and treatment words are requests, not name text; the rest is the name, folded", () => {
  assert.deepEqual(P("sol ring foil"), { text: "sol ring", finish: "F", treat: [] });
  assert.deepEqual(P("sol ring nonfoil"), { text: "sol ring", finish: "N", treat: [] });
  assert.deepEqual(P("Sol Ring non-foil"), { text: "sol ring", finish: "N", treat: [] });
  assert.deepEqual(P("borderless"), { text: "", treat: ["borderless"] });
  assert.deepEqual(P("Counterspell showcase"), { text: "counterspell", treat: ["showcase"] });
  assert.deepEqual(P("surge foil"), { text: "", treat: ["surge"] }, "a foil pattern is a treatment, not the plain foil word");
  assert.deepEqual(P("griselbrand foil etched"), { text: "griselbrand", finish: "F", etched: true, treat: ["etched"] });
  assert.deepEqual(P("etched"), { text: "", finish: "F", etched: true, treat: ["etched"] });
  assert.deepEqual(P("extended art sheoldred"), { text: "sheoldred", treat: ["extended"] });
  assert.deepEqual(P("Jace, the Mind Sculptor"), { text: "jace the mind sculptor", treat: [] });
  assert.deepEqual(P("khan engineered evil"), { text: "khan engineered evil", treat: [] });
  assert.deepEqual(P("  "), { text: "", treat: [] });
});

test("names: exact, prefix, word starts, squashed; a leading `the` is optional; a short query never matches the middle of a word", () => {
  assert.equal(nameTier("sol ring", "sol ring"), 0);
  assert.equal(nameTier("lightning bolt", "lightning"), 1);
  assert.equal(nameTier("sheoldred the apocalypse", "sheoldred apocalypse"), 2, "words in order, each the start of a name word");
  assert.equal(nameTier("sheoldred the apocalypse", "apocalypse sheoldred"), 3);
  assert.equal(nameTier("jace the mind sculptor", "jace mind sculptor"), 2);
  assert.equal(nameTier("the one ring", "one ring"), 0, "a leading the is optional on the name");
  assert.equal(nameTier("monkey d luffy", "monkeydluffy"), 4, "four letters or more may match squashed");
  assert.equal(nameTier("nissa", "iss"), null, "never the middle of a short word");
  assert.equal(nameTier("fire ice", "ice"), 2, "the second half of a split card");
  assert.equal(nameTier("sol ring", "mox"), null);
});

test("nicknames add a card, they never take one away", () => {
  assert.deepEqual(nicknameTargets("Bob"), ["dark confidant"]);
  assert.deepEqual(nicknameTargets("sad robot"), ["solemn simulacrum"]);
  assert.deepEqual(nicknameTargets("jace the mind sculptor"), [], "a real name is not a nickname");
  for (const [nick, name] of Object.entries(NICKNAMES)) assert.ok(nick.length >= 3 && name.length > nick.length, nick);
});

test("did you mean: real names within a small edit distance, nearest first", () => {
  assert.equal(editDistance("lufy", "luffy"), 1);
  assert.equal(editDistance("sol ring", "sol ring"), 0);
  assert.ok(editDistance("kaido", "zoro", 2) > 2);
  const names = ["Birds of Paradise", "Black Lotus", "Sol Ring", "Counterspell", "Fire // Ice", "Sheoldred, the Apocalypse"];
  assert.deepEqual(didYouMean("birds of paridise", names), ["Birds of Paradise"]);
  assert.deepEqual(didYouMean("sheoldred the apocalips", names), ["Sheoldred, the Apocalypse"]);
  assert.deepEqual(didYouMean("countrspell", names), ["Counterspell"]);
  assert.deepEqual(didYouMean("qwertyuiop", names), []);
  assert.deepEqual(didYouMean("xx", names), [], "too short to guess");
});

// ── the printing a bare name opens (search.ts ordinaryPrinting) ──────────────────────────────────────────────────────────────────
// REAL rows of the published catalogue of 2026-10-08 (.data, `npm run import:bootstrap`): product id, effective rarity, treatments, Card.flags, the catalogue mask, the Normal and Foil TCGplayer MARKET in cents
// and the kind of the set, as the browse index carries them. The header search used to open the dearest printing of a name ("sol ring" opened the serialized LTC 409z, Smothering Tithe and Rhystic Study
// their Anime Confetti Foil); a player who types a name means the printing they would buy.
const pr = (id: number, rarity: string, treat: string, flags: number, mask: number, marketN: number | null, marketF: number | null, setKind: string): PrintingFacts => ({ id, cls: 0, rarity, treat, flags, mask, marketN, marketF, setKind });
const SOL_RING: PrintingFacts[] = [
  pr(1263, "U", "", 224, 4385, null, null, "core"),   // sol-ring-lea
  pr(9210, "U", "", 224, 4361, 12250, null, "core"),   // sol-ring-2ed
  pr(38270, "R", "judge", 740, 4374, null, 50185, "promo"),   // sol-ring-jdg-3
  pr(97622, "U", "ce", 2272, 4361, 10000, null, "gold-border"),   // sol-ring-ced-ce
  pr(122862, "S", "", 736, 4374, null, 157848, "masters"),   // sol-ring-mps-24
  pr(194575, "R", "", 228, 4371, 492, 764, "promo"),   // sol-ring-mfp-1
  pr(221310, "R", "", 224, 4379, 952, 2614, "deck"),   // sol-ring-cc1-7
  pr(227075, "U", "", 224, 4353, 185, null, "masters"),   // sol-ring-cmr-472
  pr(227076, "U", "extended", 224, 4379, 641, 1127, "masters"),   // sol-ring-cmr-700-extended-art
  pr(278573, "R", "retro wpn", 740, 4374, null, 688, "promo"),   // sol-ring-wpn-1-retro-frame
  pr(449467, "U", "retro", 8416, 4361, 21999, null, "masters"),   // sol-ring-30a-563-retro-frame
  pr(488290, "M", "", 12512, 4361, 215099, null, "commander"),   // sol-ring-elven-ltc-408
  pr(488291, "M", "", 12512, 4361, 60546, null, "commander"),   // sol-ring-dwarven-ltc-409
  pr(488302, "M", "serial", 13026, 4422, null, null, "commander"),   // sol-ring-elven-ltc-408-serial-numbered
  pr(488303, "M", "serial", 13026, 4886, null, 275000, "commander"),   // sol-ring-dwarven-ltc-409-serial-numbered
  pr(528288, "R", "borderless inverted secretlair galaxy", 736, 790, null, 16535, "secret-lair"),   // sol-ring-sld-1494-galaxy-foil
  pr(539393, "U", "", 4320, 4371, 212, 529, "expansion"),   // sol-ring-pip-239
  pr(591107, "U", "", 736, 4358, null, 188, "commander"),   // sol-ring-fdc-2
  pr(594545, "R", "inverted buyabox", 740, 4374, null, 788, "promo"),   // sol-ring-babp-1
  pr(707352, "R", "borderless secretlair", 4320, 283, 529, 580, "secret-lair"),   // sol-ring-sld-2807
  pr(710613, "U", "thelist", 224, 1281, 129, null, "list"),   // sol-ring-list-129-blc
  pr(717788, "U", "", 224, 257, 137, null, "commander"),   // sol-ring-frc-21
  pr(719218, "U", "", 224, 5377, 101, null, "commander"),   // sol-ring-fdc-286
];
const SMOTHERING_TITHE: PrintingFacts[] = [
  pr(183033, "R", "", 224, 4379, 5608, 6034, "expansion"),   // smothering-tithe-rna-22
  pr(200217, "R", "promopack stamped", 228, 5403, 5585, 5859, "promo-pack"),   // smothering-tithe-ppeld-22
  pr(277161, "R", "", 224, 4379, 5794, 5886, "masters"),   // smothering-tithe-2x2-31
  pr(277167, "R", "borderless inverted", 224, 4379, 7069, 8652, "masters"),   // smothering-tithe-2x2-342-borderless
  pr(277169, "R", "inverted etched", 737, 4374, null, 7408, "masters"),   // smothering-tithe-2x2-423-foil-etched
  pr(279245, "R", "judge", 740, 4374, null, 11364, "promo"),   // smothering-tithe-jdg-5
  pr(504303, "M", "borderless inverted fullart", 232, 4379, 7433, 8372, "masters"),   // smothering-tithe-cmm-693-borderless
  pr(504559, "M", "", 224, 4379, 5614, 6186, "masters"),   // smothering-tithe-cmm-57
  pr(504579, "M", "inverted etched", 737, 4374, null, 7273, "masters"),   // smothering-tithe-cmm-473-foil-etched
  pr(509513, "M", "borderless showcase inverted", 224, 4379, 6356, 7571, "masters"),   // smothering-tithe-wot-13
  pr(509562, "M", "borderless inverted anime", 224, 4379, 20889, 41832, "masters"),   // smothering-tithe-wot-67-anime-borderless
  pr(509563, "M", "borderless inverted anime confetti", 736, 4886, null, 176007, "masters"),   // smothering-tithe-wot-87-anime-borderless-confetti-foil
  pr(625666, "R", "borderless inverted secretlair rainbow", 4832, 1814, null, 78547, "secret-lair"),   // smothering-tithe-sld-7009-rainbow-foil
];
const BIRDS_OF_PARADISE: PrintingFacts[] = [
  pr(2831, "R", "", 1248, 4891, 2289, 398075, "core"),   // birds-of-paradise-7ed-231
  pr(8685, "R", "", 224, 4361, 100000, null, "core"),   // birds-of-paradise-leb
  pr(35432, "R", "", 224, 4379, 1209, 1733, "core"),   // birds-of-paradise-m11-165
  pr(38347, "R", "buyabox", 740, 4374, null, 4147, "promo"),   // birds-of-paradise-babp-165
  pr(97411, "R", "ce", 2272, 4361, 8299, null, "gold-border"),   // birds-of-paradise-ced-ce
  pr(165068, "R", "", 2272, 4353, 498, null, "gold-border"),   // birds-of-paradise-2001-jan-tomcani-wcd-7ed
  pr(184820, "R", "", 224, 4361, 1116, null, "deck"),   // birds-of-paradise-gk2-82
  pr(203010, "R", "thelist", 224, 265, 1179, null, "list"),   // birds-of-paradise-list-176
  pr(449377, "R", "retro", 8416, 4385, null, null, "masters"),   // birds-of-paradise-30a-479-retro-frame
  pr(449614, "R", "retro", 224, 4379, 1137, 2881, "masters"),   // birds-of-paradise-dmr-336-retro-frame
  pr(531348, "R", "retro serial", 8930, 4374, null, 149999, "masters"),   // birds-of-paradise-rvr-344-retro-frame-serial-numbered
  pr(560662, "R", "borderless inverted secretlair", 4336, 795, 4423, 5585, "secret-lair"),   // african-swallow-birds-of-paradise-sld-1675
  pr(698193, "R", "", 4320, 1289, 897, null, "commander"),   // birds-of-paradise-msc-170
  pr(719118, "R", "", 224, 5385, 802, null, "commander"),   // birds-of-paradise-fdc-191
];
const RHYSTIC_STUDY: PrintingFacts[] = [
  pr(7357, "C", "", 224, 5403, 5914, 38999, "expansion"),   // rhystic-study-pcy-45
  pr(67188, "C", "", 736, 4374, null, 12312, "commander"),   // rhystic-study-cm1-15
  pr(185032, "R", "judge", 740, 4374, null, 28211, "promo"),   // rhystic-study-jdg-7
  pr(204134, "C", "thelist", 224, 265, 6954, null, "list"),   // rhystic-study-list-45
  pr(216235, "R", "", 224, 4361, 6596, null, "masters"),   // rhystic-study-jmp-169
  pr(259290, "R", "secretlair", 4320, 1819, 6620, 7426, "secret-lair"),   // unstable-harmonics-rhystic-study-sld-478
  pr(454994, "R", "", 224, 4361, 6959, null, "masters"),   // rhystic-study-j22-114
  pr(509518, "M", "borderless showcase inverted", 224, 4379, 8329, 15209, "masters"),   // rhystic-study-wot-25
  pr(509566, "M", "borderless inverted anime", 224, 4379, 16392, 42013, "masters"),   // rhystic-study-wot-71-anime-borderless
  pr(509567, "M", "borderless inverted anime confetti", 736, 4886, null, 154875, "masters"),   // rhystic-study-wot-91-anime-borderless-confetti-foil
  pr(632052, "M", "borderless showcase inverted fullart", 4328, 4379, 11483, 44627, "masters"),   // stay-with-me-rhystic-study-fca-31-showcase
];
const byRank = (rows: readonly PrintingFacts[], unit?: "N" | "F"): number[] => [...rows].sort((a, b) => ordinaryRank(a, unit) - ordinaryRank(b, unit) || a.id - b.id).map((r) => r.id);

test("a bare name opens the ORDINARY printing: Sol Ring, Smothering Tithe, Birds of Paradise and Rhystic Study open their cheapest plain printing, never the dearest", () => {
  assert.equal(ordinaryPrinting(SOL_RING)!.id, 719218, "Sol Ring: Commander: Foundations 286 at US$1.01, not the serialized LTC 409z (US$2,750) nor the non-serialized Elven LTC 408 (US$2,150.99)");
  assert.equal(ordinaryPrinting(SMOTHERING_TITHE)!.id, 183033, "Smothering Tithe: Ravnica Allegiance 22 (US$56.08), not the Anime Confetti Foil (US$1,760.07), and not the Promo Pack copy although it is 23 cents cheaper");
  assert.equal(ordinaryPrinting(BIRDS_OF_PARADISE)!.id, 719118, "Birds of Paradise: Commander: Foundations 191 (US$8.02), not a gold-bordered World Championship copy (US$4.98, not tournament-legal) nor the 7th Edition foil star (US$3,980.75)");
  assert.equal(ordinaryPrinting(RHYSTIC_STUDY)!.id, 7357, "Rhystic Study: Prophecy 45 (US$59.14), not the Anime Confetti Foil (US$1,548.75)");
  for (const rows of [SOL_RING, SMOTHERING_TITHE, BIRDS_OF_PARADISE, RHYSTIC_STUDY]) {
    const pick = ordinaryPrinting(rows)!;
    assert.ok(isOrdinaryPrinting(pick) && !pick.treat && !(pick.flags & (CARD_FLAGS.SERIAL | CARD_FLAGS.PROMO | CARD_FLAGS.ETCHED | CARD_FLAGS.FOILONLY)) && (RELEASE_SET_KINDS as readonly string[]).includes(pick.setKind), `${pick.id} is a plain printing of a main set`);
    const plainN = rows.filter((r) => isOrdinaryPrinting(r)).map((r) => r.marketN!);
    assert.equal(pick.marketN, Math.min(...plainN), `${pick.id} is the cheapest of the ${plainN.length} plain printings by MARKET`);
  }
});

test("the order of printings for a name: plain ones cheapest first, then the other regular ones, then promos and special treatments, then serialized, and a unit with no MARKET last", () => {
  assert.deepEqual(byRank(SOL_RING).slice(0, 7), [719218, 717788, 227075, 539393, 9210, 488291, 488290], "every plain printing first, cheapest MARKET first: US$1.01 ... the Unlimited at US$122.50 and the two LTC Sol Rings");
  assert.equal(ordinaryTier(pr(221310, "R", "", 224, 4379, 952, 2614, "deck")), 1, "Commander Collection: Green is a deck product: regular, not the plain printing");
  assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === 591107)!), 1, "the foil-only Commander: Foundations 2 is regular, but a bare name means the Normal unit");
  for (const id of [710613, 707352, 227076, 194575, 594545, 97622, 122862]) assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === id)!), 2, `${id}: The List, Secret Lair, Extended Art, a promo, a gold-bordered Collector's Edition and a Kaladesh Inventions Masterpiece are special`);
  assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === 488303)!), 3, "serialized");
  assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === 1263)!), 4, "Alpha has only a thin low (US$1,539.99): never ranked by it, after every printing with a market");
  assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === 488302)!), 6, "a serialized printing with no market is last");
  assert.equal(byRank(SOL_RING).at(-1), 488302);
});

test("the Foil view of a name opens the cheapest plain foil (foil-only is fine there), never a Masterpiece", () => {
  const foils = SOL_RING.filter((r) => r.mask & PRICE_MASK.HASF);
  assert.equal(ordinaryPrinting(foils, "F")!.id, 591107, "Commander: Foundations 2 (foil-only, US$1.88)");
  assert.equal(ordinaryTier(SOL_RING.find((r) => r.id === 122862)!, "F"), 2, "the Kaladesh Inventions Sol Ring (rarity Special, US$1,578.48) is a special printing in any view");
  assert.equal(ordinaryPrinting(SMOTHERING_TITHE.filter((r) => r.mask & PRICE_MASK.HASF), "F")!.id, 277161, "the Double Masters 2022 foil (US$58.86), not the Promo Pack foil (US$58.59, a promo), the Foil Etched or the Confetti Foil");
});

test("a card with no plain printing falls back sensibly: the cheapest special printing with a market, a serialized one only when nothing else is priced, a low-only one last", () => {
  const promos = SOL_RING.filter((r) => [38270, 194575, 278573, 594545].includes(r.id));
  assert.equal(ordinaryPrinting(promos)!.id, 194575, "Sol Ring's promos only: the MagicFest promo by its Normal market (US$4.92), not the Judge Gift (US$501.85)");
  assert.equal(ordinaryPrinting(SOL_RING.filter((r) => [488303, 1263].includes(r.id)))!.id, 488303, "a priced serialized printing before a printing with only a thin low");
  assert.equal(ordinaryPrinting(SOL_RING.filter((r) => [488302, 1263].includes(r.id)))!.id, 1263, "nothing priced: the least special, by id");
  assert.equal(ordinaryPrinting(BIRDS_OF_PARADISE.filter((r) => [531348, 449377, 38347].includes(r.id)))!.id, 38347, "the Buy-a-Box promo (US$41.47) before the serialized Retro Frame (US$1,499.99) and the low-only 30th Anniversary");
  assert.equal(ordinaryPrinting([]), undefined);
});

// ── the planner, the typeahead and the lists over published files ────────────────────────────────────────────────────────────────

async function over<T>(root: string, run: () => Promise<T>): Promise<T> {
  const was = process.env.PLANE_DIR; process.env.PLANE_DIR = root; resetPlaneForTests();
  try { return await run(); } finally { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); }
}
const ids = (p: { items: { id: number }[] }): number[] => p.items.map((c) => c.id);

test("the 57 real products: names, reskin names, set + number, set + name, finish and treatment words reach the right product", async () => {
  const dir = writePlaneDir(realMiniTree());
  try {
    await over(dir, async () => {
      const { searchCards, searchNames, suggestNames, getCardPage } = await import("../src/lib/data");
      assert.deepEqual(ids(await searchCards("sol ring")), [594545], "Sol Ring: the Battle for Baldur's Gate promo");
      assert.deepEqual(ids(await searchCards("Fire // Ice")), [457193], "Fire // Ice (dmr 215), punctuation ignored");
      assert.deepEqual(ids(await searchCards("fire ice")), [457193], "two all-letter words are a name");
      assert.deepEqual(ids(await searchCards("counterspell mh2")), [238617]);
      assert.deepEqual(ids(await searchCards("khan engineered evil")), [706216], "the printed (reskin) name finds the Sheoldred printing");
      assert.deepEqual(ids(await searchCards("sheoldred")), [706216]);
      assert.deepEqual(ids(await searchCards("megatron")), [456592], "Megatron is the printed name of an SLD Blightsteel Colossus");
      assert.deepEqual(ids(await searchCards("7ed 231")), [2831], "set + number: the shared-id Birds of Paradise");
      assert.deepEqual(ids(await searchCards("pbro 165p")), [453935], "the p suffix is identity");
      assert.deepEqual(ids(await searchCards("sld 1079")), [456592]);
      assert.deepEqual(ids(await searchCards("birds of paradise 7ed")), [2831], "a name and an all-letter code that is no word in the name: the miss is retried as a set");
      assert.equal((await searchCards("zzzzzz nothing")).total, 0);
      assert.equal((await searchCards("who what when where why")).total, 1, "`who` is a word here, the unset card is found");
      const foil = await searchCards("foil", { sort: "price-desc" });
      assert.ok(foil.total > 20 && foil.items.every((c) => c.headFinish === "F"), "the finish word is the unit view: every price on the page is the Foil one");
      const sol = await searchCards("sol ring foil");
      assert.deepEqual(ids(sol), [594545]);
      assert.equal(sol.items[0]!.headFinish, "F");
      // getCardPage with q goes through the same planner (the browse page and the search page share it)
      assert.deepEqual(ids(await getCardPage({ q: "7ed 231" })), [2831]);
      // the typeahead: one row per ORACLE card, the printed name found too
      assert.deepEqual((await searchNames("sol r", 5)).map((h) => h.name), ["Sol Ring"]);
      const khan = await searchNames("khan engin", 5);
      assert.deepEqual(khan.map((h) => [h.name, h.alt]), [["Sheoldred, the Apocalypse", "Khan, Engineered Evil"]]);
      assert.deepEqual((await searchNames("b", 5)), [], "one letter is not a query");
      assert.deepEqual(await suggestNames("birds of paridise"), ["Birds of Paradise"]);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const SAMPLE = process.env.PLANE_SAMPLE_DIR ? path.dirname(path.resolve(process.env.PLANE_SAMPLE_DIR)) : path.resolve(__dirname, "../.data");
test("THE REAL CATALOGUE (Annex C check 9; skipped without a dataset): mh3 6, bolt m11, fire ice, war room, black lotus lea, the reskin names, nicknames", { skip: !fs.existsSync(path.join(SAMPLE, "v1", "ix", "dict.json")) }, async () => {
  await over(SAMPLE, async () => {
    const { searchCards, searchNames, getOracleAZ } = await import("../src/lib/data");
    const slugs = async (q: string): Promise<string[]> => (await searchCards(q, { per: 100 })).items.map((c) => c.slug);
    assert.deepEqual(await slugs("mh3 6"), ["emrakul-the-world-anew-mh3-6"], "set + number: Emrakul, the World Anew");
    assert.deepEqual(await slugs("bolt m11"), ["lightning-bolt-m11-149"], "name + set: found though dozens of cards have Bolt in the name");
    const fire = await slugs("fire ice");
    assert.ok(fire.includes("fire-ice-dmr-215") && fire.every((s) => /^fire-ice/.test(s)), "Fire // Ice, not a set filter and not every card with both words");
    const war = await slugs("war room");
    assert.ok(war.length > 3 && war.every((s) => /war-room/.test(s)), "War Room is a name, `war` is not the War of the Spark filter");
    assert.ok((await slugs("scroll rack")).length >= 3 && (await slugs("scroll rack")).every((s) => /scroll-rack/.test(s)), "`scroll` is a treatment word, but Scroll Rack is a name: the request that finds nothing is read as a name");
    assert.ok((await slugs("armorcraft judge")).length >= 1 && (await slugs("armorcraft judge")).every((s) => /^armorcraft-judge/.test(s)), "`judge` is a promo treatment word too");
    assert.deepEqual(await slugs("sol ring mh3"), [], "a set that has no Sol Ring is an empty page, not every Sol Ring");
    assert.deepEqual(await slugs("black lotus lea"), ["black-lotus-lea"], "an all-letter code at the end of a name that finds nothing is a set after all");
    assert.ok((await slugs("khan engineered evil")).some((s) => s.startsWith("sheoldred-the-apocalypse")), "the reskin name finds the card");
    assert.ok((await slugs("sheoldred")).some((s) => s.startsWith("sheoldred-the-apocalypse")));
    assert.ok((await slugs("bob")).some((s) => s.startsWith("dark-confidant")), "the nickname");
    assert.ok((await slugs("goyf")).some((s) => s.startsWith("tarmogoyf")), "the nickname");
    assert.ok((await slugs("the one ring")).some((s) => s.startsWith("the-one-ring")));
    assert.deepEqual((await searchNames("lightning bo", 3)).map((h) => h.name)[0], "Lightning Bolt");
    const az = await getOracleAZ("L", 1);
    assert.equal(az.items.length, 100);
    assert.ok(az.total > 200 && az.items.every((o) => o.name.toLowerCase().startsWith("l")));
  });
});
