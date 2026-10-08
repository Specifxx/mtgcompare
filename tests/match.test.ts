// The store-listing matcher of src/lib/match.ts (owner WP03), pinned against REAL Magic listings.
//
// WHERE THE DATA COMES FROM. tests/fixtures/titles/ is a slice of the research corpus (matcher/corpus-mtg.json: 19,993 listings of 102 stores, page 1 of each, fetched 2026-10-07) and of the catalogue it is matched against:
//   rows.json      the MatchRows (with label and group abbreviation, as the importer builds them) of every product a pinned listing involves, plus one product per (set, TCGplayer group) for the set vocabulary
//   sealed.json    the sealed products whose words a pinned listing can name
//   listings.json  252 listings, each with its store, handle, title, tags, product type, variants (title, store price, in stock, sku), the store's explicit-foil convention, the answer recorded for every
//                  variant and, for US stores, TCGplayer's market price in cents of the (product, finish) the variant matched
// Titles, skus, variants and prices are read from those files; what is typed in below is the expected OUTCOME in words ("sylvan anthem mh2#176 N+F sku": card, set#number, finishes, key path), so a failing row
// reads as a sentence. The recorded answers were produced on the whole 99,000-row catalogue and are replayed on the slice (the slice was built until both agreed on every pinned listing).
//
// Appendix B of the stores brief is pinned row by row, with what the prototype said where this matcher says something else and why. tests/match-finish.test.ts pins the finish step.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  STORE_SET_ALIASES,
  anyVariant,
  bestVariant,
  buildCardIndex,
  buildNameIndex,
  canonSet,
  cardNumbersIn,
  cleanTitle,
  collapseOffers,
  conditionLabel,
  conditionRank,
  foreignByTags,
  indexVocab,
  languageOfVariant,
  matchByName,
  matchCardBySku,
  matchCardTitle,
  matchSealedTitle,
  matchStoreProduct,
  matchStoreVariants,
  parseSku,
  plausibleSealedPrice,
  plausibleSinglePrice,
  readTitle,
  sealedWords,
  setCodesIn,
  skuCardNumber,
  skuSetNumber,
  titleNamesSet,
  treatmentWords,
  type MatchRow,
  type OfferDraft,
  type SealedRef,
  type StoreMatch,
  type StoreMatchIndexes,
  type StoreMiss,
  type StoreVariant,
} from "../src/lib/match";

// ── the fixtures ──
interface Listing {
  key: string; group: string; store: string; market: string; handle: string; title: string; ptype: string; tags: string[];
  options: [string, string[]][];
  variants: [string, string, boolean, string | null][];     // title, price, in stock, sku
  explicitFoil: boolean;
  expect: string[];                                          // "id.F.path" or "miss:reason", per variant
  marketCents?: Record<string, number>;                      // "id.F" -> TCGplayer market of the finish, US stores only
}
const FIX = path.resolve(__dirname, "fixtures/titles");
const read = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8")) as T;
const rows = read<MatchRow[]>("rows.json");
const sealed = read<SealedRef[]>("sealed.json");
const listings = read<Listing[]>("listings.json");
const ix: StoreMatchIndexes = { cards: buildCardIndex(rows), names: buildNameIndex(rows), sealed };
const rowById = new Map(rows.map((r) => [r.id, r]));
const sealedById = new Map(sealed.map((s) => [s.id, s]));

const fmt = (a: StoreMatch | StoreMiss): string => ("id" in a ? `${a.id}.${a.finish}.${a.path}` : `miss:${a.miss}`);
/** One answer per variant, with the convention the importer uses: the variant's own sku first, the siblings' titles beside it, the store's explicit-foil flag. */
function answers(l: Listing, indexes: StoreMatchIndexes = ix): (StoreMatch | StoreMiss)[] {
  return matchStoreVariants({ title: l.title, tags: l.tags, productType: l.ptype, explicitFoil: l.explicitFoil, variants: l.variants.map((v) => ({ title: v[0], sku: v[3] })) }, indexes);
}
/** The outcome in words: "card set#number FINISHES path" per product matched, then the distinct misses; "sealed <name>" for a sealed product. */
function describe(l: Listing, indexes: StoreMatchIndexes = ix): string {
  const hit = new Map<string, Set<string>>(); const miss = new Set<string>();
  for (const a of answers(l, indexes)) {
    if (!("id" in a)) { miss.add(`miss:${a.miss}`); continue; }
    if (a.path === "sealed") { hit.set(`sealed ${sealedById.get(a.id)!.name}`, new Set()); continue; }
    const r = rowById.get(a.id)!;
    const k = `${r.names[0]} ${r.sc}#${r.nkey}|${a.path}`;
    (hit.get(k) ?? hit.set(k, new Set()).get(k)!).add(a.finish);
  }
  const out = [...hit].sort().map(([k, f]) => { const [what, via] = k.split("|"); return f.size ? `${what} ${[...f].sort().reverse().join("+")} ${via}` : what!; });
  return [...out, ...[...miss].sort()].join(" ; ");
}
/** A pinned listing by store and the start of its title (cleaned alike on both sides); it must be unique. */
function pin(store: string, start: string): Listing {
  const want = cleanTitle(start);
  const hits = listings.filter((l) => l.store === store && cleanTitle(l.title).startsWith(want));
  const exact = hits.filter((l) => cleanTitle(l.title) === want);
  const one = exact.length === 1 ? exact : hits;
  assert.equal(one.length, 1, `${store} "${start}" must name exactly one pinned listing, found ${one.length}`);
  return one[0]!;
}
interface Row { store: string; title: string; want: string; why?: string }
/** A table of "this real title is this outcome", one test per row, and the table must be the whole group of the fixture. */
function table(group: string, rowsOf: Row[]): void {
  test(`${group}: the table is the whole pinned group`, () => {
    const pinned = rowsOf.map((r) => pin(r.store, r.title).key).sort();
    const inGroup = listings.filter((l) => l.group === group).map((l) => l.key).sort();
    assert.deepEqual(pinned.filter((k) => !inGroup.includes(k)), [], "rows outside the group (a listing is pinned in its first group only)");
    assert.deepEqual(inGroup.filter((k) => !pinned.includes(k)), [], "listings of the group without a row");
    assert.equal(new Set(pinned).size, pinned.length, "one row per listing");
  });
  for (const r of rowsOf) test(`${group}: ${r.store} "${r.title}" -> ${r.want}`, () => assert.equal(describe(pin(r.store, r.title)), r.want, r.why));
}

// ── the fixtures themselves ──
test("the fixture is the slice it says it is: 252 listings in 11 groups, every one with an answer per variant", () => {
  assert.equal(listings.length, 252);
  const groups = new Map<string, number>();
  for (const l of listings) groups.set(l.group, (groups.get(l.group) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries([...groups].sort()), { "appendix-b": 48, aliases: 9, conditions: 3, dupes: 2, finish: 16, gates: 7, rejects: 15, sample: 102, "sealed": 8, "sku-dialects": 23, "title-keys": 19 });
  for (const l of listings) assert.equal(l.expect.length, l.variants.length, l.key);
  assert.equal(new Set(listings.map((l) => l.key)).size, listings.length, "a listing is one store handle");
  assert.ok(rows.length > 2000 && sealed.length > 300);
  assert.ok(rows.some((r) => r.cls !== 0), "the slice keeps tokens, art cards and oversized products so that the index has something to leave out");
});

test("every recorded answer is replayed exactly, variant by variant (all 252 listings)", () => {
  const bad: string[] = [];
  for (const l of listings) {
    const got = answers(l).map(fmt);
    l.expect.forEach((want, i) => { if (got[i] !== want) bad.push(`${l.key} [${l.variants[i]![0]}] want ${want} got ${got[i]}`); });
  }
  assert.deepEqual(bad, []);
});

test("a match is always a product that sells the finish it names, and never an etched product as a plain finish", () => {
  let n = 0;
  for (const l of listings) for (const a of answers(l)) {
    if (!("id" in a) || a.path === "sealed") continue;
    n++;
    const r = rowById.get(a.id);
    assert.ok(r, `${l.key}: product ${a.id} is in the catalogue`);
    if (a.finish === "N") assert.ok(r.hasN && !r.etched, `${l.key}: ${a.id} sells a non-foil`);
    else assert.ok(r.hasF, `${l.key}: ${a.id} sells a foil`);
  }
  assert.ok(n > 600, `${n} single matches checked`);
});

test("every miss reason that occurs is one of the documented ones, and each is written in the module's header", () => {
  const DOCUMENTED = ["language-option", "language-tag", "language-title", "language-sku", "graded-lot-proxy", "not-a-single", "accessory", "art-card-token-oversize", "nokey", "sku-key-not-in-catalogue", "title-key-not-in-catalogue",
    "num-setname-not-in-catalogue", "name-setname-not-in-catalogue", "sku-numbers-disagree", "sku-title-disagree", "name-mismatch", "set-conflict", "treatment-not-in-product", "treatment-differs", "unknown-label", "finish-unknown",
    "finish-conflict", "finish-not-offered", "ambiguous", "sealed-no-product", "sealed-ambiguous"];
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/match.ts"), "utf8");
  const header = source.slice(source.indexOf("MISS REASONS"), source.indexOf("import {"));
  for (const reason of DOCUMENTED) assert.ok(header.includes(reason), `${reason} is in the header`);
  const seen = new Set<string>();
  for (const l of listings) for (const a of answers(l)) if ("miss" in a) seen.add(a.miss);
  assert.deepEqual([...seen].filter((m) => !DOCUMENTED.includes(m)), []);
  assert.ok(seen.size >= 18, `${seen.size} different reasons occur in the fixture`);
});

// ── Appendix B of the stores brief: 48 real listings, pinned ──
// `why` says what the prototype (v2) answered where this matcher answers differently.
table("appendix-b", [
  { store: "goodgames", title: "Sylvan Anthem [Modern Horizons 2]", want: "sylvan anthem mh2#176 N+F sku" },
  { store: "gatheringpointgames", title: "Nissa, Leyline Tamer (Borderless) [Reality Fracture Commander]", want: "nissa leyline tamer frc#2 N+F sku", why: "TCGplayer calls the group Commander: Reality Fracture; the store's label is the catalogue's name in another order" },
  { store: "boutiquelapioche", title: "Merfolk of the Pearl Trident (4ED-086) - common", want: "merfolk of the pearl trident 4ed#86 N sku" },
  { store: "cgrealm", title: "Soul's Attendant (ROE-044) - Rise of the Eldrazi", want: "souls attendant roe#44 N+F sku" },
  { store: "timetwister", title: "Kyoshi Island Plaza - Avatar: The Last Airbender (Uncommon) [TLA-184]", want: "kyoshi island plaza tla#184 N sku" },
  { store: "spellroo", title: "An Offer You Can't Refuse (FIC - 267) - Commander: FINAL FANTASY - Uncommon - Normal", want: "an offer you cant refuse fic#267 N sku" },
  { store: "livingrealms", title: "Bard, King of Dale (144)", want: "bard king of dale hob#144 N+F sku" },
  { store: "impactleague", title: "Gandalf, Shadow's Foe (99)", want: "gandalf shadows foe hoc#99 N sku", why: "the number decides: this is the Extended Art product, although the title says nothing of it" },
  { store: "facetoface", title: "Legion Leadership // Legion Stronghold [255] [Modern Horizons 3] [Non-Foil]", want: "legion leadership mh3#255 N sku" },
  { store: "cardboardanddie", title: "Artifact Mutation [INV - 231]", want: "artifact mutation inv#231 F set-number" },
  { store: "mysterymtg", title: "Terror of the Peaks [OTJ - 149]", want: "terror of the peaks otj#149 N set-number" },
  { store: "carddynasty", title: "Biorhythm (231) (9ED)", want: "biorhythm 9ed#231 N set-number" },
  { store: "gametime", title: "The Unbeatable Squirrel Girl (193) [Marvel Super Heroes]", want: "the unbeatable squirrel girl msh#193 N+F set-number" },
  { store: "manamarket", title: "Exotic Orchard (Extended Art) - Doctor Who", want: "exotic orchard who#493 N sku" },
  { store: "mightycoolgames", title: "Tiger-Seal (Borderless) [Avatar: The Last Airbender]", want: "tiger seal tla#318 N+F sku" },
  { store: "brints", title: "Chaos Emerald - Lotus Petal (7033) (SLD-7033) - Secret Lair Drop Series Foil", want: "lotus petal sld#7033 F sku", why: "prototype: name-mismatch. A Secret Lair names its art ('Chaos Emerald - ') before the card; the SKU and the number name the Lotus Petal" },
  { store: "shopponistore", title: "Affluente Magmatico - Commander: I Segreti di Strixhaven (Common) [SOC-387]", want: "miss:name-mismatch" },
  { store: "duelspoint", title: "Qui Giù nella Valle - Lo Hobbit (Rare) [HOB-124]", want: "miss:name-mismatch" },
  { store: "reefsidegames", title: "Mind Stone (DCI) (WPN-001) - Wizards Play Network 2021 Foil", want: "miss:name-mismatch" },
  { store: "hideoutsg", title: "Esper Sentinel (Sketch) [Modern Horizons 2]", want: "miss:treatment-not-in-product" },
  { store: "mightymeeple", title: "Teleportation Circle [Dungeons & Dragons: Adventures in the Forgotten Realms]", want: "teleportation circle afr#39 N+F sku", why: "prototype: treatment-not-in-product (the store's label for Adventures in the Forgotten Realms was unknown); STORE_SET_ALIASES" },
  { store: "blackrosehobbies", title: "Giant Octopus (9ED-0S4) - 9th Edition", want: "miss:unknown-label", why: "prototype: treatment-differs. Both skip: '0S4' is a collector number nothing in the catalogue has" },
  { store: "obsidiangames", title: "Nicol Bolas, Dragon-God (Promo Pack) [War of the Spark Promos]", want: "nicol bolas dragon god pwar#207p N+F name-set", why: "prototype: treatment-differs. The product's own name says 'Promo Pack'; the SKU's extra segments say it too" },
  { store: "nordiclegends", title: "Bolg's Company - The Hobbit: Extras (Rare) [XHOB-211]", want: "miss:language-option" },
  { store: "magicianscircle", title: "Assault Griffin - Magic 2011 (Common) [6]", want: "miss:language-option" },
  { store: "lotuspetalgaming", title: "Phyrexian Mite (011) // Samurai Double-sided Token (11 // 2) (Phyrexia: All Will Be One)", want: "miss:art-card-token-oversize", why: "prototype: language-title/tag. A double-sided token either way" },
  { store: "hideoutsg", title: "Demonic Tutor (Japanese Alternate Art) [Strixhaven: Mystical Archive]", want: "miss:language-title" },
  { store: "teamcardgame", title: "Secrets of Strixhaven Bundle", want: "sealed Secrets of Strixhaven - Bundle", why: "prototype: not-a-single. The sealed list answers it" },
  { store: "flukeandbox", title: "Magic Secrets of Strixhaven - Commander Deck: Lorehold Spirit", want: "sealed Secrets of Strixhaven Commander Deck - Lorehold Spirit", why: "prototype: not-a-single" },
  { store: "totalcards", title: "Magic The Gathering - Avatar the Last Airbender - Jumpstart Booster Pack", want: "sealed Avatar: The Last Airbender - Jumpstart Booster Pack", why: "prototype: not-a-single" },
  { store: "mythicstore", title: "Angel // Myr Double-Sided Token [Reality Fracture Commander Tokens]", want: "miss:art-card-token-oversize" },
  { store: "hairytarantula", title: "A Mysterious Creature Token [Murders at Karlov Manor Tokens]", want: "miss:art-card-token-oversize" },
  { store: "cardbot", title: "2025 Magic The Gathering Secret Lair Drop #1757 Vandalblast Marvel'S Deadpool-Foil PSA 9", want: "miss:graded-lot-proxy" },
  { store: "blackrosehobbies", title: "Nim Replica (MRD-220) - Mirrodin", want: "nim replica mrd#220 N sku", why: "prototype: graded/lot/proxy. 'Replica' is in the card's own name; sealed, proxy and token words are judged on what is left of the title" },
  { store: "mightycoolgames", title: "Soul Shatter [Zendikar Rising]", want: "soul shatter znr#127 N+F sku", why: "prototype: ambiguous (one product, two finishes). Per variant it is two offers" },
  { store: "fusiongamingonline", title: "Godless Shrine [Edge of Eternities]", want: "miss:ambiguous" },
  { store: "eternalmagic", title: "Anger (Rainbow Foil) [Secret Lair Drop Series]", want: "anger sld#1637 F sku", why: "prototype: ambiguous. The SKU says RAINBOW and the title says Rainbow Foil" },
  { store: "eternalmagic", title: "Comeuppance (Borderless) [Marvel's Spider-Man: Eternal-Legal]", want: "miss:set-conflict" },
  { store: "mysterymtg", title: "Sensei's Divining Top (Future Sight) [MB2 - 231]", want: "miss:set-conflict" },
  { store: "hideoutsg", title: "Allosaurus Shepherd (Foil Etched) [Double Masters 2022]", want: "allosaurus shepherd 2x2#457 F sku", why: "prototype: finish-not-offered. The etched finish is the etched product, and the product that sells it is the one at #457" },
  { store: "ggmorley", title: "Blaster Hulk (Extended Art) (Ripple Foil) [Modern Horizons 3 Commander]", want: "blaster hulk m3c#55 F sku", why: "prototype: finish-not-offered. A foil pattern is foil, and the product that sells it is the Ripple Foil one" },
  { store: "mythicstore", title: "Samut, Tyrant of Naktamun [Reality Fracture Promos]", want: "miss:sku-key-not-in-catalogue" },
  { store: "cardxcards", title: "Gwenom, Remorseless [Marvel's Spider-Man Promos]", want: "miss:sku-key-not-in-catalogue" },
  { store: "collectorstorecards", title: "MTG - Modern Horizons 3 - Creative Energy [ENG]", want: "miss:name-setname-not-in-catalogue" },
  { store: "jetcards", title: "Magic the Gathering - Foundations - Starter Collection", want: "miss:name-setname-not-in-catalogue" },
  { store: "cherry", title: "FOIL Caves of Koilos 244 /281 - Rare Dominaria United", want: "caves of koilos dmu#244 F set-number", why: "prototype: nokey. A number and a set name are a key" },
  { store: "greendoorcollectibles", title: "Nature's Lore-Dominaria Remastered-U-Normal", want: "miss:nokey" },
  { store: "trinketmage", title: "Blur of Heroism - Commander: Marvel Super Heroes: Extras (Uncommon) [XMSC-585]", want: "blur of heroism msc#585 N+F sku ; miss:language-option", why: "prototype: nokey. TCGplayer's 'Extras' groups are X + the set code; the German variant is skipped, the English ones kept" },
]);

// ── the SKU dialects ──
table("sku-dialects", [
  { store: "trinketmage", title: "Alien Symbiosis - Commander: Marvel Super Heroes: Extras (Uncommon) [XMSC-791]", want: "alien symbiosis msc#791 N+F sku ; miss:language-option" },
  { store: "trextcg", title: "Leonardo, Leader in Blue - Teenage Mutant Ninja Turtles: Extras", want: "leonardo leader in blue tmt#196 F sku" },
  { store: "manamarket", title: "Solemn Simulacrum (Extended Art) (Surge Foil) (Foil) - Doctor Who", want: "solemn simulacrum who#1071 F sku" },
  { store: "manamarket", title: "Sol Ring - Doctor Who", want: "sol ring who#245 N sku" },
  { store: "bardsandcards", title: "Teysa, Orzhov Scion (Retro) (Serialized) [Ravnica Remastered]", want: "teysa orzhov scion rvr#386z F name-set" },
  { store: "hideoutsg", title: "Shadowborn Apostle (688) (Borderless) [Secret Lair Drop Promos]", want: "shadowborn apostle sld#688 F sku" },
  { store: "obsidiangames", title: "Scalding Tarn (Borderless) [Tarkir: Dragonstorm Special Guests]", want: "scalding tarn spg#112 N+F sku" },
  { store: "mightycoolgames", title: "Overseer of the Damned [Archenemy: Nicol Bolas]", want: "overseer of the damned e01#36 N sku" },
  { store: "mightycoolgames", title: "Gift of Strength [Ravnica Allegiance]", want: "gift of strength rna#127 N+F sku" },
  { store: "elementalarcade", title: "Rampaging Baloths [Commander: Edge of Eternities]", want: "rampaging baloths eoc#104 N sku" },
  { store: "cryptmtg", title: "Aberrant (Surge Foil) [Warhammer 40,000]", want: "aberrant 40k#86 F sku ; miss:language-option" },
  { store: "ggmorley", title: "Azlask, the Swelling Scourge (Borderless) (Ripple Foil)", want: "azlask the swelling scourge m3c#136 F name-set" },
  { store: "cgrealm", title: "Counterspell (TMP-057) - Tempest", want: "counterspell tmp#57 N sku" },
  { store: "mistymountain", title: "{C} Counterspell [Tempest][TMP 057]", want: "counterspell tmp#57 N sku" },
  { store: "mistymountain", title: "{C} Arcane Signet (0056) [ECC 056]", want: "arcane signet ecc#56 N sku" },
  { store: "bardsandcards", title: "Black Lotus [Unlimited Edition]", want: "black lotus 2ed#233 N sku" },
  { store: "bardsandcards", title: "Black Lotus [Beta Edition]", want: "miss:finish-not-offered" },
  { store: "bardsandcards", title: "Sol Ring [Alpha Edition]", want: "sol ring lea#269 N sku" },
  { store: "rhysticnostalgiagaming", title: "Lightning Bolt [Double Masters 2022]", want: "lightning bolt 2x2#117 N+F sku" },
  { store: "stompinggrounds", title: "The One Ring (Borderless Alternate Art) [The Lord of the Rings: Tales of Middle-Earth]", want: "the one ring ltr#451 N+F sku" },
  { store: "manyrealms", title: "The One Ring (LTR-246) - The Lord of the Rings: Tales of Middle-earth", want: "the one ring ltr#246 N sku" },
  { store: "spellroo", title: "Starting Town (FIN - 289) - FINAL FANTASY - Rare - Normal", want: "starting town fin#289 N+F sku" },
  { store: "spellroo", title: "Hex Magic (MSH - 133) - Marvel Super Heroes - Uncommon - Normal", want: "hex magic msh#133 N+F sku" },
]);

// ── keys read from the title: SET-NUM, number + set name, name + set ──
table("title-keys", [
  { store: "clubhousecards", title: "Thranduil the Strategist (Extended Art) - #106 HOC", want: "thranduil the strategist hoc#106 N set-number" },
  { store: "comicsbeyond", title: "Adventures in the Forgotten Realms 245/281 Greataxe (Foil)", want: "greataxe afr#245 F set-number" },
  { store: "collectorsmith", title: "Rook Turret 69/309 (FINAL FANTASY)  - Foil", want: "rook turret fin#69 F set-number" },
  { store: "chonkycollectibles", title: "Leonardo, Cutting Edge [Foil] - MTG Teenage Mutant Ninja Turtles R 15", want: "leonardo cutting edge tmt#15 F set-number" },
  { store: "cherry", title: "Lotus Bloom 270/289 - Rare Time Spiral Remastered", want: "lotus bloom tsr#270 N set-number" },
  { store: "cherry", title: "Foil Forest 301/302 - Kamigawa Neon Dynasty", want: "forest neo#301 F set-number" },
  { store: "cherry", title: "Galaxy Foil Forest No 495 - Common Unfinity", want: "forest unf#495 F set-number" },
  { store: "kapescaping", title: "Swamp (283) - Full Art [BRO - 283]", want: "swamp bro#283 F set-number" },
  { store: "cryptmtg", title: "Abeyance (Janosch Kuhn) [World Championship Decks 1997]", want: "abeyance wc97#jk1 N name-set ; miss:language-option" },
  { store: "gatorscardden", title: "Snap 66 - Dominaria Remastered", want: "snap dmr#66 N set-number" },
  { store: "mysterymtg", title: "Hazezon Tamar [LEG]", want: "hazezon tamar leg#230 N name-set" },
  { store: "cardboardanddie", title: "Forest - Clear Pack (Beard, Jr.) [APAC - 11]", want: "forest palp#11 N set-number", why: "APAC is TCGplayer's abbreviation of the group; Scryfall's code is PALP" },
  { store: "cardboardanddie", title: "Rin and Seri, Inseparable (1508) [SLD - 1508]", want: "rin and seri inseparable sld#1508 F set-number" },
  { store: "cardboardanddie", title: "Natural Order (JP Alternate Art) (Foil Etched) [STA - 117]", want: "natural order sta#117 F set-number" },
  { store: "battlebearkl", title: "Transmogrifying Wand XCMM-981 Rare Near Mint Englisch", want: "transmogrifying wand cmm#981 N set-number" },
  { store: "facetoface", title: "Case of the Locked Hothouse [155] [Murders at Karlov Manor] [Non-Foil]", want: "case of the locked hothouse mkm#155 N sku", why: "a card whose name starts with the sealed word 'Case'" },
  { store: "facetoface", title: "Impact Tremors [44] [Enchanting Tale Showcase]", want: "miss:unknown-label", why: "'Enchanting Tale' is a word the vocabulary has no key for and the product's name does not state" },
  { store: "eternalmagic", title: "Spider-Man 2099 [Marvel's Spider-Man]", want: "spider man 2099 spm#150 N+F sku", why: "a card whose own name ends in a number is not a title with a number" },
  { store: "151collectables", title: "Michelangelo, Weirdness to 11", want: "michelangelo weirdness to 11 tmt#121 N name-set" },
]);

// ── what is skipped, and why ──
table("rejects", [
  { store: "zatugames", title: "Magic: The Gathering - JAPANESE - Phyrexia All Will Be One - Set Booster Pack", want: "miss:language-tag" },
  { store: "mistymountain", title: "{B}[NEO 298] Swamp (298) - JP Full Art [Kamigawa Neon Dynasty]", want: "miss:language-sku", why: "NEO-298-JA: the sku says Japanese" },
  { store: "hairytarantula", title: "Abomination [Fourth Edition (Foreign Black Border)]", want: "miss:language-sku" },
  { store: "cardbot", title: "2025 Magic The Gathering Secret Lair Drop #2084 Dr. Eggman Sonic The Hedgehog-Foil PSA 8", want: "miss:graded-lot-proxy" },
  { store: "mythicstore", title: "Theorist's Proxy [Reality Fracture Promos]", want: "miss:sku-key-not-in-catalogue", why: "'Proxy' is part of the card's name: it reaches the key and the key is not in the catalogue" },
  { store: "moxboardinghouse", title: "Rookie Playmat (Deck on the Right)", want: "miss:accessory" },
  { store: "goblingaming", title: "100 Standard Card Sleeves - Light Green", want: "miss:accessory" },
  { store: "manamarketeu", title: "Bastion Protector - Commander: Marvel Super Heroes: Extras (Rare) [XMSC-296]", want: "bastion protector msc#296 N sku ; miss:language-option", why: "'Protector' is the card's name, not a card protector" },
  { store: "paradoxtcg", title: "Natural Order (Foil Etched) [Strixhaven: School of Mages Mystical Archive]", want: "miss:unknown-label" },
  { store: "bardsandcards", title: "Sol Ring (408) (Elven) [The Lord of the Rings: Tales of Middle-Earth Commander]", want: "miss:unknown-label" },
  { store: "cardcosmos", title: "Magic: The Gathering - Der Hobbit Play Booster Box - DE", want: "miss:not-a-single" },
  { store: "stompinggrounds", title: "Rhys the Redeemed [Mystery Booster]", want: "miss:not-a-single", why: "the catalogue has no 'Mystery Booster' set, so 'Booster' is read as a sealed word" },
  { store: "gametime", title: "Prompto Argentum (Borderless) (Surge Foil) (532) [Final Fantasy]", want: "prompto argentum fin#532 F set-number ; miss:finish-conflict", why: "the title says Surge Foil and the Non Foil variants say the opposite: skipped, the foil variants match" },
  { store: "mysterymtg", title: "Deification (Halo Foil) [MAT - 187]", want: "deification mat#187 F set-number", why: "MAT is the code of March of the Machine: The Aftermath, not a mat: a set code with its number is taken out of the title before the accessory words are looked for" },
  { store: "reefsidegames", title: "Rebuild the City (Showcase) (MAT-093) - March of the Machine: The Aftermath: (Showcase)", want: "rebuild the city mat#93 N sku", why: "the same code, written (MAT-093); the sibling listing with a trailing Foil is the same product's foil" },
]);

// ── store labels of sets the catalogue's vocabulary does not carry ──
table("aliases", [
  { store: "millenniumcomics", title: "Legolas's Quick Reflexes (Borderless) [The Lord of the Rings: Tales of Middle-Earth Commander]", want: "legolass quick reflexes ltc#493 N+F sku" },
  { store: "mistymountain", title: "{C} Deadly Dispute [Dungeons & Dragons: Adventures in the Forgotten Realms][AFR 094]", want: "deadly dispute afr#94 N+F sku" },
  { store: "grognardgames", title: "Lotleth Troll [Guilds of Ravnica Guild Kit]", want: "lotleth troll gk1#67 N sku" },
  { store: "grognardgames", title: "Simic Sky Swallower [Ravnica Allegiance Guild Kit]", want: "simic sky swallower gk2#124 N sku" },
  { store: "brints", title: "Rest in Peace (Borderless) (MAR-006) - Marvel Eternal-Legal", want: "rest in peace mar#6 N sku" },
  { store: "bardsandcards", title: "Savannah [International Collectors' Edition]", want: "savannah cei#281 N sku", why: "not Collector's Edition (CED), whose name is part of this one" },
  { store: "facetoface", title: "Arcane Signet [360] [Streets of New Capenna: Commander] [Non-Foil]", want: "arcane signet ncc#360 N sku" },
  { store: "cgrealm", title: "Mind Stone (WTH-) - Weatherlight", want: "mind stone wth#153 N name-set" },
  { store: "obsidiangames", title: "Enduring Courage (Japan Showcase Fracture Foil) [Duskmourn: House of Horror]", want: "enduring courage dsk#402 F sku", why: "'Japan Showcase' is a frame treatment of English cards, not a language" },
]);

// ── the keys that disagree with each other, or with the catalogue ──
table("gates", [
  { store: "hairytarantula", title: "1997 World Championships Ad [World Championship Decks 1997]", want: "miss:sku-title-disagree", why: "the title's leading number reads as a collector number (1997) and the sku's is 0" },
  { store: "mysterymtg", title: "Spike Feeder [FNM - 84]", want: "miss:title-key-not-in-catalogue" },
  { store: "hairytarantula", title: "1996 Bertrand Lestree Biography Card [World Championship Decks]", want: "miss:name-setname-not-in-catalogue" },
  { store: "collectorsmith", title: "Gwen Stacy // Ghost-Spider 209 (Marvel's Spider-Man)  - Showcase", want: "miss:treatment-differs", why: "number 209 is not a Showcase product: the number decides and the title states a treatment the product lacks" },
  { store: "gatorscardden", title: "Plains (Phyrexian) - Full Art (Oil Slick Raised Foil) 365 - Phyrexia: All Will Be One", want: "miss:treatment-differs" },
  { store: "gametime", title: "Urza's Saga (MH2-259) [The List]", want: "miss:set-conflict", why: "MH2-259 is a card of Modern Horizons 2; the title says it is The List's copy" },
  { store: "trinketmage", title: "Ultron, Machine Overlord - Commander: Marvel Super Heroes: Extras (Rare) [XMSC-460]", want: "miss:language-option ; miss:sku-numbers-disagree", why: "the German variant's sku names another number (#507): the product's skus do not agree, so none is trusted" },
]);

// ── sealed products ──
table("sealed", [
  { store: "jetcards", title: "Magic The Gathering - Aetherdrift - Commander Deck - Living Energy", want: "sealed Aetherdrift Commander Deck - Living Energy" },
  { store: "games401", title: "MTG - Tarkir: Dragonstorm - Play Booster Box", want: "sealed Tarkir: Dragonstorm - Play Booster Display", why: "a Play Booster Box is TCGplayer's Play Booster Display" },
  { store: "totalcards", title: "Magic The Gathering - Universes Beyond - Assassin's Creed - Beyond Booster Box (24 Packs)", want: "sealed Universes Beyond: Assassin's Creed - Beyond Booster Display" },
  { store: "moxboardinghouse", title: "Marvel Super Heroes Play Boosters", want: "sealed Marvel Super Heroes - Play Booster Pack" },
  { store: "cardcosmos", title: "Magic: The Gathering - Duskmourn: House of Horror Nightmare - Bundle - EN", want: "sealed Duskmourn: House of Horror - Nightmare Bundle" },
  { store: "moxboardinghouse", title: "The Hobbit Scene Box - Crack the Plates", want: "sealed The Hobbit Scene Box - Crack the Plates" },
  { store: "games401", title: "MTG - Dominaria Remastered - English Collector Booster Pack", want: "sealed Dominaria Remastered - Collector Booster Pack" },
  { store: "bunkscardcorner", title: "Magic Marvel Super Heroes Play Booster", want: "sealed Marvel Super Heroes - Play Booster Pack" },
]);

// ── languages ──
test("a variant in another language is skipped, a title or sku in another language is skipped, and a product that sells both keeps its English variants", () => {
  const l = pin("trinketmage", "Blur of Heroism - Commander: Marvel Super Heroes: Extras (Uncommon) [XMSC-585]");
  assert.deepEqual(l.variants.map((v) => v[0]), ["English / Near Mint / Foil Normal", "German / Near Mint / Foil Normal", "English / Near Mint / Normal"]);
  assert.deepEqual(answers(l).map(fmt), ["697120.F.sku", "miss:language-option", "697120.N.sku"]);
  // the same product's German variant carries its own sku, which names the same number: it is still the German card
  assert.equal(describe(pin("cryptmtg", "Abeyance (Janosch Kuhn)")), "abeyance wc97#jk1 N name-set ; miss:language-option");
  assert.equal(describe(pin("hideoutsg", "Demonic Tutor (Japanese Alternate Art)")), "miss:language-title");
  assert.equal(describe(pin("shopponistore", "Affluente Magmatico")), "miss:name-mismatch", "an Italian card name is not the English name");
});

test("languageOfVariant reads English and foreign words, in several languages, one slash-separated option at a time", () => {
  const cases: [string, "en" | "other" | null][] = [
    ["English / Near Mint / Foil Normal", "en"], ["Inglese / Near Mint / Regolare", "en"], ["German / Near Mint / Normal", "other"], ["Italian / Excellent / Normal", "other"], ["Near Mint French", "other"],
    ["Near Mint", null], ["Default Title", null], ["Near Mint Foil", null], ["Japanese", "other"], ["Simplified Chinese / NM", "other"], ["Near Mint / Español", "other"],
    ["Near Mint / Phyrexian", "other"], ["Hebrew / Near Mint", "other"], ["Latin", "other"], ["English / Phyrexian", "other"],
    // "Traditional Foil" is Wizards' name for a regular foil (the Secret Lair Drop Series titles of the corpus: "Secret Lair x Blood Bowl (Traditional Foil Edition)"), not the Traditional Chinese language
    ["Traditional Foil", null], ["Near Mint / Traditional Foil", null], ["Traditional Chinese / Near Mint", "other"], ["Chinese (Simplified)", "other"],
  ];
  for (const [text, want] of cases) assert.equal(languageOfVariant(text), want, text);
});

test("foreignByTags: a store's own language tag marks a foreign product; a list that also names English is not safe to price on the tag", () => {
  const z = pin("zatugames", "Magic: The Gathering - JAPANESE - Phyrexia");
  assert.equal(foreignByTags(z.tags, z.ptype), true);
  assert.equal(foreignByTags("Magic, English, German"), true, "a comma-separated string is read like a list");
  assert.equal(foreignByTags(["English", "Foil"]), false);
  assert.equal(foreignByTags([], "Japanese"), true, "the product type counts");
  assert.equal(foreignByTags(undefined), false);
  // a foreign tag does not reject a variant that states English itself
  const input = { title: "Terror of the Peaks [OTJ - 149]", skus: ["7826802"], tags: ["Japanese"], variantTitle: "Near Mint / English / Normal", explicitFoil: true };
  assert.equal(fmt(matchStoreProduct(input, ix)), "544402.N.set-number");
  assert.equal(fmt(matchStoreProduct({ ...input, variantTitle: "Near Mint / Normal" }, ix)), "miss:language-tag");
});

// ── cleaning a title ──
test("cleanTitle: entities, zero-width characters, rarity marks, 'No 495', 'Surge-Foil' and the bracket form of a set code", () => {
  const zw = String.fromCharCode(0x2063);
  const cases: [string, string][] = [
    ["Galaxy Foil Forest No 495 - Common Unfinity", "Galaxy Foil Forest (495) - Common Unfinity"],
    ["{C} Counterspell [Tempest][TMP 057]", "Counterspell [Tempest][TMP - 057]"],
    ["{R} Braids, Arisen Nightmare [Dominaria United][DMU 084]", "Braids, Arisen Nightmare [Dominaria United][DMU - 084]"],
    ["Merfolk of the Pearl Trident (4ED-086) - common", "Merfolk of the Pearl Trident (4ED-086)"],
    ["Solemn Simulacrum (Extended Art) (Surge-Foil)", "Solemn Simulacrum (Extended Art) (Surge foil)"],
    [`Assault Griffin${zw} - Magic 2011${zw} (Common)${zw} [6]`, "Assault Griffin - Magic 2011 [6]"],
    ["Soul&#39;s Attendant (ROE-044) - Rise of the Eldrazi", "Soul's Attendant (ROE-044) - Rise of the Eldrazi"],
    ["Bolg&rsquo;s Company &amp; Co", "Bolg's Company & Co"],
    ["An Offer You Can't Refuse (FIC - 267) - Commander: FINAL FANTASY - Uncommon - Normal", "An Offer You Can't Refuse (FIC - 267) - Commander: FINAL FANTASY - Normal"],
    ["Counterspell (Common) [TMP 057]", "Counterspell [TMP - 057]"],
  ];
  for (const [raw, want] of cases) assert.equal(cleanTitle(raw), want, raw);
  for (const l of listings.slice(0, 80)) assert.equal(cleanTitle(cleanTitle(l.title)), cleanTitle(l.title), `${l.key}: cleaning twice changes nothing`);
});

// ── structured SKUs ──
test("parseSku reads each store dialect to (set code, number, language, finish, extra segments) and refuses what is not one", () => {
  const known = indexVocab(ix.cards).code;
  const p = (s: string | null) => parseSku(s, known);
  assert.deepEqual(p("MH2-176-EN-NF-1"), { code: "mh2", num: "176", lang: "en", fin: "nonfoil", extra: [], dialect: "binderpos" });
  assert.deepEqual(p("FRC-2-EN-FO-1"), { code: "frc", num: "2", lang: "en", fin: "foil", extra: [], dialect: "binderpos" });
  assert.deepEqual(p("M3C-55-RIPPLE-EN-FO-1"), { code: "m3c", num: "55", lang: "en", fin: "foil", extra: ["RIPPLE"], dialect: "binderpos" }, "extra segments name the treatment of a twin");
  assert.deepEqual(p("PWAR-207-PROMO-PACK-EN-NF-1")?.extra, ["PROMO", "PACK"]);
  assert.equal(p("NEO-298-JA-NF-1")?.lang, "ja");
  assert.deepEqual(p("MTG-4ED-086-KYYUT0AJAC-1"), { code: "4ed", num: "86", lang: "en", fin: null, extra: [], dialect: "mtg" }, "the number loses its zeros: the key is nkey");
  assert.deepEqual(p("MTG-WPN-001-F-HPTWDQUPGQ-1"), { code: "wpn", num: "1", lang: "en", fin: "foil", extra: [], dialect: "mtg" });
  assert.deepEqual(p("cc-hob-bardkingofdale-144-nm-f"), { code: "hob", num: "144", lang: "en", fin: "foil", extra: [], dialect: "cc" });
  assert.equal(p("cc-hoc-gandalfshadowsfoe-99-nm-nf")?.fin, "nonfoil");
  assert.deepEqual(p("SIN-MTG-MH3-255-ENG-NM-NF"), { code: "mh3", num: "255", lang: "en", fin: "nonfoil", extra: [], dialect: "face-to-face" });
  assert.deepEqual(p("MTG-EN-TLA-318-NO-1"), { code: "tla", num: "318", lang: "en", fin: "nonfoil", extra: [], dialect: "mtg-lang" });
  assert.equal(p("MTG-EN-ZNR-127-FO-1")?.fin, "foil");
  assert.deepEqual(p("TLA184-22122123"), { code: "tla", num: "184", lang: "en", fin: null, extra: [], dialect: "glued" });
  assert.equal(p("FIC267Normal")?.fin, "nonfoil");
  assert.equal(p("FIN289Foil")?.fin, "foil");
  assert.deepEqual([p("XHOB211-110664442")?.code, p("XMSC585-89375014")?.code], ["hob", "msc"], "TCGplayer's Extras groups are X + the set code");
  for (const junk of ["799012", "None", "", "MTG-SOS-Bundle", "WTCD36310000", "SJ077303", "8807892", "MTG-9ED-0S4-TOBRGB52DK-1", "Z0MTGEdgeEt-0Godless Shrine [Edge of Eternities]"]) assert.equal(p(junk), null, junk);
  assert.equal(p(null), null);
  assert.equal(parseSku("MTG-ZZZ-12-1", () => null), null, "MTG-SET-NUM needs a set code the catalogue knows");
});

test("skuSetNumber and skuCardNumber: the one (set, number) every sku of a product agrees on", () => {
  assert.deepEqual(skuSetNumber(["MH2-176-EN-NF-1", "MH2-176-EN-FO-1"]), { sc: "mh2", nkey: "176" });
  assert.equal(skuSetNumber(["XMSC460-89857147", "XMSC507-91448216"]), null, "two numbers");
  assert.equal(skuSetNumber(["NEO-298-JA-NF-1"]), null, "a foreign sku");
  assert.equal(skuSetNumber([null, "None", "799012"]), null);
  assert.equal(skuCardNumber(["cc-hob-bardkingofdale-144-nm-f"]), "144");
});

test("a store's own sku comes first: a sibling's German sku does not reject the English variant, two numbers do", () => {
  const input = (own: string, other: string) => ({ title: "Blur of Heroism - Commander: Marvel Super Heroes: Extras (Uncommon) [XMSC-585]", skus: [own, other], variantTitle: "English / Near Mint / Normal", explicitFoil: true });
  assert.equal(fmt(matchStoreProduct(input("XMSC585-89375014", "XMSC585-93744115"), ix)), "697120.N.sku");
  assert.equal(fmt(matchStoreProduct(input("XMSC585-89375014", "XMSC586-93744115"), ix)), "miss:sku-numbers-disagree");
  assert.equal(fmt(matchStoreProduct(input("MH2-176-DE-NF-1", "XMSC585-93744115"), ix)), "miss:language-sku", "the variant's own sku says German");
});

// ── the title: what it states, apart from the card ──
test("treatmentWords: the closed vocabulary, longest phrase first; what it cannot read is left over, finish words and version marks are not treatments", () => {
  const tw = (t: string) => { const w = treatmentWords(t); return [[...w.keys].sort(), w.left]; };
  assert.deepEqual(tw("Extended Art Ripple Foil"), [["extended", "ripple"], []]);
  assert.deepEqual(tw("Borderless"), [["borderless"], []]);
  assert.deepEqual(tw("Showcase Fracture Foil"), [["fracture", "showcase"], []]);
  assert.deepEqual(tw("Japan Showcase Fracture Foil"), [["fracture", "jp"], []], "Japan Showcase is the frame, not a language");
  assert.deepEqual(tw("Retro Frame Serialized"), [["retro", "serial"], []]);
  assert.deepEqual(tw("Promo Pack"), [["promopack"], []]);
  assert.deepEqual(tw("Non-Foil Borderless"), [["borderless"], []]);
  assert.deepEqual(tw("Version 2"), [[], []]);
  assert.deepEqual(tw("Elven"), [[], ["elven"]]);
  assert.deepEqual(tw("Dwarvish Borderless"), [["borderless"], ["dwarvish"]]);
});

test("readTitle: the set, the number and the name of a real title, in each of the title dialects", () => {
  const v = indexVocab(ix.cards);
  const r = (t: string, lead = false) => { const x = readTitle(cleanTitle(t), v, lead)!; return { name: x.name, code: x.code, num: x.num, codes: [...x.codes].sort(), fin: x.fin }; };
  assert.deepEqual(r("Terror of the Peaks [OTJ - 149]"), { name: "Terror of the Peaks", code: "otj", num: "149", codes: [], fin: null });
  assert.deepEqual(r("Biorhythm (231) (9ED)"), { name: "Biorhythm", code: null, num: "231", codes: ["9ed"], fin: null });
  assert.deepEqual(r("Rook Turret 69/309 (FINAL FANTASY)  - Foil"), { name: "Rook Turret", code: null, num: "69", codes: ["fic", "fin"], fin: "foil" });
  const afr = r("Adventures in the Forgotten Realms 245/281 Greataxe (Foil)");
  assert.deepEqual([afr.name, afr.num, afr.fin, afr.codes.includes("afr")], ["Greataxe", "245", "foil", true], "the name of the set is every set that has borne it (its Commander deck, its Promo Pack group); the number and the card pick one");
  assert.deepEqual(r("Snap 66 - Dominaria Remastered"), { name: "Snap", code: null, num: "66", codes: ["dmr"], fin: null });
  assert.deepEqual(r("Hazezon Tamar [LEG]"), { name: "Hazezon Tamar", code: null, num: null, codes: ["leg"], fin: null });
  assert.deepEqual(r("Thranduil the Strategist (Extended Art) - #106 HOC"), { name: "Thranduil the Strategist", code: "hoc", num: "106", codes: ["hoc"], fin: null });
  assert.deepEqual(r("Transmogrifying Wand XCMM-981 Rare Near Mint Englisch"), { name: "Transmogrifying Wand", code: "cmm", num: "981", codes: [], fin: null });
  assert.deepEqual(r("Spider-Man 2099 [Marvel's Spider-Man]"), { name: "Spider-Man 2099", code: null, num: null, codes: ["spm"], fin: null });
  // a second reading that takes leading treatment words off the name
  assert.equal(readTitle("Showcase Clown Car", v, true)?.name, "Clown Car");
  assert.equal(readTitle("Terror of the Peaks", v, true), null, "no leading treatment word: no second reading");
});

test("cardNumbersIn and setCodesIn read the places a number and a code stand, and nothing else", () => {
  const nums: [string, string[]][] = [
    ["Terror of the Peaks [OTJ - 149]", ["149"]], ["Merfolk of the Pearl Trident (4ED-086) - common", ["86"]], ["Caves of Koilos 244 /281 - Rare Dominaria United", ["244"]], ["Thranduil the Strategist (Extended Art) - #106 HOC", ["106"]],
    ["Biorhythm (231) (9ED)", ["231"]], ["Bard, King of Dale (144)", ["144"]], ["Case of the Locked Hothouse [155] [Murders at Karlov Manor] [Non-Foil]", ["155"]], ["Magic Secrets of Strixhaven - Commander Deck: Lorehold Spirit", []],
    ["Adventures in the Forgotten Realms 245/281 Greataxe (Foil)", ["245"]],
  ];
  for (const [t, want] of nums) assert.deepEqual(cardNumbersIn(t), want, t);
  const codes: [string, string[]][] = [
    ["Terror of the Peaks [OTJ - 149]", ["OTJ"]], ["Merfolk of the Pearl Trident (4ED-086) - common", ["4ED"]], ["Biorhythm (231) (9ED)", ["9ED"]], ["Hazezon Tamar [LEG]", ["LEG"]], ["Sylvan Anthem [Modern Horizons 2]", []],
    ["Counterspell (NM) [TMP 057]", ["TMP"]], ["Arcane Signet (0056) [ECC 056]", ["ECC"]],
  ];
  for (const [t, want] of codes) assert.deepEqual(setCodesIn(t), want, t);
});

test("canonSet, titleNamesSet and the set vocabulary: a set by name or by code, a store's spelling, a Commander set named either way round", () => {
  assert.equal(canonSet("Magic: The Gathering - Foundations"), "foundations");
  assert.equal(canonSet("The Lord of the Rings: Tales of Middle-earth"), "lord of the rings tales of middle earth");
  assert.equal(canonSet("MTG Dominaria United"), "dominaria united");
  assert.equal(titleNamesSet("Sylvan Anthem [Modern Horizons 2]", "mh2", "Modern Horizons 2"), true);
  assert.equal(titleNamesSet("Terror of the Peaks [OTJ - 149]", "otj", "Outlaws of Thunder Junction"), true, "by code");
  assert.equal(titleNamesSet("Terror of the Peaks [OTJ - 149]", "mh2", "Modern Horizons 2"), false);
  assert.equal(titleNamesSet("Arcane Signet Streets of New Capenna Commander", "ncc", "Commander: Streets of New Capenna"), true);
  assert.equal(titleNamesSet("Nothing to see", "ncc", null), false);
  const v = indexVocab(ix.cards);
  assert.deepEqual([v.code("mh2"), v.code("MH2"), v.code("xmsc"), v.code("zzz"), v.code("apac")], ["mh2", "mh2", "msc", null, "apac"]);
  assert.deepEqual([...v.setName("Streets of New Capenna: Commander")], ["ncc"]);
  assert.deepEqual([...v.setName("Gatecrash Prerelease Promos")], ["pgtc"]);
  assert.deepEqual([...v.setName("Tarkir: Dragonstorm Special Guests")], ["spg"], "TCGplayer keeps a set's guests in one Special Guests group");
  assert.deepEqual([...v.setName("Nonsense Set")], []);
  assert.equal(v.isName("sylvan anthem"), true);
  assert.equal(v.isName("modern horizons 2"), false);
});

test("STORE_SET_ALIASES: each store spelling is folded, names a code the catalogue has, and is backed by a pinned real title", () => {
  const v = indexVocab(ix.cards);
  const pinned = listings.filter((l) => ["aliases", "appendix-b", "sku-dialects", "finish"].includes(l.group));
  for (const [label, code] of Object.entries(STORE_SET_ALIASES)) {
    assert.ok(v.code(code), `${label}: ${code} is a set of the catalogue`);
    assert.deepEqual([...v.setName(label)], [code], `${label} resolves`);
    const l = pinned.find((x) => cleanTitle(x.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(label));
    assert.ok(l, `${label}: a pinned listing carries this spelling`);
    const sc = answers(l).filter((a): a is StoreMatch => "id" in a).map((a) => rowById.get(a.id)!.sc);
    assert.ok(sc.length > 0 && sc.every((s) => s === code), `${label}: the listing "${l.title}" matches a product of ${code}`);
  }
  assert.equal(Object.keys(STORE_SET_ALIASES).length, 8);
});

// ── the index ──
test("the index leaves out what is not a card (tokens, art cards, oversized) and knows nothing without rows", () => {
  const sylvan = rowById.get(239693)!;
  const token: MatchRow = { ...sylvan, id: 999000001, cls: 1 };
  const art: MatchRow = { ...sylvan, id: 999000002, cls: 2, nkey: "999" };
  const only = buildCardIndex([token, art]);
  const ask = (cards: StoreMatchIndexes["cards"], sku: string) => matchStoreProduct({ title: "Sylvan Anthem [Modern Horizons 2]", skus: [sku], variantTitle: "Near Mint" }, { cards, names: new Map(), sealed: [] });
  assert.deepEqual(ask(only, "MH2-176-EN-NF-1"), { miss: "sku-key-not-in-catalogue" }, "a token at the key is no candidate");
  assert.deepEqual(ask(only, "MH2-999-EN-NF-1"), { miss: "sku-key-not-in-catalogue" });
  assert.deepEqual(ask(buildCardIndex([token, sylvan]), "MH2-176-EN-NF-1"), { id: 239693, finish: "N", path: "sku" });
  assert.deepEqual(ask(buildCardIndex([]), "MH2-176-EN-NF-1"), { miss: "sku-key-not-in-catalogue" });
  assert.deepEqual(ask(new Map(), "MH2-176-EN-NF-1"), { miss: "sku-key-not-in-catalogue" }, "an index not built by buildCardIndex is an empty one, not a crash");
});

test("a card whose own name is a grading word is a card; the same word beside the name is a slab", () => {
  // real catalogue rows (TCGCSV 2026-10-07): Admiral Beckett Brass of Ixalan and Slab Hammer of Battle for Zendikar; no corpus listing carries these names, so they are written in the dialect of a pinned store ([SET - NUM])
  const base = { groupId: 0, setNames: [] as string[], treat: [] as MatchRow["treat"], hasN: true, hasF: true, etched: false, rootId: null, cls: 0 };
  const own = buildCardIndex([
    { ...base, id: 142029, groupId: 2043, names: ["admiral beckett brass"], sc: "xln", setNames: ["ixalan"], nkey: "217", label: null },
    { ...base, id: 105680, groupId: 1645, names: ["slab hammer"], sc: "bfz", setNames: ["battle for zendikar"], nkey: "227", label: null },
  ]);
  const ask = (title: string) => fmt(matchStoreProduct({ title, skus: [], variantTitle: "Near Mint / English / Normal" }, { cards: own, names: new Map(), sealed: [] }));
  assert.equal(ask("Admiral Beckett Brass [XLN - 217]"), "142029.N.set-number");
  assert.equal(ask("Slab Hammer [BFZ - 227]"), "105680.N.set-number");
  assert.equal(ask("Slab Hammer PSA 9 [BFZ - 227]"), "miss:graded-lot-proxy");
  assert.equal(ask("Admiral Beckett Brass (BGS 9.5) [XLN - 217]"), "miss:graded-lot-proxy");
  assert.equal(ask("Admiral Beckett Brass Playset [XLN - 217]"), "miss:graded-lot-proxy");
});

test("a store product with no title, a null sku, tags as a string and a missing product type is answered, not thrown at", () => {
  assert.deepEqual(matchStoreProduct({ title: "", skus: [] }, ix), { miss: "nokey" });
  assert.deepEqual(matchStoreProduct({ title: "Sylvan Anthem [Modern Horizons 2]", skus: [null, undefined, ""] }, ix), { miss: "finish-unknown" }, "no variant, no sku and no convention: the finish is not stated");
  const m = matchStoreProduct({ title: "Terror of the Peaks [OTJ - 149]", skus: [undefined], tags: "Creature, Magic, Mythic", productType: null, variantTitle: "Near Mint / English / Normal", explicitFoil: true }, ix);
  assert.deepEqual(m, { id: 544402, finish: "N", path: "set-number" });
});

// ── rows without the optional fields (amendment W03-2): the importer fills label and abbr only when WP01b has (REQ-WP03-1) ──
test("an index built from rows without label and abbr never answers with another product than the full index does where both answer", () => {
  const bare = rows.map(({ label: _label, abbr: _abbr, ...r }) => r as MatchRow);
  assert.ok(bare.every((r) => r.label === undefined && r.abbr === undefined));
  const degraded: StoreMatchIndexes = { cards: buildCardIndex(bare), names: buildNameIndex(bare), sealed };
  let both = 0, onlyFull = 0; const differ: string[] = [];
  for (const l of listings) {
    const full = answers(l), thin = answers(l, degraded);
    full.forEach((a, i) => {
      const b = thin[i]!;
      if ("id" in a && "id" in b) { both++; if (a.id !== b.id || a.finish !== b.finish) differ.push(`${l.key} [${l.variants[i]![0]}] full ${fmt(a)} bare ${fmt(b)}`); }
      else if ("id" in a) onlyFull++;
    });
  }
  assert.deepEqual(differ, []);
  assert.ok(both > 500, `${both} variants are matched by both indexes`);
  assert.ok(onlyFull > 0, "the label and the abbreviation do find listings the bare index cannot");
  // the bare index also reads titles the full one refuses (a plain title beside a Promo Pack of the same set name: `Choreographed Sparks [Promo Pack: Secrets of Strixhaven]`), so the importer must fill label and abbr (REQ-WP03-1) before its first real run
});

// ── a listing that is the same card under another key is one product ──
test("the same card keyed by sku, by SET-NUM and by number + set name is the same product", () => {
  const sku = matchStoreProduct({ title: "Counterspell", skus: ["TMP-057-EN-NF-1"], variantTitle: "Near Mint", explicitFoil: true }, ix);
  const num = matchStoreProduct({ title: "Counterspell [TMP - 057]", skus: [], variantTitle: "Near Mint / Normal" }, ix);
  const nameSet = matchStoreProduct({ title: "Counterspell [Tempest]", skus: [], variantTitle: "Near Mint / Normal" }, ix);
  assert.deepEqual([sku, num, nameSet].map(fmt), ["5503.N.sku", "5503.N.set-number", "5503.N.name-set"]);
});

test("a name alone is never a key, and a title with a set but a different card at that key is a name-mismatch", () => {
  assert.deepEqual(matchStoreProduct({ title: "Counterspell", skus: [], variantTitle: "Near Mint / Normal" }, ix), { miss: "nokey" });
  assert.deepEqual(matchStoreProduct({ title: "Lightning Bolt [TMP - 057]", skus: [], variantTitle: "Near Mint / Normal" }, ix), { miss: "name-mismatch" });
  assert.deepEqual(matchStoreProduct({ title: "Counterspell [Modern Horizons 2]", skus: [], variantTitle: "Near Mint / Normal" }, ix), { miss: "name-setname-not-in-catalogue" });
  assert.deepEqual(matchStoreProduct({ title: "Counterspell [TMP - 057]", skus: ["MH2-176-EN-NF-1"], variantTitle: "Near Mint" }, ix), { miss: "sku-title-disagree" });
});

test("matchStoreVariants is matchStoreProduct per variant with the siblings' skus and titles filled in", () => {
  const l = pin("spellroo", "Starting Town (FIN - 289)");
  const viaProduct = l.variants.map((v, i) => matchStoreProduct({
    title: l.title, skus: [v[3], ...l.variants.filter((_, j) => j !== i).map((o) => o[3])], tags: l.tags, productType: l.ptype, variantTitle: v[0], explicitFoil: l.explicitFoil, siblingTitles: l.variants.filter((_, j) => j !== i).map((o) => o[0]),
  }, ix));
  assert.deepEqual(answers(l), viaProduct);
  assert.deepEqual(answers(l).map(fmt), ["631607.F.sku", "631607.N.sku"]);
});

// ── a listing read as free text (the eBay path) ──
test("matchCardTitle: store titles read as free text give the product the store path gives, or nothing", () => {
  let agree = 0; const bad: string[] = [];
  for (const l of listings) {
    const ids = new Set(l.expect.filter((e) => /^\d+\./.test(e) && !e.endsWith(".sealed")).map((e) => e.split(".")[0]));
    if (ids.size !== 1) continue;
    const r = matchCardTitle(l.title, ix.cards);
    if (!("id" in r)) continue;
    if (String(r.id) === [...ids][0]) agree++; else bad.push(`${l.key}: title ${r.id}, store ${[...ids][0]}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(agree > 100, `${agree} titles resolve the same way by both paths`);
});

test("matchCardTitle on titles written in a seller's style from catalogue rows: card, set and number, the finish when it is stated", () => {
  // no eBay call is made anywhere: these are the card names, set codes and numbers of rows in rows.json, arranged the way sellers write them
  const t = (title: string) => { const r = matchCardTitle(title, ix.cards); return "id" in r ? `${r.id}.${r.finish ?? "?"}` : `miss:${r.miss}`; };
  assert.equal(t("MTG Terror of the Peaks OTJ 149 Outlaws of Thunder Junction Near Mint"), "544402.?");
  assert.equal(t("Magic the Gathering Lightning Bolt 2X2 117 Double Masters 2022 Foil NM"), "276484.F");
  assert.equal(t("Magic the Gathering Lightning Bolt 2X2 117 Double Masters 2022 Non-Foil NM"), "276484.N");
  assert.equal(t("Allosaurus Shepherd 2X2 457 Foil Etched Double Masters 2022"), "276342.F", "the etched product");
  assert.equal(t("FOIL Caves of Koilos 244 /281 - Rare Dominaria United"), "282783.F");
  assert.equal(t("International Collectors' Edition Savannah"), "97302.?", "not Collector's Edition, whose name is a part of this one");
  assert.equal(t("Sylvan Anthem [Modern Horizons 2]"), "miss:ambiguous", "two products of the set share the card's name and the title gives no number");
  assert.equal(t("Sylvan Anthem MH2 176"), "239693.?", "a bare set code and number");
  assert.equal(t("Sylvan Anthem MH2 176/303 Modern Horizons 2 Foil"), "239693.F");
  assert.equal(t("Sylvan Anthem MH2 2024"), "miss:name-mismatch", "a year after a set code is read as a number and finds no such card");
  assert.equal(t("PSA 9 Sylvan Anthem MH2 176"), "miss:graded-lot-proxy");
  assert.equal(t("Sylvan Anthem NM Magic the Gathering"), "miss:nokey");
  assert.equal(t("Marvel Super Heroes Play Booster Box MSH"), "miss:not-a-single");
  assert.equal(t("Wrong Name MH2 176"), "miss:name-mismatch");
});

test("matchCardTitle: a title that names The List is The List's product, never the original printing it reprints", () => {
  // two real TCGCSV rows (2026-10-07): The List's Artisan of Kozilek, numbered "cm2-14" in the PLST set, and the Commander Anthology Volume II printing it reprints, #14 of CM2
  const original: MatchRow = { id: 166725, groupId: 2246, names: ["artisan of kozilek"], sc: "cm2", setNames: ["commander anthology volume ii"], nkey: "14", treat: [], hasN: true, hasF: false, etched: false, rootId: null, cls: 0, label: null, abbr: "cm2" };
  const list = rowById.get(202763)!;
  assert.equal(list.sc, "plst");
  assert.equal(list.nkey, "cm2-14");
  const both = buildCardIndex([...rows, original]);
  const t = (title: string) => { const r = matchCardTitle(title, both); return "id" in r ? r.id : `miss:${r.miss}`; };
  assert.equal(t("Artisan of Kozilek The List PLST CM2-14 Near Mint"), 202763);
  assert.equal(t("Artisan of Kozilek (The List) CM2 14 NM"), 202763);
  assert.equal(t("Artisan of Kozilek CM2 14 Commander Anthology Volume II Near Mint"), 166725, "the original printing, when the title does not name The List");
  assert.equal(t("Artisan of Kozilek The List PLST CM2-15 NM"), "miss:name-mismatch", "The List has no such card: the original printing is not offered instead");
});

test("matchCardBySku: a numberless title is placed by the (set, number) of its skus, strictly", () => {
  const ask = (title: string, skus: (string | null)[]) => { const r = matchCardBySku(title, skus, ix.cards); return "id" in r ? r.id : r.miss; };
  assert.equal(ask("Bard, King of Dale (144)", ["cc-hob-bardkingofdale-144-nm-f"]), 707036);
  assert.equal(ask("Gandalf, Shadow's Foe (99)", ["cc-hoc-gandalfshadowsfoe-99-nm-nf"]), 709000);
  assert.equal(ask("Soul Shatter [Zendikar Rising]", ["MTG-EN-ZNR-127-NO-1"]), 221926);
  assert.equal(ask("Bard, King of Dale (144)", [null]), "no-sku-number");
  assert.equal(ask("Black Lotus [Unlimited Edition]", ["LEA-233-EN-NF-1"]), "sku-key-not-in-catalogue");
  assert.equal(ask("Esper Sentinel (Sketch) [Modern Horizons 2]", ["MH2-328-EN-NF-1"]), "treatment-not-in-product");
  assert.equal(ask("Playmat [Modern Horizons 2]", ["MH2-176-EN-NF-1"]), "accessory");
  assert.equal(ask("Sylvan Anthem [Modern Horizons 2]", ["MH2-176-DE-NF-1"]), "language-sku");
});

test("matchByName (the TCGplayer-name path): name, set and treatments must all agree, and an etched title is left to the others", () => {
  assert.equal(matchByName("Sylvan Anthem [Modern Horizons 2]", ix.names), 239693);
  assert.equal(matchByName("Exotic Orchard (Extended Art) - Doctor Who", ix.names), 519347);
  assert.equal(matchByName("Soul Shatter [Zendikar Rising]", ix.names), 221926);
  assert.equal(matchByName("Tiger-Seal (Borderless) [Avatar: The Last Airbender]", ix.names), null, "the product has more treatments than the title states");
  assert.equal(matchByName("Hazezon Tamar [LEG]", ix.names), null, "a set code is not a set name");
  assert.equal(matchByName("Allosaurus Shepherd (Foil Etched) [Double Masters 2022]", ix.names), null, "the name index cannot tell an etched product from its plain twin");
  assert.equal(matchByName("Magic Secrets of Strixhaven - Commander Deck: Lorehold Spirit", ix.names), null);
  assert.equal(matchByName("Sylvan Anthem", ix.names), null);
});

// ── sealed products ──
test("sealed titles are answered by the words that tell products apart, and never across kinds or languages", () => {
  const w = (t: string) => sealedWords(t).join(" ");
  assert.equal(w("Magic The Gathering - Universes Beyond - Assassin's Creed - Beyond Booster Box (24 Packs)"), w("Universes Beyond: Assassin's Creed - Beyond Booster Display"), "'Display' is TCGplayer's word for a box, the pack count is noise");
  assert.equal(w("Marvel Super Heroes Play Boosters"), w("Marvel Super Heroes - Play Booster Pack"));
  assert.notEqual(w("Marvel Super Heroes Play Booster Box"), w("Marvel Super Heroes Play Boosters"));
  const id = (t: string) => { const r = matchSealedTitle(t, sealed); return "id" in r ? r.id : r.miss; };
  assert.equal(id("Marvel Super Heroes Play Boosters"), 675602);
  assert.equal(id("Marvel Super Heroes Play Booster Box"), 675603);
  assert.equal(id("Secrets of Strixhaven Bundle"), 675561);
  assert.equal(id("Magic The Gathering - Aetherdrift - Commander Deck - Living Energy"), 604258);
  assert.equal(id("Magic: The Gathering - Der Hobbit Play Booster Box - DE"), "not-sealed");
  assert.equal(id("Secrets of Strixhaven Bundle Box Empty"), "not-sealed");
  assert.equal(id("Dominaria Remastered Bundle Playmat"), "not-sealed");
  assert.equal(id("Phyrexia: All Will Be One Set Booster Pack Japanese"), "language-title");
  assert.equal(id("Magic The Gathering - A Set Nobody Printed - Bundle"), "no-product");
  assert.ok(sealed.every((x) => !rowById.has(x.id)), "a sealed product is never a card row");
});

// ── conditions and variants ──
test("conditionRank and conditionLabel: the condition a real variant title states, none when it states none", () => {
  const cases: [string, number, string | null][] = [
    ["Near Mint", 0, "NM"], ["Near Mint Foil", 0, "NM"], ["Lightly Played", 1, "LP"], ["Slightly Played", 1, "LP"], ["Excellent", 1, "LP"], ["Moderately Played", 2, "MP"], ["Heavily Played", 3, "HP"], ["Damaged", 4, "DMG"],
    ["NM", 0, "NM"], ["LP", 1, "LP"], ["MP", 2, "MP"], ["HP", 3, "HP"], ["DMG", 4, "DMG"], ["Played", 2, "MP"], ["Good", 2, "MP"], ["Poor", 4, "DMG"],
    ["English / Excellent / Normal", 1, "LP"], ["Non Foil / Slightly Played", 1, "LP"], ["Near Mint / English / Foil", 0, "NM"],
    ["Default Title", 0, null], ["Regolare", 0, null], ["Foil", 0, null],
  ];
  for (const [text, rank, label] of cases) { assert.equal(conditionRank(text), rank, text); assert.equal(conditionLabel(text), label, text); }
  assert.equal(conditionLabel(null), null);
  assert.equal(conditionLabel(undefined), null);
});

const variantsOf = (l: Listing): StoreVariant[] => l.variants.map((v) => ({ title: v[0], price: v[1], available: v[2] }));
test("bestVariant: the best condition in stock first, then the lowest price; another language, a graded or signed copy never", () => {
  // Mystic Remora: Near Mint is in stock
  assert.deepEqual(bestVariant(variantsOf(pin("mistymountain", "{C} Mystic Remora"))), { priceCents: 1150, condition: "NM" });
  // Dark Ritual: Near Mint is out of stock, Lightly Played is the best that is not
  const ritual = pin("cgrealm", "Dark Ritual (3ED-) - Revised Edition");
  assert.deepEqual(variantsOf(ritual).map((v) => [v.title, v.available]), [["Near Mint", false], ["Lightly Played", true], ["Moderately Played", true], ["Heavily Played", true], ["Damaged", false]]);
  assert.deepEqual(bestVariant(variantsOf(ritual)), { priceCents: 509, condition: "LP" });
  // Force of Will: a signed copy in stock is not the card; Lightly Played is
  const will = variantsOf(pin("stompinggrounds", "Force of Will [Alliances]"));
  assert.deepEqual(bestVariant(will), { priceCents: 7050, condition: "LP" });
  assert.equal(bestVariant(will.filter((v) => /Signed|Graded/.test(v.title))), null, "only signed and graded copies are left: nothing buyable");
  // Alien Symbiosis: the German variant is the same price and is not the English card
  const symbiosis = variantsOf(pin("trinketmage", "Alien Symbiosis"));
  assert.deepEqual(bestVariant(symbiosis), { priceCents: 25, condition: "NM" });
  assert.equal(bestVariant([]), null);
  assert.equal(bestVariant([{ title: "Near Mint", price: "0.00", available: true }]), null, "a zero price is no price");
  assert.deepEqual(bestVariant([{ title: "Near Mint / Traditional Foil", price: "4.30", available: true }]), { priceCents: 430, condition: "NM" }, "a Traditional Foil is not a Traditional Chinese card");
});

test("anyVariant: the cheapest variant of any condition, in stock or not", () => {
  assert.equal(anyVariant(variantsOf(pin("cgrealm", "Dark Ritual (3ED-) - Revised Edition"))), 197);
  assert.equal(anyVariant(variantsOf(pin("mistymountain", "{C} Mystic Remora"))), 737);
  assert.equal(anyVariant([]), null);
  assert.equal(anyVariant([{ title: "Near Mint", price: "0", available: true }]), null);
});

// ── price sanity against the market of the matched finish ──
test("plausibleSinglePrice: a store price far from the market of the finish it was matched to is a wrong match, not a deal", () => {
  // Force of Will (Alliances), TCGplayer market $67.01
  assert.equal(plausibleSinglePrice(7050, 6701), true);
  assert.equal(plausibleSinglePrice(2010, 6701), false, "under 30% of the market");
  assert.equal(plausibleSinglePrice(2011, 6701), true);
  assert.equal(plausibleSinglePrice(27305, 6701), false, "over 4x the market plus $5");
  assert.equal(plausibleSinglePrice(27304, 6701), true);
  // a cheap card has no lower bound: stores price commons at their minimum
  assert.equal(plausibleSinglePrice(5, 100), true);
  assert.equal(plausibleSinglePrice(901, 100), false);
  assert.equal(plausibleSinglePrice(900, 100), true);
  assert.equal(plausibleSinglePrice(123456, null), true, "no market, no judgement");
});

test("every US store price of the fixture sits inside the band, but the collectibles priced as what they are: those are dropped by the guard", () => {
  const OUTSIDE: Record<string, string> = {
    "bardsandcards/teysa-orzhov-scion-retro-serialized-ravnica-remastered": "the serialized copy: $2,500 for a market of $360",
    "bardsandcards/liliana-vess-747-autographed-secret-lair-drop-series": "the autographed copy: $4,000 for a market of $800",
    "bardsandcards/savannah-international-collectors-edition": "$180,934.80 for a market of $250",
  };
  const seenOutside = new Set<string>(); let judged = 0;
  for (const l of listings) {
    if (!l.marketCents) continue;
    answers(l).forEach((a, i) => {
      if (!("id" in a) || a.path === "sealed") return;
      const market = l.marketCents![`${a.id}.${a.finish}`];
      if (!market) return;
      judged++;
      const price = Math.round(parseFloat(l.variants[i]![1]) * 100);
      if (plausibleSinglePrice(price, market)) return;
      assert.ok(l.key in OUTSIDE, `${l.key} [${l.variants[i]![0]}]: $${price / 100} against a market of $${market / 100} is not in the list of explained outliers`);
      seenOutside.add(l.key);
    });
  }
  assert.deepEqual([...seenOutside].sort(), Object.keys(OUTSIDE).sort());
  assert.ok(judged > 100, `${judged} US prices judged`);
});

test("plausibleSealedPrice: half to three times the market of the product", () => {
  assert.equal(plausibleSealedPrice(5000, 10000), true);
  assert.equal(plausibleSealedPrice(4999, 10000), false);
  assert.equal(plausibleSealedPrice(30000, 10000), true);
  assert.equal(plausibleSealedPrice(30001, 10000), false);
  assert.equal(plausibleSealedPrice(1, null), true);
});

// ── one row per (store, product, finish) ──
function draftsOf(l: Listing, indexes: StoreMatchIndexes = ix): OfferDraft[] {
  const out: OfferDraft[] = [];
  answers(l, indexes).forEach((a, i) => {
    if (!("id" in a)) return;
    const v = l.variants[i]!;
    out.push({ productId: a.id, finish: a.finish, priceCents: Math.round(parseFloat(v[1]) * 100), inStock: v[2], condition: conditionLabel(v[0]), path: a.path });
  });
  return out;
}
test("collapseOffers: five conditions of one product are one row, the best condition in stock", () => {
  const ritual = draftsOf(pin("cgrealm", "Dark Ritual (3ED-) - Revised Edition"));
  assert.equal(ritual.length, 5);
  const { rows: collapsed, collapsed: n } = collapseOffers(ritual);
  assert.equal(n, 4);
  assert.deepEqual(collapsed, [{ productId: 1381, finish: "N", priceCents: 509, inStock: true, condition: "LP", path: "name-set" }], "Near Mint is out of stock, so Lightly Played at $5.09 is the row");
});

test("collapseOffers: two store listings of one card are one row per finish; in stock first, then the lower price", () => {
  const both = listings.filter((l) => l.group === "dupes");
  assert.equal(both.length, 2);
  assert.notEqual(both[0]!.handle, both[1]!.handle, "two handles of one store");
  const drafts = both.flatMap((l) => draftsOf(l));
  assert.deepEqual(drafts.map((d) => `${d.productId}.${d.finish} $${d.priceCents / 100} ${d.inStock ? "in stock" : "out"}`).sort(), ["641870.F $50 in stock", "641870.N $30.75 in stock", "641870.N $32.25 out"]);
  const { rows: out, collapsed } = collapseOffers(drafts);
  assert.equal(collapsed, 1);
  assert.deepEqual(out.map((d) => `${d.productId}.${d.finish} $${d.priceCents / 100}`).sort(), ["641870.F $50", "641870.N $30.75"]);
  // the order of the drafts does not change the rows
  assert.deepEqual(collapseOffers([...drafts].reverse()).rows.map((d) => `${d.productId}.${d.finish} $${d.priceCents / 100}`).sort(), ["641870.F $50", "641870.N $30.75"]);
});

test("collapseOffers: an in-stock row beats a cheaper one that is out of stock, and equal rows keep the lower path", () => {
  const base: OfferDraft = { productId: 641870, finish: "N", priceCents: 3075, inStock: true, condition: "NM", path: "set-number" };
  assert.deepEqual(collapseOffers([{ ...base, priceCents: 100, inStock: false }, base]).rows, [base]);
  assert.deepEqual(collapseOffers([{ ...base, condition: "LP", priceCents: 100 }, base]).rows, [base], "condition before price");
  assert.deepEqual(collapseOffers([{ ...base, path: "sku" }, base]).rows, [base], "set-number sorts before sku");
  assert.deepEqual(collapseOffers([]), { rows: [], collapsed: 0 });
});

// ── the whole pinned set, once ──
test("the pinned listings together: how many are matched, skipped by a gate, and why (a regression net for the rules)", () => {
  const byReason = new Map<string, number>(); let matched = 0, variants = 0;
  for (const l of listings) for (const a of answers(l)) { variants++; if ("id" in a) matched++; else byReason.set(a.miss, (byReason.get(a.miss) ?? 0) + 1); }
  assert.equal(variants, listings.reduce((n, l) => n + l.variants.length, 0));
  assert.ok(matched / variants > 0.6, `${matched} of ${variants} variants matched`);
  assert.ok((byReason.get("language-option") ?? 0) > 20);
});
