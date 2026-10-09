// The search grammar and its planner (Annex C check 9; contract 7.6). Owner WP07. The grammar is pure and runs over real Scryfall set codes; the planner and the typeahead run over a published tree of the 57 REAL products of
// tests/fixtures/magic-products.json (Sol Ring, Birds of Paradise, Fire // Ice, Counterspell, Sheoldred ...) and, when a dataset is on disk (PLANE_SAMPLE_DIR, or .data from `npm run import:bootstrap`), over the real catalogue too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NICKNAMES, didYouMean, editDistance, nameTier, nicknameTargets, parseSearch } from "../src/lib/search";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

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
