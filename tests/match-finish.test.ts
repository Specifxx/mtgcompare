// The finish step of the store-listing matcher (src/lib/match.ts, owner WP03), pinned against REAL Magic listings.
//
// A finish is part of the key: Non-Foil and Foil of one printing are two (product, finish) units with two prices, and a store that sells both has two offers. It is decided PER VARIANT, in this order:
//   1. the variant's own words ("Near Mint Foil", "Foil / Near Mint", "English / Foil Normal") and its SKU suffix (-NF / -FO, Normal / Foil, -nm-f), which must agree
//   2. the title ("Foil", "Non-Foil", "Foil Etched", a foil pattern such as "Surge Foil")
//   3. only for a store that marks every foil (explicitFoil) or a product whose other variants carry foil words: an unmarked variant is non-foil
// A Foil TAG never decides (40 of the 67 stores tag more than 30% of their products Foil). When no step decides, the variant is skipped, never guessed.
// TCGplayer models a finish two ways, one product with Normal and Foil rows, or a separate foil-only product ("Surge Foil", "Foil Etched"); the finish picks the product that sells it, and when two products
// sell the foil that the title cannot tell apart, the listing is skipped.
//
// The fixtures are those of tests/match.test.ts (tests/fixtures/titles/: real listings of 102 stores, the catalogue rows they involve); a case that is not a listing as the store has it says so (a variant title
// or a sku swapped for another real one of the same product, to see which of the two decides).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildCardIndex,
  buildNameIndex,
  cleanTitle,
  collapseOffers,
  conditionLabel,
  finishOfText,
  matchStoreProduct,
  matchStoreVariants,
  variantFacts,
  type MatchRow,
  type OfferDraft,
  type SealedRef,
  type StoreListingInput,
  type StoreMatch,
  type StoreMatchIndexes,
  type StoreMiss,
} from "../src/lib/match";

interface Listing {
  key: string; group: string; store: string; market: string; handle: string; title: string; ptype: string; tags: string[];
  variants: [string, string, boolean, string | null][];     // title, price, in stock, sku
  explicitFoil: boolean;
  expect: string[];
}
const FIX = path.resolve(__dirname, "fixtures/titles");
const read = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8")) as T;
const rows = read<MatchRow[]>("rows.json");
const sealed = read<SealedRef[]>("sealed.json");
const listings = read<Listing[]>("listings.json");
const ix: StoreMatchIndexes = { cards: buildCardIndex(rows), names: buildNameIndex(rows), sealed };
const rowById = new Map(rows.map((r) => [r.id, r]));

const fmt = (a: StoreMatch | StoreMiss): string => ("id" in a ? `${a.id}.${a.finish}.${a.path}` : `miss:${a.miss}`);
const m = (l: StoreListingInput): string => fmt(matchStoreProduct(l, ix));
function answers(l: Listing): (StoreMatch | StoreMiss)[] {
  return matchStoreVariants({ title: l.title, tags: l.tags, productType: l.ptype, explicitFoil: l.explicitFoil, variants: l.variants.map((v) => ({ title: v[0], sku: v[3] })) }, ix);
}
function describe(l: Listing): string {
  const hit = new Map<string, Set<string>>(); const miss = new Set<string>();
  for (const a of answers(l)) {
    if (!("id" in a)) { miss.add(`miss:${a.miss}`); continue; }
    const r = rowById.get(a.id)!;
    const k = `${r.names[0]} ${r.sc}#${r.nkey}|${a.path}`;
    (hit.get(k) ?? hit.set(k, new Set()).get(k)!).add(a.finish);
  }
  return [...[...hit].sort().map(([k, f]) => { const [what, via] = k.split("|"); return `${what} ${[...f].sort().reverse().join("+")} ${via}`; }), ...[...miss].sort()].join(" ; ");
}
function pin(store: string, start: string): Listing {
  const want = cleanTitle(start);
  const hits = listings.filter((l) => l.store === store && cleanTitle(l.title).startsWith(want));
  const exact = hits.filter((l) => cleanTitle(l.title) === want);
  const one = exact.length === 1 ? exact : hits;
  assert.equal(one.length, 1, `${store} "${start}" must name exactly one pinned listing, found ${one.length}`);
  return one[0]!;
}

// ── the real listings that pin the step ──
const FINISH: { store: string; title: string; want: string; why?: string }[] = [
  { store: "mistymountain", title: "{R} Braids, Arisen Nightmare [Dominaria United][DMU 084]", want: "braids arisen nightmare dmu#84 N+F sku", why: "one product, five Near Mint-to-Damaged variants per finish: two offers" },
  { store: "mistymountain", title: "{C} Relic of Legends [Dominaria United][DMU 236]", want: "relic of legends dmu#236 N+F sku" },
  { store: "mythicstore", title: "Charge of Eternia - Full Throttle [Secret Lair Drop Series]", want: "full throttle sld#7181 N+F sku", why: "a Secret Lair names its art before the card ('Charge of Eternia - '); the card is Full Throttle" },
  { store: "gametime", title: "Golbez, Crystal Collector (Borderless) (Surge Foil) (540) [Final Fantasy]", want: "golbez crystal collector fin#540 F set-number ; miss:finish-conflict", why: "a Surge Foil title with Non Foil variants: the variants contradict the title, they are skipped; the Foil variants match" },
  { store: "gatorscardden", title: "Force Spike 76 - 7th Edition", want: "force spike 7ed#76 N set-number" },
  { store: "cardboardanddie", title: "Tainted Aether [7ED - 167]", want: "tainted aether 7ed#167 F set-number", why: "the variant says Foil" },
  { store: "cardboardanddie", title: "Biorhythm [9ED - 231]", want: "biorhythm 9ed#231 N set-number" },
  { store: "cardboardanddie", title: "Counterspell (0002) [MEDIA - 2]", want: "miss:ambiguous", why: "two products at one set and number sell the foil (Media Promos), and the title names no treatment" },
  { store: "magicandmonsters", title: "Command Tower [Media Promos]", want: "miss:ambiguous" },
  { store: "magicandmonsters", title: "Gleaming Splendor (Borderless) [The Hobbit]", want: "miss:ambiguous ; miss:finish-not-offered", why: "the sku's number is the Surge Foil product's, the title names a Borderless that another product of the set states exactly, and the prices are that product's: the foil cannot be placed, the non-foil is not sold by the sku's product" },
  { store: "hideoutsg", title: "Dark Ritual (Borderless) [Secret Lair Drop Series]", want: "dark ritual sld#1170 N+F sku" },
  { store: "hideoutsg", title: "Shredder, Shadow Master (Borderless) (Surge Foil) [Teenage Mutant Ninja Turtles Commander]", want: "shredder shadow master tmc#88 F sku" },
  { store: "bardsandcards", title: "Liliana Vess (747) (Autographed) [Secret Lair Drop Series]", want: "liliana vess sld#747 F sku" },
  { store: "mightycoolgames", title: "Bulk Up (JP Alternate Art) [Secrets of Strixhaven: Mystical Archive]", want: "bulk up soa#105 N sku", why: "'JP Alternate Art' is the Japan Showcase frame of an English card" },
  { store: "ggmorley", title: "Barrowgoyf (Extended Art) [Modern Horizons 3 Commander]", want: "barrowgoyf m3c#50 N sku ; miss:ambiguous", why: "Extended Art has a non-foil product and a Ripple Foil product at #50: the Non-Foil variants are the first, the Foil variants could be the second or an Extended Art foil nobody lists, and are skipped" },
  { store: "ggmorley", title: "Barrowgoyf (Extended Art) (Ripple Foil) [Modern Horizons 3 Commander]", want: "barrowgoyf m3c#50 F sku", why: "the same card with the pattern in the title is the Ripple Foil product" },
];
test("finish: the table is the whole pinned group", () => {
  const pinned = FINISH.map((r) => pin(r.store, r.title).key).sort();
  assert.deepEqual(pinned, listings.filter((l) => l.group === "finish").map((l) => l.key).sort());
});
for (const r of FINISH) test(`finish: ${r.store} "${r.title}" -> ${r.want}`, () => assert.equal(describe(pin(r.store, r.title)), r.want, r.why));

// ── what a piece of text states ──
test("finishOfText: foil, non-foil, etched or both; a foil pattern is a foil; 'Foil Normal' is Foil", () => {
  const cases: [string, ReturnType<typeof finishOfText>][] = [
    ["Near Mint Foil", "foil"], ["Foil / Near Mint", "foil"], ["English / Foil Normal", "foil"], ["Surge Foil", "foil"], ["Rainbow Foil", "foil"],
    ["Non-Foil", "nonfoil"], ["Non Foil", "nonfoil"], ["Normal", "nonfoil"], ["Regolare", "nonfoil"], ["Regulär", "nonfoil"],
    ["Foil Etched", "etched"], ["Etched", "etched"],
    ["Near Mint", null],
    ["Non-Foil Foil", "conflict"], ["Nonfoil Etched", "conflict"],
  ];
  for (const [text, want] of cases) assert.equal(finishOfText(text), want, text);
});

test("variantFacts: language, finish and graded copies of a real variant title and its options", () => {
  const f = (t: string, o?: string[]) => variantFacts(t, o);
  assert.deepEqual(f("Near Mint Foil"), { lang: null, fin: "foil", graded: false });
  assert.deepEqual(f("English / Foil Normal"), { lang: "en", fin: "foil", graded: false });
  assert.deepEqual(f("Near Mint - Foil"), { lang: null, fin: "foil", graded: false }, "a dash inside a part separates two statements");
  assert.deepEqual(f("Non Foil / Near Mint"), { lang: null, fin: "nonfoil", graded: false });
  assert.deepEqual(f("Italian - Moderately Played"), { lang: "other", fin: null, graded: false });
  assert.deepEqual(f("Lightly Played Signed"), { lang: null, fin: null, graded: true });
  assert.deepEqual(f("Graded - Beckett - 9.5 Gem Mint"), { lang: null, fin: null, graded: true });
  assert.deepEqual(f("Default Title"), { lang: null, fin: null, graded: false });
  assert.deepEqual(f("Near Mint", ["Foil"]), { lang: null, fin: "foil", graded: false }, "option values count as the variant's words");
  assert.deepEqual(f("Near Mint", ["German", "Foil"]), { lang: "other", fin: "foil", graded: false });
});

// ── the variant, its sku, the title, the convention ──
const SYLVAN = "Sylvan Anthem [Modern Horizons 2]";
test("the variant's own words outrank the title; its sku suffix must agree with them", () => {
  // Starting Town: the title ends in 'Normal' (the default printing's label), the Foil variant is Foil
  const town = pin("spellroo", "Starting Town (FIN - 289)");
  assert.deepEqual(town.variants.map((v) => v[0]), ["Near Mint / English / Foil", "Near Mint / English / Normal"]);
  assert.deepEqual(answers(town).map(fmt), ["631607.F.sku", "631607.N.sku"]);
  // Sylvan Anthem, sku and variant swapped (a variant from the same product with the other sku)
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-NF-1"], variantTitle: "Near Mint" }), "239693.N.sku");
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-FO-1"], variantTitle: "Near Mint Foil" }), "239693.F.sku");
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-NF-1"], variantTitle: "Near Mint Foil" }), "miss:finish-conflict", "a variant that says Foil on a -NF sku is not trusted");
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-FO-1"], variantTitle: "Near Mint / Non-Foil" }), "miss:finish-conflict");
  assert.equal(m({ title: "Starting Town (FIN - 289) - FINAL FANTASY - Rare - Normal", skus: ["FIN289Foil"], variantTitle: "Near Mint / English / Normal" }), "miss:finish-conflict");
});

test("the sku suffix decides when the variant is silent; a store with no suffix and no words is not guessed", () => {
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-NF-1"], variantTitle: "Near Mint" }), "239693.N.sku");
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-FO-1"], variantTitle: "Near Mint" }), "239693.F.sku");
  assert.equal(m({ title: "Starting Town (FIN - 289)", skus: ["FIN289Foil"], variantTitle: "Default Title" }), "631607.F.sku", "SET123Foil");
  assert.equal(m({ title: "Starting Town (FIN - 289)", skus: ["FIN289Normal"], variantTitle: "Default Title" }), "631607.N.sku", "SET123Normal");
  assert.equal(m({ title: SYLVAN, skus: [null], variantTitle: "Near Mint" }), "miss:finish-unknown");
});

test("'Traditional Foil' (Wizards' name for a regular foil, as in the Secret Lair Drop Series titles of the corpus) is the Foil finish, not a Traditional Chinese card", () => {
  assert.deepEqual(variantFacts("Near Mint / Traditional Foil", undefined), { lang: null, fin: "foil", graded: false });
  assert.deepEqual(variantFacts("Near Mint", ["Traditional Foil"]), { lang: null, fin: "foil", graded: false });
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-FO-1"], variantTitle: "Near Mint / Traditional Foil" }), "239693.F.sku");
  assert.equal(m({ title: SYLVAN, skus: ["MH2-176-EN-FO-1"], variantTitle: "Traditional Chinese / Near Mint / Foil" }), "miss:language-option", "the language still is one");
});

test("a Foil tag never decides: it is on stores' non-foil products too", () => {
  const input = { title: SYLVAN, skus: [null], variantTitle: "Near Mint" } as const;
  assert.equal(m({ ...input, tags: ["Foil"] }), "miss:finish-unknown", "a Foil tag alone says nothing about this variant");
  assert.equal(m({ ...input, tags: ["Foil", "Normal"], explicitFoil: true }), "239693.N.name-set", "tagged Foil and Normal, an unmarked variant of a store that marks its foils is the Normal one");
  const l = pin("goodgames", SYLVAN);
  assert.ok(l.tags.includes("Foil") && l.tags.includes("Normal"), "the real product carries both tags");
  assert.deepEqual(answers(l).map((a) => ("id" in a ? a.finish : a.miss)), ["N", "N", "N", "N", "N", "F", "F", "F", "F", "F"]);
});

test("an unmarked variant is non-foil only where the store marks every foil, or a sibling variant carries the foil words", () => {
  const base = { title: SYLVAN, skus: [null], variantTitle: "Near Mint" } as const;
  assert.equal(m(base), "miss:finish-unknown");
  assert.equal(m({ ...base, explicitFoil: true }), "239693.N.name-set");
  assert.equal(m({ ...base, siblingTitles: ["Near Mint Foil"] }), "239693.N.name-set", "the sibling that says Foil makes this one the non-foil");
  assert.equal(m({ ...base, siblingTitles: ["Lightly Played"] }), "miss:finish-unknown", "a sibling that says nothing makes nothing");
  assert.equal(m({ ...base, variantTitle: "Near Mint Foil" }), "239693.F.name-set", "the variant's own word needs no convention");
  assert.equal(m({ ...base, variantTitle: "Near Mint / Non-Foil", options: ["Non-Foil"] }), "239693.N.name-set");
  assert.equal(m({ ...base, options: ["Foil"] }), "239693.F.name-set", "option values are the variant's words");
  // a store that marks nothing: Biorhythm at carddynasty is one unmarked variant per product
  const bio = pin("carddynasty", "Biorhythm (231) (9ED)");
  assert.equal(bio.variants.length, 1);
  assert.equal(describe(bio), "biorhythm 9ed#231 N set-number");
  assert.equal(m({ title: bio.title, skus: [bio.variants[0]![3]], variantTitle: bio.variants[0]![0], explicitFoil: false }), "miss:finish-unknown", "the same listing from a store whose convention is not known");
});

test("the title states the finish when the variant does not: a trailing Foil, Non-Foil, a foil pattern", () => {
  const sku = (title: string, variantTitle: string) => m({ title, skus: [], variantTitle });
  assert.equal(sku("Artifact Mutation [INV - 231] - Foil", "Near Mint"), "7423.F.set-number");
  assert.equal(sku("Artifact Mutation [INV - 231] (Non-Foil)", "Near Mint"), "7423.N.set-number");
  assert.equal(sku("Artifact Mutation [INV - 231]", "Near Mint"), "miss:finish-unknown");
  assert.equal(sku("Artifact Mutation [INV - 231] (Non-Foil)", "Near Mint Foil"), "7423.F.set-number", "the variant outranks the title");
  const forest = pin("cherry", "Galaxy Foil Forest No 495");
  assert.deepEqual(forest.variants.map((v) => v[0]), ["Default Title"]);
  assert.equal(describe(forest), "forest unf#495 F set-number", "a Galaxy Foil title with nothing else is the foil");
  assert.equal(m({ title: forest.title, skus: [], variantTitle: "Default Title", explicitFoil: true }), "287152.F.set-number", "a store that marks its foils still has the pattern in the title");
});

// ── etched ──
test("an etched title makes a Foil variant the etched finish; a non-foil variant contradicts it", () => {
  const alloc = "Allosaurus Shepherd (Foil Etched) [Double Masters 2022]";
  const etched = rowById.get(276342)!;
  assert.equal(etched.etched, true);
  assert.equal(m({ title: alloc, skus: ["2X2-457-EN-FO-1"], variantTitle: "Near Mint Foil" }), "276342.F.sku");
  assert.equal(m({ title: alloc, skus: ["2X2-457-EN-FO-1"], variantTitle: "Near Mint" }), "276342.F.sku", "the sku's -FO and the title's Etched");
  assert.equal(m({ title: alloc, skus: ["2X2-457-EN-NF-1"], variantTitle: "Near Mint" }), "miss:finish-conflict");
  // the same sku under a title that does not say Etched: #457 is the etched product only, a plain finish is not what it sells
  assert.equal(m({ title: "Allosaurus Shepherd [Double Masters 2022]", skus: ["2X2-457-EN-FO-1"], variantTitle: "Near Mint Foil" }), "miss:finish-not-offered");
  assert.equal(m({ title: "Allosaurus Shepherd [Double Masters 2022]", skus: ["2X2-457-EN-NF-1"], variantTitle: "Near Mint" }), "miss:finish-not-offered");
  // a store that keys by number and prints the finish in the title
  const nat = pin("cardboardanddie", "Natural Order (JP Alternate Art) (Foil Etched) [STA - 117]");
  assert.equal(describe(nat), "natural order sta#117 F set-number");
  assert.equal(m({ title: nat.title, skus: [nat.variants[0]![3]], variantTitle: "Near Mint / English / Normal" }), "miss:finish-conflict");
});

// ── foil patterns ──
test("a foil pattern is foil by definition: it fixes a variant that says nothing and contradicts a non-foil one", () => {
  const golbez = "Golbez, Crystal Collector (Borderless) (Surge Foil) (540) [Final Fantasy]";
  assert.equal(m({ title: golbez, skus: [], variantTitle: "Foil / Near Mint" }), "634404.F.set-number");
  assert.equal(m({ title: golbez, skus: [], variantTitle: "Non Foil / Near Mint" }), "miss:finish-conflict");
  assert.equal(m({ title: golbez, skus: [], variantTitle: "Near Mint" }), "634404.F.set-number", "no word at all: the pattern says foil");
  const shredder = "Shredder, Shadow Master (Borderless) (Surge Foil) [Teenage Mutant Ninja Turtles Commander]";
  assert.equal(m({ title: shredder, skus: ["TMC-88-EN-FO-1"], variantTitle: "Near Mint Foil" }), "679113.F.sku");
  assert.equal(m({ title: shredder, skus: ["TMC-88-EN-NF-1"], variantTitle: "Near Mint" }), "miss:finish-conflict");
  // the pattern may be in the sku's extra segments
  assert.equal(m({ title: "Blaster Hulk (Extended Art) [Modern Horizons 3 Commander]", skus: ["M3C-55-RIPPLE-EN-FO-1"], variantTitle: "Near Mint Foil" }), "553036.F.sku", "RIPPLE in the sku");
});

// ── two products that sell the foil ──
test("two products that sell the foil and a title that cannot tell them apart are a skip, not a guess", () => {
  assert.equal(m({ title: "Gleaming Splendor (Borderless) [The Hobbit]", skus: ["HOB-275-EN-FO-1"], variantTitle: "Near Mint Foil" }), "miss:ambiguous");
  assert.equal(m({ title: "Gleaming Splendor (Borderless) [The Hobbit]", skus: ["HOB-275-EN-NF-1"], variantTitle: "Near Mint" }), "miss:finish-not-offered");
  assert.equal(m({ title: "Gleaming Splendor (Borderless) [HOB - 239]", skus: [], variantTitle: "Near Mint Foil" }), "709068.F.set-number", "with the number, the title is the plain Borderless product");
  assert.equal(m({ title: "Gleaming Splendor (Borderless) (Surge Foil) [The Hobbit]", skus: [], variantTitle: "Near Mint Foil" }), "709470.F.name-set", "with the pattern, it is the Surge Foil one");
  assert.equal(m({ title: "Godless Shrine [Edge of Eternities]", skus: [], variantTitle: "Near Mint Foil" }), "miss:ambiguous");
  assert.equal(m({ title: "Counterspell (0002) [MEDIA - 2]", skus: [], variantTitle: "Near Mint Foil" }), "miss:ambiguous");
  assert.equal(m({ title: "Command Tower [Media Promos]", skus: [], variantTitle: "Near Mint" }), "miss:finish-unknown");
});

// ── a product that sells a finish, or does not ──
test("the finish must be one the product sells: finish-not-offered, not the other finish", () => {
  const lotus = pin("bardsandcards", "Black Lotus [Beta Edition]");
  assert.equal(rowById.get(8687)!.hasN, false);
  assert.deepEqual(answers(lotus).map(fmt), Array(5).fill("miss:finish-not-offered"));
  assert.equal(describe(pin("bardsandcards", "Black Lotus [Unlimited Edition]")), "black lotus 2ed#233 N sku");
  // a card that has a non-foil only is never offered as a foil
  assert.equal(m({ title: "Black Lotus [Unlimited Edition]", skus: ["2ED-233-EN-FO-1"], variantTitle: "Near Mint Foil" }), "miss:finish-not-offered");
});

// ── a product with two finishes gives two offers ──
test("one product with Normal and Foil variants is two offers, and collapseOffers keeps one row per finish", () => {
  const l = pin("goodgames", SYLVAN);
  const a = answers(l);
  assert.equal(a.length, 10);
  assert.deepEqual([...new Set(a.map((x) => ("id" in x ? x.id : -1)))], [239693], "one product");
  const drafts: OfferDraft[] = a.map((x, i) => {
    assert.ok("id" in x);
    return { productId: x.id, finish: x.finish, priceCents: Math.round(parseFloat(l.variants[i]![1]) * 100), inStock: l.variants[i]![2], condition: conditionLabel(l.variants[i]![0]), path: x.path };
  });
  const out = collapseOffers(drafts);
  assert.equal(out.rows.length, 2);
  assert.equal(out.collapsed, 8);
  const byFinish = Object.fromEntries(out.rows.map((r) => [r.finish, r]));
  assert.deepEqual([byFinish.N!.priceCents, byFinish.N!.condition, byFinish.N!.inStock], [360, "NM", true], "Near Mint non-foil, in stock");
  assert.equal(byFinish.F!.condition, "NM", "the foil row is the best condition, although none of the foil variants is in stock");
  assert.equal(byFinish.F!.priceCents, 430);
});

test("the answer of a variant does not depend on the order of the variants", () => {
  let n = 0;
  for (const l of listings) {
    if (l.variants.length < 2) continue;
    const rev = matchStoreVariants({ title: l.title, tags: l.tags, productType: l.ptype, explicitFoil: l.explicitFoil, variants: [...l.variants].reverse().map((v) => ({ title: v[0], sku: v[3] })) }, ix);
    assert.deepEqual(rev.map(fmt), answers(l).map(fmt).reverse(), l.key);
    n++;
  }
  assert.ok(n > 100, `${n} multi-variant listings`);
});

test("every Foil-or-Non-Foil word in a recorded variant is honoured by its recorded answer", () => {
  let checked = 0;
  for (const l of listings) answers(l).forEach((a, i) => {
    if (!("id" in a) || a.path === "sealed") return;
    const fin = variantFacts(l.variants[i]![0], undefined).fin;
    if (fin === "foil" || fin === "etched") { assert.equal(a.finish, "F", `${l.key} [${l.variants[i]![0]}]`); checked++; }
    if (fin === "nonfoil") { assert.equal(a.finish, "N", `${l.key} [${l.variants[i]![0]}]`); checked++; }
  });
  assert.ok(checked > 300, `${checked} variants with a finish word`);
});

test("the sku suffix of a variant is honoured by its recorded answer (-NF, -FO, -F, -nm-f, Normal, Foil)", () => {
  let checked = 0;
  for (const l of listings) answers(l).forEach((a, i) => {
    if (!("id" in a) || a.path === "sealed") return;
    const sku = l.variants[i]![3] ?? "";
    const foil = /-(?:FO|F)-\d$|-F-[A-Z0-9]{10}-\d$|-nm-f$|-HF-|Foil$/.test(sku) && !/-NF-/.test(sku);
    const non = /-NF-\d$|-nm-nf$|Normal$/.test(sku);
    if (foil) { assert.equal(a.finish, "F", `${l.key} ${sku}`); checked++; }
    if (non) { assert.equal(a.finish, "N", `${l.key} ${sku}`); checked++; }
  });
  assert.ok(checked > 400, `${checked} skus with a finish`);
});
