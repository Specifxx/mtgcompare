// src/lib/catalog.ts (owner WP01a): TCGCSV parsing, slugs, the product-name grammar. Real data throughout: the 57 products of tests/fixtures/magic-products.json (each with the slug, set token, class,
// rarity, finish flags, number keys and display name it must get), the 454 groups of tests/fixtures/tcgcsv-groups.json, real product names of the 2026-10-07 snapshot for every family of the grammar,
// and (with MTG_LAB set to the research snapshot) all 111,839 included singles for the collision count.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as K from "../src/lib/catalog";
import * as C from "../src/lib/constants";

interface Fx {
  productId: number; rule: string; name: string; groupId: number; group: string; groupKind: C.SetKind; tcgNumber: string | null; tcgRarity: string | null;
  prices: Record<string, { market: number | null; low: number | null }>;
  expect: { slug: string; setTok: string; cls: number | "sealed"; rarity: string | null; nkey: string | null; nsort: number; displayName: string | null };
  scryfall: { cn: string }[];
}
interface Group { groupId: number; name: string; abbreviation: string; publishedOn: string; kind: C.SetKind | "foreign" | "non-card" }
const FIX = path.resolve(__dirname, "fixtures");
const fixtures: Fx[] = JSON.parse(fs.readFileSync(path.join(FIX, "magic-products.json"), "utf8"));
const groups: Group[] = JSON.parse(fs.readFileSync(path.join(FIX, "tcgcsv-groups.json"), "utf8"));
const included = groups.filter((g) => g.kind !== "foreign" && g.kind !== "non-card");
const toks = K.chooseSetToks(included.map((g) => ({ groupId: g.groupId, abbreviation: g.abbreviation, kind: g.kind as C.SetKind })), new Map());
const fx = (id: number): Fx => fixtures.find((f) => f.productId === id)!;
// the Scryfall set codes the grammar can see; the real ones for every set these tests name
const CODES: ReadonlySet<string> = new Set(["4ed", "fem", "8ed", "war", "bro", "khc", "m10", "m11", "evg", "gvl", "jvc", "dvd", "ugl", "afr", "all", "ced", "sld", "who", "fnm"]);
const parse = (name: string, groupKind: C.SetKind) => K.parseTcgName(name, { setCodes: CODES, groupKind });

// ── constants of the source ──
test("TCGCSV category 1 is Magic; the product's cleaned names and cents are OP's, unchanged", () => {
  assert.equal(K.TCGCSV_CATEGORY, 1);
  assert.equal(K.TCGCSV_BASE, "https://tcgcsv.com/tcgplayer/1");
  assert.equal(K.largeImage(2831), "https://tcgplayer-cdn.tcgplayer.com/product/2831_in_1000x1000.jpg");
  assert.deepEqual([K.toCents(4.21), K.toCents(1845.6), K.toCents(25.26), K.toCents(0), K.toCents(null), K.toCents(undefined), K.toCents(Number.NaN)], [421, 184560, 2526, 0, null, null, null]);
});

// ── slugs ──
test("slugify: ASCII, '&' is 'and', quotes dropped, runs of anything else are one '-', capped at 90; ligatures first (critique 12)", () => {
  assert.equal(K.slugify("Sol Ring"), "sol-ring");
  assert.equal(K.slugify("Fire // Ice"), "fire-ice");
  assert.equal(K.slugify("Kayla's Music Box"), "kaylas-music-box");
  assert.equal(K.slugify("Kayla’s Music Box"), "kaylas-music-box");
  assert.equal(K.slugify("Black & White Foil"), "black-and-white-foil");
  assert.equal(K.slugify("Æther Vial"), "aether-vial");
  assert.equal(K.slugify("Ætherling"), "aetherling");
  assert.equal(K.slugify("Æther Flash"), "aether-flash");
  assert.equal(K.slugify("Lim-Dûl's Vault"), "lim-duls-vault");
  assert.equal(K.slugify("Jötun Grunt"), "jotun-grunt");
  assert.equal(K.slugify("Œuvre"), "oeuvre");
  assert.equal(K.slugify("Straße"), "strasse");
  assert.equal(K.slugify("Łódź"), "lodz");
  assert.equal(K.slugify("Đ and Þ and Ð and Ø"), "d-and-th-and-d-and-o");
  assert.equal(K.slugify("  --Sword of _ and _--  "), "sword-of-and");
  assert.equal(K.slugify(""), "");
  assert.equal(K.slugify("a".repeat(120)).length, 90);
  assert.ok(!K.slugify(`${"a".repeat(89)} b`).endsWith("-"), "a cut never leaves a trailing hyphen");
});
test("the 439 included groups get 439 distinct write-once tokens; WHO and MOC are each shared by two groups and the second one gets g<groupId>", () => {
  assert.equal(included.length, 439);
  assert.equal(toks.size, 439);
  assert.equal(new Set(toks.values()).size, 439);
  assert.deepEqual([toks.get(23165), toks.get(23166)], ["who", "g23166"]);
  assert.equal(toks.get(23444), "mh3", "Modern Horizons 3");
  assert.equal(toks.get(22979), "moc", "Commander: March of the Machine wins MOC over Planechase: March of the Machine (a deck)");
  assert.equal(toks.get(23109), "g23109");
  assert.deepEqual([...toks].filter(([, t]) => /^g\d+$/.test(t)).map(([id]) => id).sort((a, b) => a - b).filter((id) => id === 23166 || id === 23109), [23109, 23166], "the two losers of a shared abbreviation");
  assert.ok([...toks.values()].every((t) => /^[a-z0-9-]+$/.test(t)));
});
test("a stored token is never reassigned: `frozen` tokens come back unchanged and count as taken; a group with no abbreviation gets g<groupId>", () => {
  const out = K.chooseSetToks([{ groupId: 1, abbreviation: "MH3", kind: "masters" }, { groupId: 2, abbreviation: "MH3", kind: "expansion" }, { groupId: 3, abbreviation: "", kind: "promo" }], new Map([[1, "mh3"]]));
  assert.deepEqual([out.get(1), out.get(2), out.get(3)], ["mh3", "g2", "g3"], "group 1 already holds mh3, so group 2 cannot take it");
  const fresh = K.chooseSetToks([{ groupId: 10, abbreviation: "WHO", kind: "commander" }, { groupId: 11, abbreviation: "WHO", kind: "expansion" }], new Map());
  assert.deepEqual([fresh.get(11), fresh.get(10)], ["who", "g10"], "expansion outranks commander for the shared abbreviation");
});
test("slugBase over the 57 fixtures: the slug, the number token and the key of every real product (sealed products use sealedSlugOf)", () => {
  let n = 0;
  for (const f of fixtures) {
    const tok = toks.get(f.groupId)!;
    assert.equal(tok, f.expect.setTok, `${f.productId} token`);
    const slug = f.expect.cls === "sealed" ? K.sealedSlugOf(f.name, f.productId, false) : K.slugBase({ productId: f.productId, name: f.name, number: f.tcgNumber }, tok);
    assert.equal(slug, f.expect.slug, `${f.productId} ${f.name}`);
    n++;
    if (f.expect.cls !== "sealed") {
      const num = f.scryfall.map((r) => r.cn).sort((a, b) => Number(/[★†]/.test(a)) - Number(/[★†]/.test(b)))[0] ?? f.tcgNumber;
      assert.equal(C.nkey(num), f.expect.nkey || null, `${f.productId} nkey`);
      assert.equal(C.nsort(num), f.expect.nsort, `${f.productId} nsort`);
    }
  }
  assert.equal(n, 57);
});
test("the digits of a name are the collector number: first 1 to 4 digits wins, later digit groups stay text; numberToken drops zeros and /total", () => {
  const tok = (id: number): string => toks.get(fx(id).groupId)!;
  assert.equal(K.slugBase({ productId: 496078, name: "Forest (0205)", number: "205" }, tok(496078)), "forest-who-205");
  assert.equal(K.slugBase({ productId: 692998, name: "Stingcaster Mage (Borderless) (Facet Foil) (0457)", number: "457" }, tok(692998)), "stingcaster-mage-fra-457-borderless-facet-foil", "the number is the LAST group here");
  assert.equal(K.slugBase({ productId: 478655, name: "Soldier (007) // Angel (002) Double-Sided Token", number: "7 // 2" }, tok(478655)), "soldier-angel-double-sided-token-onc-7-2", "the second face number stays text");
  assert.equal(K.slugBase({ productId: 4536, name: "Reef Pirates [Version 2]", number: "36" }, tok(4536)), "reef-pirates-hml-36-version-2");
  assert.equal(K.slugBase({ productId: 1, name: "Sol Ring", number: null }, "c21"), "sol-ring-c21", "no number, nothing invented");
  assert.equal(K.slugBase({ productId: 99, name: "?!", number: null }, ""), "card-99", "an empty slug becomes card-<productId>");
  assert.deepEqual([K.numberToken("029/281"), K.numberToken("7 // 2"), K.numberToken("A39"), K.numberToken("551a"), K.numberToken(""), K.numberToken(null), K.numberToken("0007")], ["29", "7", "a39", "551a", "", "", "7"]);
  assert.deepEqual(K.splitGroups("Soldier // Angel (0007) Double-Sided Token (Foil)"), { core: "Soldier // Angel Double-Sided Token", tokens: ["0007", "Foil"] });
  assert.deepEqual(K.splitGroups("Reef Pirates [Version 2]"), { core: "Reef Pirates", tokens: ["Version 2"] });
});
test("the three real slug collisions: the first writer (the lower productId) keeps the bare slug, the other gets -p<productId>", () => {
  const sa = (id: number, name: string, number: string): string => K.slugBase({ productId: id, name, number }, toks.get(3178)!);
  assert.equal(toks.get(3178), "30a-p");
  assert.equal(sa(284921, "Serra Angel (001)", "1"), sa(284951, "Serra Angel", "1"));
  assert.equal(sa(284921, "Serra Angel (001)", "1"), "serra-angel-30a-p-1");
  assert.equal(K.withProductSuffix("serra-angel-30a-p-1", 284951), "serra-angel-30a-p-1-p284951");
  const kemba = (id: number, name: string, number: string): string => K.slugBase({ productId: id, name, number }, toks.get(23270)!);
  assert.equal(kemba(509268, "Kemba, Kha Regent Art Card", "2"), kemba(509357, "Kemba, Kha Regent Art Card (2)", "51"));
  assert.equal(kemba(509267, "Kemba, Kha Regent Art Card (Gold-Stamped Signature)", "2"), kemba(509356, "Kemba, Kha Regent Art Card (2) (Gold-Stamped Signature)", "51"));
  assert.equal(kemba(509268, "Kemba, Kha Regent Art Card", "2"), "kemba-kha-regent-art-card-ascmm-2");
  assert.ok(K.withProductSuffix("x".repeat(90), 1).length <= 80 + "-p1".length, "the suffix form is cut to 80 first");
});
test("set, oracle and sealed slugs: bucket groups are named by the group alone; the oldest oracle keeps the bare slug; a 100-character sealed name is cut", () => {
  assert.equal(K.setSlugOf({ name: "Modern Horizons 3", bucket: false }, "mh3"), "mh3-modern-horizons-3");
  assert.equal(K.setSlugOf({ name: "Prerelease Cards", bucket: true }, "pre"), "prerelease-cards");
  assert.equal(K.oracleSlugOf({ id: "0123456789abcdef", name: "Sol Ring" }, false), "sol-ring");
  assert.equal(K.oracleSlugOf({ id: "0123456789abcdef", name: "Sol Ring" }, true), "sol-ring-01234567");
  assert.equal(K.oracleSlugOf({ id: "0123456789abcdef", name: "Æther Vial" }, true), "aether-vial-01234567");
  assert.equal(K.oracleSlugOf({ id: "0123456789abcdef", name: "///" }, false), "card-01234567");
  assert.equal(K.sealedSlugOf("Star Trek - Play Booster Pack", 706136, false), "star-trek-play-booster-pack");
  assert.equal(K.sealedSlugOf("Star Trek - Play Booster Pack", 706136, true), "star-trek-play-booster-pack-706136");
  assert.equal(K.sealedSlugOf("", 5, false), "sealed-5");
  assert.equal(fx(686671).expect.slug.length <= 80, true);
});
test("setDisplayName and setCodeOf: the group name verbatim; the dominant Scryfall code, else the abbreviation, else G<groupId>", () => {
  const g = (groupId: number): Group => groups.find((x) => x.groupId === groupId)!;
  assert.equal(K.setDisplayName(g(23444)), "Modern Horizons 3");
  const scry: K.ScrySetRef = { code: "mh3", name: "Modern Horizons 3", setType: "draft_innovation", tcgplayerId: 23444, releasedAt: "2024-06-14", parentSetCode: null, digital: false };
  assert.equal(K.setCodeOf(g(23444), scry), "MH3");
  assert.equal(K.setCodeOf({ groupId: 23165, abbreviation: "WHO" }), "WHO");
  assert.equal(K.setCodeOf({ groupId: 2576, abbreviation: "SLD" }, { ...scry, code: "sld" }), "SLD");
  assert.equal(K.setCodeOf({ groupId: 77, abbreviation: "" }), "G77");
  assert.equal(K.setCodeOf({ groupId: 77, abbreviation: "  " }, null), "G77");
});

// ── prices ──
test("finishPrices: one row per finish; Etched and other subtypes are counted, not priced; a low under 25% of a market of $5 or more is dropped (real prices)", () => {
  // Suntail Hawk, 8th Edition (11011): Foil market $8.11, low $0.25; Obliterate (11164): Foil market $55.47, low $12.30
  const hawk = K.finishPrices([{ productId: 11011, subTypeName: "Foil", marketPrice: 8.11, lowPrice: 0.25 }]);
  assert.deepEqual(hawk.f, { marketCents: 811, lowCents: null }, "$0.25 is under a quarter of $8.11");
  assert.equal(hawk.n, null);
  assert.deepEqual(K.finishPrices([{ productId: 11164, subTypeName: "Foil", marketPrice: 55.47, lowPrice: 12.3 }]).f, { marketCents: 5547, lowCents: null });
  assert.deepEqual(K.finishPrices([{ productId: 453935, subTypeName: "Normal", marketPrice: 5.97, lowPrice: 3.25 }]).n, { marketCents: 597, lowCents: 325 }, "Skitterbeam Battalion: 54% is plausible");
  assert.equal(K.plausibleLow(24, 100), 24, "under $5 the guard does not apply");
  assert.equal(K.plausibleLow(124, 500), null);
  assert.equal(K.plausibleLow(125, 500), 125);
  assert.equal(K.plausibleLow(null, 500), null);
  const mixed = K.finishPrices([{ productId: 1, lowPrice: 0.5, marketPrice: 10, subTypeName: "Normal" }, { productId: 1, lowPrice: 3, marketPrice: null, subTypeName: "Foil" }, { productId: 1, lowPrice: 1, marketPrice: 1, subTypeName: "Etched" }]);
  assert.deepEqual(mixed.unknownSubtypes, ["Etched"]);
  assert.deepEqual(mixed.f, { marketCents: null, lowCents: 300 });
});

// ── classes ──
test("productClass: an art card, an oversized card, a token and a helper card are not cards; the layout of a joined row and the group kind decide before the name", () => {
  assert.equal(K.productClass({ name: "Flickering Hound Art Card (2/54)", rarity: "S" }, "art-series", null), C.CARD_CLASS.ART);
  assert.equal(K.productClass({ name: "Sol Ring Art Card", rarity: "S" }, "expansion", null), C.CARD_CLASS.ART, "the name alone says Art Card");
  assert.equal(K.productClass({ name: "Anything", rarity: "S" }, "expansion", { layout: "art_series", oversized: false }), C.CARD_CLASS.ART);
  assert.equal(K.productClass({ name: "Rukh Egg (8th Edition) (Box Topper)", rarity: "P" }, "oversized", null), C.CARD_CLASS.OVERSIZED);
  assert.equal(K.productClass({ name: "Ashnod (Oversize)", rarity: "R" }, "deck", { layout: "normal", oversized: true }), C.CARD_CLASS.OVERSIZED, "the Scryfall flag, when joined");
  assert.equal(K.productClass({ name: "Soldier // Angel Double-Sided Token", rarity: "T" }, "commander", null), C.CARD_CLASS.TOKEN);
  assert.equal(K.productClass({ name: "Treasure Token (2018 Lunar New Year Promo)", rarity: "P" }, "promo", { layout: "token", oversized: false }), C.CARD_CLASS.TOKEN, "Promo on TCGplayer, a token for Scryfall");
  assert.equal(K.productClass({ name: "Emblem - Chandra, Chill of Compliance", rarity: "R" }, "expansion", { layout: "emblem", oversized: false }), C.CARD_CLASS.TOKEN);
  assert.equal(K.productClass({ name: "Rules Card (WAR Bundle)", rarity: "T" }, "promo", null), C.CARD_CLASS.HELPER);
  assert.equal(K.productClass({ name: "Heroes Theme Card", rarity: "T" }, "commander", null), C.CARD_CLASS.HELPER);
  assert.equal(K.productClass({ name: "Kayla's Music Box (Extended Art)", rarity: "R" }, "commander", { layout: "normal", oversized: false }), C.CARD_CLASS.CARD, "a single with Box in the name is still a card");
  assert.equal(K.productClass({ name: "Sol Ring", rarity: "R" }, "promo", null), C.CARD_CLASS.CARD);
});

// ── the grammar: every fixture ──
interface Want { treat: string; base: string; label: string | null; dash?: string; digit?: string; faceDigits?: string[]; index?: string; src?: string; version?: string; event?: { year: number; player: string }; pack?: string; sb?: true; words?: string[]; groupTreat?: C.TreatmentKey }
const GRAMMAR: Record<number, Want> = {
  496078: { treat: "", base: "Forest", label: null, digit: "205" },
  638920: { treat: "borderless galaxy", base: "Plains", label: "Borderless · Galaxy Foil", digit: "367" },
  692998: { treat: "borderless facet", base: "Stingcaster Mage", label: "Borderless · Facet Foil", digit: "457" },
  719547: { treat: "retro serial doublerainbow", base: "Bloodline Recollector", label: "Retro Frame · Serialized · Double Rainbow Foil" },
  541332: { treat: "etched", base: "Ezio Auditore da Firenze", label: "Foil Etched" },
  251776: { treat: "etched", base: "Griselbrand", label: "Secret Lair · Foil Etched", groupTreat: "secretlair" },
  532997: { treat: "display", base: "Mirko, Obsessive Theorist", label: "Display Commander", dash: "thick" },
  594545: { treat: "", base: "Sol Ring", label: "Buy-a-Box", groupTreat: "buyabox" },
  286677: { treat: "display surge", base: "Inquisitor Greyfax", label: "Display Commander · Surge Foil", dash: "thick" },
  238617: { treat: "", base: "Counterspell", label: null },
  697908: { treat: "surge", base: "War Machine, Avenging Arsenal", label: "Surge Foil" },
  2831: { treat: "", base: "Birds of Paradise", label: null },
  3077: { treat: "", base: "Shivan Dragon", label: null },
  609611: { treat: "", base: "Delver of Secrets", label: null },
  513650: { treat: "", base: "Brazen Borrower", label: null },
  457193: { treat: "", base: "Fire // Ice", label: null },
  208535: { treat: "", base: "Who // What // When // Where // Why", label: null },
  12430: { treat: "", base: "Erayo, Soratami Ascendant", label: null },
  456592: { treat: "", base: "Megatron - Blightsteel Colossus", label: "Secret Lair", dash: "reskin?", groupTreat: "secretlair" },
  560662: { treat: "", base: "African Swallow - Birds of Paradise", label: "Secret Lair", dash: "reskin?", groupTreat: "secretlair" },
  706216: { treat: "borderless", base: "Khan, Engineered Evil - Sheoldred, the Apocalypse", label: "Borderless", dash: "reskin?" },
  652038: { treat: "borderless", base: "Spider-Gwen, Web-Warrior - Najeela, the Blade-Blossom", label: "Borderless", dash: "reskin?" },
  253194: { treat: "", base: "Lucy Westenra - Innocent Traveler", label: null, dash: "reskin?" },
  541495: { treat: "showcase", base: "Toxic Sheepsquatch - Gemrazer", label: "Showcase", dash: "reskin?" },
  478655: { treat: "", base: "Soldier // Angel Double-Sided Token", label: null, digit: "7", faceDigits: ["2"] },
  542621: { treat: "", base: "Food // Copy Double-Sided Token", label: null, digit: "12" },
  584510: { treat: "", base: "Punch Card Token", label: null, index: "1//2" },
  720960: { treat: "", base: "Emblem - Chandra, Chill of Compliance // Emblem - Chandra, Torch of Defiance Double-Sided Token", label: null, dash: "emblem" },
  536485: { treat: "", base: "Case of the Locked Hothouse", label: "Prerelease", groupTreat: "prerelease" },
  533889: { treat: "", base: "Case of the Locked Hothouse", label: null },
  719572: { treat: "", base: "The Theorist, Jace Beleren", label: "Promo Pack", groupTreat: "promopack" },
  453935: { treat: "", base: "Skitterbeam Battalion", label: "Promo Pack", groupTreat: "promopack" },
  158462: { treat: "", base: "Armageddon", label: "1996 Bertrand Lestree · from 4ED", src: "4ed", event: { year: 1996, player: "Bertrand Lestree" }, dash: "event" },
  158496: { treat: "sb", base: "Order of Leitbur", label: "1996 Bertrand Lestree · from FEM · Sideboard · Group", src: "fem", event: { year: 1996, player: "Bertrand Lestree" }, sb: true, words: ["Group"], dash: "event" },
  173922: { treat: "", base: "Forest", label: "2003 Daniel Zink · from 8ED", digit: "348", src: "8ed", event: { year: 2003, player: "Daniel Zink" }, dash: "event" },
  97396: { treat: "ce", base: "Air Elemental", label: "Collector's Edition", groupTreat: "ce" },
  21668: { treat: "", base: "Forest", label: "Clear Pack · Beard, Jr.", pack: "Clear Pack", words: ["Beard, Jr."], dash: "pack" },
  80110: { treat: "", base: "Royal Herbalist", label: "Man", words: ["Man"] },
  4536: { treat: "", base: "Reef Pirates", label: "Version 2", version: "Version 2" },
  286903: { treat: "", base: "The Superlatorium", label: "Version 2-3-6", version: "2-3-6" },
  152906: { treat: "", base: "Very Cryptic Command", label: "Version B", version: "B" },
  630946: { treat: "borderless neon", base: "Traveling Chocobo", label: "Borderless · Neon Ink Foil" },
  660625: { treat: "", base: "Dandan", label: "Secret Lair", digit: "2138", groupTreat: "secretlair" },
  165632: { treat: "", base: "Treasure Token", label: "2018 Lunar New Year Promo", words: ["2018 Lunar New Year Promo"] },
  718476: { treat: "stamped", base: "Flickering Hound Art Card", label: "Stamped", index: "2/54" },
  174434: { treat: "", base: "Rukh Egg", label: "8th Edition · Box Topper", words: ["8th Edition", "Box Topper"] },
  189807: { treat: "bundle", base: "Rules Card", label: "Bundle · from WAR", src: "war" },
  649283: { treat: "jp", base: "Clue Token", label: "Japan Showcase · WPN / Gateway · Metal Promo", words: ["Metal Promo"], groupTreat: "wpn" },
  686671: { treat: "", base: "Secret Lair Drop: Secret Lair x Marvel's Deadpool: FINAL_final_REALLYfinal_v7_USETHISONE_Everything Bundle", label: "Secret Lair", digit: "2", groupTreat: "secretlair" },
  452492: { treat: "extended", base: "Kayla's Music Box", label: "Extended Art" },
  485192: { treat: "", base: "Sword of _ and _", label: null },
  557904: { treat: "rainbow", base: "Encore Electromancer - Snapcaster Mage", label: "Secret Lair · Rainbow Foil", dash: "reskin?", groupTreat: "secretlair" },
  664143: { treat: "", base: "Phila, Unsealed", label: "Reprint", words: ["Reprint"] },
  1042: { treat: "", base: "Black Lotus", label: null },
  8687: { treat: "", base: "Black Lotus", label: null },
  8989: { treat: "", base: "Black Lotus", label: null },
  449401: { treat: "retro", base: "Living Artifact", label: "Retro Frame" },
};
const groupTreatOf = (name: string): C.TreatmentKey | null => C.GROUP_TREATMENTS.find(([rx]) => rx.test(name))?.[1] ?? null;
test("parseTcgName and labelOf on all 57 real fixtures: treatment keys, the base name, the label, and every token class (number, index, source set, version, event, pack, sideboard, leftover words)", () => {
  assert.deepEqual(Object.keys(GRAMMAR).map(Number).sort((a, b) => a - b), fixtures.map((f) => f.productId).sort((a, b) => a - b), "every fixture has an expectation");
  for (const f of fixtures) {
    const w = GRAMMAR[f.productId]!;
    const p = parse(f.name, f.groupKind);
    const gt = groupTreatOf(f.group);
    const at = `${f.productId} ${f.name}`;
    assert.equal(p.treat.join(" "), w.treat, `${at}: treat`);
    assert.equal(p.base, w.base, `${at}: base`);
    assert.equal(K.labelOf(p, gt), w.label, `${at}: label`);
    assert.equal(gt, w.groupTreat ?? null, `${at}: group treatment`);
    assert.equal(p.dash?.kind, w.dash, `${at}: dash`);
    assert.equal(p.digit, w.digit ?? null, `${at}: digit`);
    assert.deepEqual(p.faceDigits, w.faceDigits ?? [], `${at}: face digits`);
    assert.equal(p.index, w.index ?? null, `${at}: index`);
    assert.equal(p.src, w.src ?? null, `${at}: source set`);
    assert.equal(p.version, w.version ?? null, `${at}: version`);
    assert.deepEqual(p.event, w.event ?? null, `${at}: event`);
    assert.equal(p.pack, w.pack ?? null, `${at}: pack`);
    assert.equal(p.sideboard, w.sb ?? false, `${at}: sideboard`);
    assert.deepEqual(p.words, w.words ?? [], `${at}: leftover words`);
    assert.equal(p.core, K.splitGroups(f.name).core, `${at}: core is the slug input`);
    assert.deepEqual(p.tokens, K.splitGroups(f.name).tokens, `${at}: tokens`);
    assert.ok(p.treat.every((k) => (C.TREATMENT_KEYS as readonly string[]).includes(k)), `${at}: only keys of the closed vocabulary, never raw:`);
    assert.deepEqual(p.treat, C.TREATMENT_KEYS.filter((k) => p.treat.includes(k)), `${at}: in vocabulary order`);
  }
});
test("the closed vocabulary: a word it does not know is text in the label and in `words`, never a key; finish words never become either", () => {
  const p = parse("Forest - Clear Pack (Beard, Jr.)", "promo");
  assert.deepEqual([p.treat, p.words], [[], ["Beard, Jr."]]);
  assert.equal(K.labelOf(parse("Plains (Foil)", "expansion"), null), null, "(Foil) is a finish word");
  assert.equal(K.labelOf(parse("Plains (Nonfoil) (Regular)", "expansion"), null), null);
  assert.equal(K.labelOf(parse("Plains (Galaxy Foil)", "expansion"), null), "Galaxy Foil", "the pattern is a key; 'Foil' is not text");
  assert.equal(parse("Traveling Chocobo (Borderless) (Neon Ink Yellow)", "expansion").treat.join(" "), "borderless neon", "a prefix synonym takes the rest of the token");
  assert.deepEqual(parse("Plains (Borderless Frobnicated)", "expansion").words, ["Frobnicated"], "the longest known phrase wins, the rest is text");
});

// ── the grammar: the families that the closed vocabulary does not cover, decided one by one (decisions/WP01a-name-grammar-families.md) ──
// Each row is a REAL product of the 2026-10-07 snapshot. A row says what the family becomes: keys (treat), the label, the source set and the language.
const FAMILIES: { name: string; kind: C.SetKind; treat: string; label: string | null; src?: string; lang?: string; words?: string[]; why: string }[] = [
  // class words: the class (productClass) already says it, so no key; the text stays in the label
  { name: "Chillerpillar (Art Series)", kind: "art-series", treat: "", label: "Art Series", words: ["Art Series"], why: "class word, 54 products" },
  { name: "Ashnod (Oversize)", kind: "deck", treat: "", label: "Oversize", words: ["Oversize"], why: "class word, 32 products" },
  { name: "Indoraptor, the Perfect Hybrid (Borderless) (Emblem)", kind: "masters", treat: "borderless", label: "Borderless · Emblem", words: ["Emblem"], why: "class word, 19 products" },
  // events and reprints of Japan are NOT the Japan Showcase art key
  { name: "Elvish Champion (Japan Junior Tournament)", kind: "promo", treat: "", label: "Japan Junior Tournament", words: ["Japan Junior Tournament"], why: "an event, 11 products" },
  { name: "Ihsan's Shade (Hobby Japan Reprint)", kind: "promo", treat: "", label: "Hobby Japan Reprint", words: ["Hobby Japan Reprint"], why: "a reprint line, 5 products" },
  { name: "Lu Bu, Master-at-Arms (Japan 4/29/99)", kind: "promo", treat: "", label: "Japan 4/29/99", words: ["Japan 4/29/99"], why: "a dated event" },
  // a language word sets the language and its key; the rest of the token stays text
  { name: "Goblin Chieftain (Japanese Promo)", kind: "promo", treat: "lang-ja", label: "Japanese · Promo", lang: "japanese", words: ["Promo"], why: "language plus text, 4 products" },
  { name: "Jace Beleren (Japanese Alternate Art)", kind: "deck", treat: "lang-ja", label: "Japanese · Alternate Art", lang: "japanese", words: ["Alternate Art"], why: "language plus text, 2 products" },
  { name: "Traveling Chocobo (Borderless) (Japanese Exclusive)", kind: "expansion", treat: "borderless lang-ja", label: "Borderless · Japanese · Exclusive", lang: "japanese", words: ["Exclusive"], why: "language plus text" },
  { name: "Gala Greeters (Chinese Simplified)", kind: "promo", treat: "lang-zh", label: "Chinese · Simplified", lang: "chinese", words: ["Simplified"], why: "language plus text" },
  { name: "Gala Greeters (Chinese Traditional)", kind: "promo", treat: "lang-zh", label: "Chinese · Traditional", lang: "chinese", words: ["Traditional"], why: "language plus text" },
  { name: "Gala Greeters (Korean)", kind: "promo", treat: "lang-ko", label: "Korean", lang: "korean", why: "a bare language token" },
  { name: "Vorstclaw (Spanish)", kind: "list", treat: "lang-es", label: "Spanish", lang: "spanish", why: "a bare language token" },
  // Phyrexian is an art key (a fictional script on the card), not a language
  { name: "Elesh Norn, Mother of Machines (Phyrexian)", kind: "expansion", treat: "phyrexian", label: "Phyrexian", why: "an art key, 38 products" },
  // special foils share ONE key and keep their exact text in the label
  { name: "AWOL (Alternate Foil)", kind: "unset", treat: "otherfoil", label: "Alternate Foil", why: "special foil, 19 products" },
  { name: "Deadly Dispute (080) (Pool Party Foil)", kind: "secret-lair", treat: "otherfoil", label: "Pool Party Foil", why: "special foil" },
  { name: "Arcane Heist (Out Of Sight Foil)", kind: "secret-lair", treat: "otherfoil", label: "Out Of Sight Foil", why: "special foil" },
  { name: "Fatal Push (0884) (Black & White Foil)", kind: "secret-lair", treat: "otherfoil", label: "Black & White Foil", why: "special foil" },
  { name: "The Mind Stone (Borderless) (Cosmic Foil)", kind: "expansion", treat: "borderless otherfoil", label: "Borderless · Cosmic Foil", why: "special foil" },
  { name: "Sothera, the Supervoid (Singularity Foil)", kind: "expansion", treat: "otherfoil", label: "Singularity Foil", why: "special foil" },
  // 'Alternate Art Foil': the finish word goes, the words stay
  { name: "Will Kenrith (Alternate Art Foil)", kind: "masters", treat: "", label: "Alternate Art", words: ["Alternate Art"], why: "text, 3 products" },
  { name: "Ertai, the Corrupted (Alt. Art Foil)", kind: "expansion", treat: "", label: "Alt. Art", words: ["Alt. Art"], why: "text, 3 products" },
  // WPN and Launch Party keys keep the rest of a longer token as text
  { name: "Perhaps You've Met My Cohort (WPN & Gateway)", kind: "oversized", treat: "wpn", label: "WPN / Gateway", why: "key" },
  { name: "Hidetsugu, Devouring Chaos (Neon Yellow) (WPN Exclusive)", kind: "expansion", treat: "wpn", label: "WPN / Gateway · Neon Yellow", words: ["Neon Yellow"], why: "key plus text" },
  { name: "Tember City (WPN Promo)", kind: "oversized", treat: "wpn", label: "WPN / Gateway · Promo", words: ["Promo"], why: "key plus text" },
  { name: "Skullbriar, the Walking Grave (Commander Launch Promo)", kind: "oversized", treat: "launch", label: "Launch Party · Commander", words: ["Commander"], why: "key plus text" },
  { name: "A Reckoning Approaches (Archenemy: Nicol Bolas)", kind: "oversized", treat: "archenemy", label: "Archenemy · Nicol Bolas", words: ["Nicol Bolas"], why: "key plus the deck's name" },
  { name: "Chaotic Aether (Planechase 2012)", kind: "oversized", treat: "planechase", label: "Planechase", why: "synonym of the key" },
  // keys the vocabulary has and the reference grammar had not
  { name: "Phyrexian Revoker (Schematic)", kind: "masters", treat: "schematic", label: "Schematic", why: "126 products" },
  { name: "Recycla-bird (No PW Symbol)", kind: "masters", treat: "nopw", label: "No PW Symbol", why: "a hidden key that the label keeps, 121 products" },
  { name: "Rapacious Guest (Showcase Scrolls)", kind: "expansion", treat: "scroll", label: "Showcase Scrolls", why: "the scroll key, not showcase, 349 products" },
  { name: "Aragorn, the Uniter (Borderless Poster)", kind: "expansion", treat: "poster", label: "Poster", why: "one key for the pair of words" },
  { name: "Brainstorm (582) (Sketch Showcase)", kind: "secret-lair", treat: "sketch", label: "Sketch", why: "one key for the pair of words" },
  { name: "Air Elemental (IE)", kind: "gold-border", treat: "ie", label: "International Edition", why: "301 products; the reference read it as Collector's" },
  // the source set: its printed form, in the kinds that shelve many origin sets
  { name: "Flamewave Invoker (EVG)", kind: "deck", treat: "", label: "from EVG", src: "evg", why: "duel deck anthology, 12 products" },
  { name: "Forest (028) (GVL)", kind: "deck", treat: "", label: "from GVL", src: "gvl", why: "duel deck anthology" },
  { name: "Mountain (060) (JVC)", kind: "deck", treat: "", label: "from JVC", src: "jvc", why: "duel deck anthology" },
  { name: "Corrupt (DVD)", kind: "deck", treat: "", label: "from DVD", src: "dvd", why: "duel deck anthology" },
  { name: "Forest (UGL)", kind: "unset", treat: "", label: "from UGL", src: "ugl", why: "Un-set" },
  { name: "Tomb of Annihilation (AFR)", kind: "oversized", treat: "", label: "from AFR", src: "afr", why: "oversize cards" },
  { name: "Sun Titan (M11)", kind: "list", treat: "", label: "from M11", src: "m11", why: "The List" },
  { name: "Lightning Bolt (M10)", kind: "list", treat: "", label: "from M10", src: "m10", why: "The List" },
  // ... and NOT in an expansion, where the same letters are an art word or a stray token
  { name: "Royal Herbalist (Man)", kind: "expansion", treat: "", label: "Man", words: ["Man"], why: "Alliances art word" },
  { name: "Flamewave Invoker (EVG)", kind: "expansion", treat: "", label: "EVG", words: ["EVG"], why: "an expansion shelves one set: a code is text there" },
  { name: "Air Elemental (CE)", kind: "gold-border", treat: "ce", label: "Collector's Edition", why: "a treatment synonym beats a set code" },
];
test("the families that the closed vocabulary leaves outside the reference grammar, decided one by one: real product names, each pinned to its key, label, source set and language", () => {
  for (const f of FAMILIES) {
    const p = parse(f.name, f.kind);
    const at = `${f.name} [${f.kind}] (${f.why})`;
    assert.equal(p.treat.join(" "), f.treat, `${at}: treat`);
    assert.equal(K.labelOf(p, null), f.label, `${at}: label`);
    assert.equal(p.src, f.src ?? null, `${at}: source set`);
    assert.equal(p.lang, f.lang ?? null, `${at}: language`);
    assert.deepEqual(p.words, f.words ?? [], `${at}: words`);
  }
});
test("class words stay out of the vocabulary: the same three products get their class from productClass, not from a key", () => {
  assert.equal(K.productClass({ name: "Chillerpillar (Art Series)", rarity: "S" }, "art-series", null), C.CARD_CLASS.ART);
  assert.equal(K.productClass({ name: "Ashnod (Oversize)", rarity: "R" }, "deck", { layout: "normal", oversized: true }), C.CARD_CLASS.OVERSIZED);
  assert.equal(K.productClass({ name: "Indoraptor, the Perfect Hybrid (Borderless) (Emblem)", rarity: "T" }, "masters", { layout: "emblem", oversized: false }), C.CARD_CLASS.TOKEN);
  for (const w of ["art series", "oversize", "emblem"]) assert.equal(C.TREATMENT_BY_SYNONYM.has(w), false, w);
});

// ── the grammar: the dash layer ──
test("a ' - tail' is classified once: event, pack, Thick Stock, Full Art, emblem, language, treatment words, a basic land's variant word, else a possible reskin", () => {
  const dash = (name: string, kind: C.SetKind = "expansion") => parse(name, kind).dash?.kind;
  assert.equal(dash("Armageddon - 1996 Bertrand Lestree (4ED)", "gold-border"), "event");
  assert.equal(dash("Forest - Clear Pack (Beard, Jr.)", "promo"), "pack");
  assert.equal(dash("Omo, Queen of Vesuva (Display Commander) - Thick Stock"), "thick");
  assert.equal(dash("Forest (Phyrexian) - Full Art (Oil Slick Raised Foil)"), "fullart");
  assert.equal(dash("Forest - JP Full Art"), "fullart");
  assert.equal(dash("Emblem - Chandra, Chill of Compliance // Emblem - Chandra, Torch of Defiance Double-Sided Token"), "emblem");
  assert.equal(dash("Plains - Spanish", "promo"), "foreign");
  assert.equal(dash("Forest - Guru"), "word", "a basic land's variant word");
  assert.equal(dash("Megatron - Blightsteel Colossus", "secret-lair"), "reskin?");
  assert.equal(dash("Lotus Petal - Sol Ring"), "reskin?");
  assert.equal(dash("Sol Ring"), undefined);
  const full = parse("Forest (Phyrexian) - Full Art (Oil Slick Raised Foil)", "expansion");
  assert.deepEqual([full.treat.join(" "), full.base], ["fullart phyrexian oilslick", "Forest"], "the tail's treatment words join the token's, in vocabulary order");
  assert.equal(parse("Order of Leitbur (Group) - 1996 Bertrand Lestree (FEM) (SB)", "gold-border").base, "Order of Leitbur", "an event tail is not part of the name");
  assert.equal(parse("Megatron - Blightsteel Colossus", "secret-lair").base, "Megatron - Blightsteel Colossus", "a possible reskin keeps both names: only the join decides which is the oracle");
});
test("a hyphen without spaces is part of a name, never a dash", () => {
  const p = parse("Spider-Gwen, Web-Warrior - Najeela, the Blade-Blossom (Borderless)", "masters");
  assert.deepEqual([p.dash?.head, p.dash?.tail], ["Spider-Gwen, Web-Warrior", "Najeela, the Blade-Blossom"]);
  assert.equal(parse("Lim-Dûl's Vault", "expansion").dash, null);
});

test("odd names never throw: an empty group is nothing, unbalanced text stays in the base, a repeated token counts once, only the first number group is the number", () => {
  const odd = (name: string) => parse(name, "promo");
  assert.deepEqual([odd("").base, odd("").treat, K.labelOf(odd(""), null)], ["", [], null]);
  assert.deepEqual([odd("()").base, odd("Sol Ring (  )").base, odd("Sol Ring (  )").tokens], ["", "Sol Ring", [""]]);
  assert.deepEqual([odd("Foo (").base, odd("Foo ) (Bar").base, odd("(").treat], ["Foo (", "Foo ) (Bar", []]);
  assert.deepEqual(odd("(Borderless) (Borderless)").treat, ["borderless"]);
  assert.deepEqual(odd("Foo (Borderless) (borderless foil)").treat, ["borderless"], "and a finish word is no text");
  assert.deepEqual([odd("Foo (SB) (SB)").treat, odd("Foo (SB) (SB)").sideboard], [["sb"], true]);
  assert.deepEqual([odd("Foo (1) (2) (3)").digit, odd("Foo (1) (2) (3)").faceDigits], ["1", ["2", "3"]]);
  assert.equal(odd("A - B - C").dash?.kind, "reskin?", "the first top-level dash splits; the rest of the name is the tail");
  assert.equal(odd("X - Foil Etched").treat.join(), "etched");
  assert.deepEqual([odd("A - ").dash, odd(" - B").dash], [null, null], "a dash needs a head and a tail");
});

// ── sealed products and card text ──
const sealedProduct = (productId: number, name: string, groupId: number, text: string | null, presale: { isPresale: boolean; releasedOn: string | null } | null = null): K.TcgcsvProduct => ({
  productId, name, groupId, imageUrl: "", url: "", presaleInfo: presale, extendedData: text === null ? [] : [{ name: "OracleText", value: text }, { name: "UPC", value: "195166333526" }],
});
test("parseSealed: kind from the name, a pack count only where the name says so, the release date, presale, contents from the cleaned text (real TCGCSV products)", () => {
  const play = sealedProduct(706136, "Star Trek - Play Booster Pack", 24766,
    "Play Boosters are the ideal booster for the play environment.\r\n<br>\r\nMore about Magic: The Gathering | Star Trek\r\n<br>\r\nContents:\r\n<br>• 14 Magic: The Gathering cards", { isPresale: true, releasedOn: "2026-11-13T00:00:00" });
  const p = K.parseSealed(play, "expansion");
  assert.deepEqual([p.id, p.name, p.setId, p.kind, p.packCount, p.releasedOn, p.presale], [706136, "Star Trek - Play Booster Pack", 24766, "Booster Pack", 1, "2026-11-13", true]);
  assert.equal(p.contents, "Contents:\n• 14 Magic: The Gathering cards", "the Contents: block of the cleaned text");
  const clue = K.parseSealed(sealedProduct(529974, "Ravnica: Clue Edition", 23362,
    "In this Clue-inspired spin on Magic: The Gathering, your players will step into the roles of Ravnica's top detectives.\r\n<br>\r\nContents:\r\n<br>\r\n• 8 Ravnica: Clue Edition Boosters\r\n<br>\r\n• 21 Evidence cards\r\n<br>\r\n• 1 Card Storage Box", { isPresale: false, releasedOn: "2024-02-23T00:00:00" }), "expansion");
  assert.deepEqual([clue.kind, clue.packCount, clue.releasedOn, clue.presale], ["Collection & Gift", null, "2024-02-23", false]);
  assert.equal(clue.contents, "Contents:\n• 8 Ravnica: Clue Edition Boosters\n• 21 Evidence cards\n• 1 Card Storage Box");
  const display = K.parseSealed(sealedProduct(562161, "Magic: The Gathering Foundations - Jumpstart Booster Display Case", 23792, null), "expansion");
  assert.deepEqual([display.kind, display.packCount, display.contents, display.releasedOn], ["Case", null, null, null], "a case is not a pack: the count of a box depends on the era");
  assert.equal(K.parseSealed(sealedProduct(1, "Foo (Bar)", 7, null), null).setId, null, "setId is null when the group is not an included set");
  assert.equal(K.parseSealed(sealedProduct(2, "Foo 3x Booster Packs", 7, null), "expansion").packCount, 3);
  assert.equal(K.parseSealed(sealedProduct(3, "Foo - 6-Pack Bundle", 7, null), "expansion").packCount, 6);
  assert.equal(K.parseSealed(sealedProduct(4, "“Quoted”  name", 7, null), "expansion").name, '"Quoted" name', "curly quotes and double spaces are normalised");
  assert.equal(K.parseSealed(sealedProduct(5, "Foo", 7, "x ".repeat(500)), "expansion").contents!.length <= 601, true, "contents are cut at a word, at most 600 characters");
});
test("cleanEffect: TCGCSV's OracleText HTML to plain text; errata links, line breaks and entities (real products)", () => {
  assert.equal(K.cleanEffect("Flying\r\n<br>Nightmare has power and toughness each equal to the number of swamps its controller controls."), "Flying\nNightmare has power and toughness each equal to the number of swamps its controller controls.");
  assert.equal(K.cleanEffect("Elemental spells you cast from your hand have evoke 4. <em>(If you cast a spell for its evoke cost, it's sacrificed when it enters.)</em>\r\n<br>\r\nWhenever you sacrifice a nontoken Elemental, create a token."),
    "Elemental spells you cast from your hand have evoke 4. (If you cast a spell for its evoke cost, it's sacrificed when it enters.)\nWhenever you sacrifice a nontoken Elemental, create a token.");
  assert.equal(K.cleanEffect('Planeswalker Deck featuring <a href="Angrath, Minotaur Pirate">"Angrath, Minotaur Pirate"</a>. This deck contains the following:\r\n<br>\r\n<br>• 1 Ready-to-play 60-card deck'),
    'Planeswalker Deck featuring "Angrath, Minotaur Pirate". This deck contains the following:\n• 1 Ready-to-play 60-card deck');
  assert.equal(K.cleanEffect("Tom &amp; Jerry &quot;Duo&quot; &#39;s &lt;3&gt;&nbsp;x"), "Tom & Jerry \"Duo\" 's <3> x");
  assert.equal(K.cleanEffect(""), null);
  assert.equal(K.cleanEffect(null), null);
  assert.equal(K.cleanEffect("<br>\r\n<br>"), null);
});

// ── the whole snapshot, when the lab data is on this machine ──
const LAB = process.env.MTG_LAB;
const SINGLES = LAB ? path.join(LAB, "design/magic-tools/ts-check/singles.json") : "";
const SETS = LAB ? path.join(LAB, "scryfall/sets.json") : "";
const haveLab = Boolean(SINGLES) && fs.existsSync(SINGLES) && fs.existsSync(SETS);
test("all 111,839 included singles: 111,836 distinct slugs and exactly 3 collisions; the grammar never throws, never empties a base or a label, and keeps unknown words in under 2% of names (skipped without MTG_LAB)", { skip: haveLab ? false : "set MTG_LAB to the snapshot directory" }, () => {
  const singles: { productId: number; name: string; number: string | null; gid: number }[] = JSON.parse(fs.readFileSync(SINGLES, "utf8"));
  const sets = JSON.parse(fs.readFileSync(SETS, "utf8"));
  const codes = new Set<string>((sets.data ?? sets).map((s: { code: string }) => s.code));
  const kindOf = new Map(groups.map((g) => [g.groupId, g.kind as C.SetKind]));
  assert.equal(singles.length, 111_839);
  const seen = new Map<string, number[]>();
  const words = new Map<string, number>();
  let withWords = 0, withSrc = 0;
  for (const p of singles.sort((a, b) => a.productId - b.productId)) {
    const slug = K.slugBase(p, toks.get(p.gid)!);
    (seen.get(slug) ?? seen.set(slug, []).get(slug)!).push(p.productId);
    const parsed = K.parseTcgName(p.name, { setCodes: codes, groupKind: kindOf.get(p.gid)! });
    assert.ok(parsed.base.length > 0, p.name);
    assert.doesNotMatch(parsed.core, /[()[\]]/, `${p.name}: no real name has a nested or unbalanced group`);
    const label = K.labelOf(parsed, null);
    assert.ok(label === null || label.trim().length > 0, p.name);
    assert.ok(parsed.treat.every((k) => (C.TREATMENT_KEYS as readonly string[]).includes(k)), p.name);
    if (parsed.src) { withSrc++; assert.ok((["promo", "promo-pack", "list", "secret-lair", "gold-border", "deck", "unset", "oversized"] as string[]).includes(kindOf.get(p.gid)!), `${p.name}: a source set outside a shelf kind`); }
    if (parsed.words.length) { withWords++; for (const w of parsed.words) words.set(w, (words.get(w) ?? 0) + 1); }
  }
  assert.equal(seen.size, 111_836);
  assert.deepEqual([...seen.values()].filter((l) => l.length > 1).map((l) => l.join("+")).sort(), ["284921+284951", "509267+509356", "509268+509357"]);
  assert.ok(withWords / singles.length < 0.02, `${withWords} names keep unknown words (${(100 * withWords / singles.length).toFixed(2)}%): the run goes yellow above 2%`);
  assert.ok(words.size > 400 && words.size < 800, `${words.size} distinct unknown words`);
  assert.ok(withSrc > 1500, `${withSrc} products name their source set`);
});
