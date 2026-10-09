// Picking eBay listings (src/lib/ebay-match.ts) with real eBay-style titles, against the real catalogue rows of tests/fixtures/titles/rows.json and sealed.json.
// Prices are the TCGplayer MARKET prices of 2026-10-07: The One Ring (LTR 246) Normal US$116.19 Foil US$139.67, Extended Art 380 US$141.65 / US$355.87, Borderless Poster 748 US$931.66 / US$1,753.06,
// The Hobbit Eternal 44 US$131.48 / US$155.25; Sol Ring (Alpha) has NO market, only a low of US$1,539.99; Lightning Bolt (2X2 117) US$2.16 / US$2.14; Modern Horizons 3 Play Booster Display US$303.93.
// A rule changed here gets a real title here (CLAUDE.md): the matcher is never loosened to raise the match count; an ambiguous listing is skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { MatchRow, SealedRef } from "../src/lib/match";
import {
  CARD_LIMIT, EBAY_FOREIGN_OR_FAKE, EBAY_JUNK, EBAY_NOT_RAW, ebayConditionLabel, cardFilter, cardQuery, identityOfSealed, identityOfSingle, itemDigits, mapItem, nameTarget, nameWords, panelListings, parseGrade,
  pickListing, pruneCheapOutliers, sealedFilter, sealedQuery, screenGraded, screenName, screenSealed, selfMatches, unitKeyOf, type EbayItem, type NameUnit,
} from "../src/lib/ebay-match";

const FIX = path.resolve(__dirname, "fixtures/titles");
const rows = JSON.parse(fs.readFileSync(path.join(FIX, "rows.json"), "utf8")) as MatchRow[];
const sealedRefs = JSON.parse(fs.readFileSync(path.join(FIX, "sealed.json"), "utf8")) as SealedRef[];

const MARKETS: Record<number, [number | null, number | null]> = {
  487805: [11_619, 13_967], 488276: [14_165, 35_587], 517451: [93_166, 175_306], 693049: [13_148, 15_525], 693048: [null, 12_000],     // The One Ring
  1263: [null, null], 488278: [381, null], 276484: [216, 214], 276485: [183, 264],                                                        // Sol Ring (Alpha), Sol Ring (LTC 284), Lightning Bolt
};
function target(name: string) {
  const rs = rows.filter((r) => r.names[0] === name && r.cls === 0);
  const units: NameUnit[] = rs.map((r) => ({ id: r.id, setCode: r.sc, setName: r.setNames[0] ?? null, label: r.label ?? null, hasN: r.hasN, hasF: r.hasF, etched: r.etched, marketN: MARKETS[r.id]?.[0] ?? null, marketF: MARKETS[r.id]?.[1] ?? null }));
  return nameTarget(name, rs, units);
}
const RING = target("the one ring"), SOL = target("sol ring"), BOLT = target("lightning bolt");

const item = (title: string, price: string, o: Partial<EbayItem> = {}): EbayItem => ({
  itemId: "v1|305123456789|0", title, price: { value: price, currency: "USD" }, buyingOptions: ["FIXED_PRICE"], itemLocation: { country: "US" }, condition: "Ungraded", image: { imageUrl: "https://i.ebayimg.com/images/g/ABC/s-l225.jpg" },
  shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }], ...o,
});
let n = 0;
const it = (title: string, price: string, o: Partial<EbayItem> = {}): EbayItem => item(title, price, { itemId: `v1|3051234${String(++n).padStart(5, "0")}|0`, ...o });

test("queries: the front face without commas or parentheses; the strict query keeps the category, the retry names the game", () => {
  assert.equal(nameWords("Fire // Ice"), "Fire");
  assert.equal(nameWords("Erayo, Soratami Ascendant"), "Erayo Soratami Ascendant");
  assert.equal(nameWords("Forest (0205)"), "Forest");
  assert.deepEqual(cardQuery("The One Ring"), { strict: "The One Ring", retry: "MTG The One Ring" });
  assert.equal(nameWords("x ".repeat(80)).length <= 100, true);
  assert.equal(sealedQuery("Modern Horizons 3 - Play Booster Display"), "MTG Modern Horizons 3 - Play Booster Display");
  assert.equal(sealedQuery("Secret Lair Drop: Showcase: Murders at Karlov Manor - Rainbow Foil Edition"), "MTG Secret Lair Showcase: Murders at Karlov Manor - Rainbow Foil Edition");
  assert.equal(CARD_LIMIT, 200);
});
test("filters: fixed price, the delivery country, and a server-side floor from US$300 only (our rates are constants, eBay's are live)", () => {
  assert.equal(cardFilter("US", 216), "buyingOptions:{FIXED_PRICE},deliveryCountry:US", "a US$2.16 printing: no floor");
  assert.equal(cardFilter("US", null), "buyingOptions:{FIXED_PRICE},deliveryCountry:US");
  assert.match(cardFilter("US", 93_166), /price:\[265\.52\.\.\],priceCurrency:USD$/, "0.95 x 0.3 x US$931.66");
  assert.match(cardFilter("UK", 93_166), /deliveryCountry:GB,price:\[\d+\.\d\d\.\.\],priceCurrency:GBP$/);
  assert.match(sealedFilter("AU", 30_393), /conditions:\{NEW\},deliveryCountry:AU,price:\[\d+\.\d\d\.\.\],priceCurrency:AUD$/);
});

test("an item's fields: the legacy id digits, the price, the first shipping option in the same currency, the https image; no URL, no seller", () => {
  const l = mapItem(item("The One Ring LTR 246", "119.99"))!;
  assert.deepEqual([l.itemId, l.priceCents, l.shippingCents, l.currency, l.location, l.condition], ["305123456789", 11_999, 0, "USD", "US", null]);
  assert.equal(mapItem(item("x", "119.99", { image: { imageUrl: "http://i.ebayimg.com/a.jpg" } }))!.imageUrl, null);
  assert.equal(mapItem(item("x", "119.99", { shippingOptions: [{ shippingCost: { value: "5.00", currency: "EUR" } }] }))!.shippingCents, null, "postage in another currency is unknown, not 5.00");
  assert.equal(mapItem(item("x", "0.00")), null);
  assert.equal(mapItem(item("x", "12.00", { itemId: "garbage" })), null);
  assert.equal(itemDigits({ legacyItemId: "123456789012" }), "123456789012");
  assert.equal(itemDigits({ itemId: "v1|123456789012|0" }), "123456789012");
  assert.ok(!("url" in l) && !("seller" in l));
  assert.equal(ebayConditionLabel("Near Mint or Better"), "NM");
  assert.equal(ebayConditionLabel("Lightly Played (Excellent)"), "LP");
  assert.equal(ebayConditionLabel("Moderately Played (Very Good)"), "MP");
  assert.equal(ebayConditionLabel("Heavily Played (Poor)"), "HP");
  assert.equal(ebayConditionLabel("Ungraded"), null, "never guess NM");
});

test("identity: the set, the number or the treatment words place a title on ONE printing and the finish the title states", () => {
  const id = (t: string) => identityOfSingle(t, RING);
  assert.deepEqual(id("The One Ring - Lord of the Rings Tales of Middle-earth LTR 246 NM Mythic Rare MTG"), { id: 487805, finish: "N" });
  assert.deepEqual(id("The One Ring LTR 246 FOIL Lord of the Rings Tales of Middle-earth"), { id: 487805, finish: "F" });
  assert.deepEqual(id("The One Ring Extended Art LTR 380 Lord of the Rings"), { id: 488276, finish: "N" });
  assert.deepEqual(id("MTG The One Ring Borderless Poster LTR 748 Foil Universes Beyond"), { id: 517451, finish: "F" });
  assert.deepEqual(id("The One Ring Borderless Hobbit Eternal HOC 44 Magic"), { id: 693049, finish: "N" });
});
test("skipped, never guessed: no set, a set that fits several printings, a printing we do not track", () => {
  assert.deepEqual(identityOfSingle("The One Ring MTG Magic the Gathering card", RING), { reject: "match:nokey" });
  assert.deepEqual(identityOfSingle("The One Ring Lord of the Rings Tales of Middle-earth Magic", RING), { reject: "match:ambiguous" });
  assert.deepEqual(identityOfSingle("The One Ring Prerelease Promo PLTR 246s", RING), { id: 501274, finish: "F" }, "identity is the printing; whether it has a reference price is the screen's question");
  const tracked = nameTarget("the one ring", rows.filter((r) => r.names[0] === "the one ring"), RING.units.filter((u) => u.id !== 501274));
  assert.deepEqual(identityOfSingle("The One Ring Prerelease Promo PLTR 246s", tracked), { reject: "other-printing" }, "a title that fits a printing outside the target is a miss, not a stretch to the nearest one");
});
test("a finish the printing does not have is a reject, not a guess", () => {
  const sol = target("sol ring");
  assert.deepEqual(identityOfSingle("Sol Ring Commander LTC 284 Tales of Middle-earth Foil", sol), { reject: "match:finish-not-offered" });
  assert.deepEqual(identityOfSingle("Sol Ring Commander LTC 284 Tales of Middle-earth", sol), { id: 488278, finish: "N" });
});

test("eBay-only words: lots, fakes, other languages, damage, graded wording (each with the title that taught it)", () => {
  for (const t of ["4x The One Ring LTR 246 NM", "The One Ring LTR 246 Playset", "The One Ring LTR 246 lot of 3", "The One Ring + Sol Ring bundle"]) assert.ok(EBAY_JUNK.test(t) || EBAY_NOT_RAW.test(t), t);
  for (const t of ["The One Ring LTR 246 Proxy Custom Art", "The One Ring LTR 246 Japanese", "The One Ring Orica Alter Fan Art", "The One Ring replica metal card", "The One Ring LTR 246 German"]) assert.ok(EBAY_FOREIGN_OR_FAKE.test(t), t);
  for (const t of ["The One Ring LTR 246 HP creased", "The One Ring LTR 246 PSA10", "The One Ring LTR 246 signed by the artist", "The One Ring LTR 246 misprint"]) assert.ok(EBAY_NOT_RAW.test(t), t);
  for (const t of ["The One Ring LTR 246 NM", "The One Ring Lord of the Rings 246/281 Mythic", "The One Ring LTR Foil Extended Art"]) {
    assert.ok(!EBAY_JUNK.test(t) && !EBAY_FOREIGN_OR_FAKE.test(t) && !EBAY_NOT_RAW.test(t), t);
  }
  // a word the card's OWN name or set carries is allowed: "Alter Reality", "Custom"
  assert.equal(identityOfSingle("Alter Reality Magic card", target("sol ring")).hasOwnProperty("reject"), true);
  assert.deepEqual(identityOfSingle("Sol Ring Proxy LTC 284", SOL), { reject: "foreign-or-fake" });
  assert.deepEqual(identityOfSingle("Sol Ring LTC 284 booster pack sealed", SOL), { reject: "sealed-word" });
});

test("the screen: every reject has a reason, the survivors are grouped by unit and sorted cheapest delivered first", () => {
  const items: EbayItem[] = [
    it("The One Ring - Lord of the Rings Tales of Middle-earth LTR 246 NM", "129.99"),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth near mint", "119.50", { shippingOptions: [{ shippingCost: { value: "4.99", currency: "USD" } }] }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth NM FOIL", "154.00"),
    it("The One Ring Extended Art LTR 380 Lord of the Rings", "162.00"),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "9.99"),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "120.00", { buyingOptions: ["AUCTION"] }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "120.00", { itemLocation: { country: "CN" } }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "120.00", { price: { value: "120.00", currency: "GBP" } }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "120.00", { condition: "Heavily Played (Poor)" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth PSA 10", "700.00", { conditionId: "2750", condition: "Graded" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth", "118.00", { shippingOptions: [{ shippingCost: { value: "250.00", currency: "USD" } }] }),
    it("The One Ring MTG", "120.00"),
    it("The One Ring Prerelease PLTR 246s", "120.00"),
    { ...it("The One Ring LTR 246 Lord of the Rings", "120.00"), price: undefined },
  ];
  const r = screenName(items, RING, "US");
  assert.deepEqual([...r.byUnit.keys()].sort(), [unitKeyOf(487805, "F"), unitKeyOf(487805, "N"), unitKeyOf(488276, "N")].sort());
  assert.deepEqual(r.byUnit.get(unitKeyOf(487805, "N"))!.map((l) => l.priceCents), [11_950, 12_999], "US$119.50 + US$4.99 postage (124.49 delivered) beats US$129.99 with free postage");
  assert.deepEqual(r.rejects, { "implausible-price": 1, "not-fixed-price": 1, location: 1, currency: 1, condition: 1, graded: 1, postage: 1, "match:nokey": 1, "no-reference": 1, "no-price": 1 });
});

test("the pick is the cheapest delivered after the outlier prune; a banned item (claimed elsewhere) is skipped", () => {
  const l = (itemId: string, priceCents: number, ship: number | null = 0) => ({ itemId, title: "t", priceCents, currency: "USD", shippingCents: ship, condition: null, location: "US", imageUrl: null, endsAt: null });
  const list = [l("1", 900), l("2", 11_900), l("3", 12_000), l("4", 12_400), l("5", 13_000)];
  assert.deepEqual(pruneCheapOutliers(list).map((x) => x.itemId), ["2", "3", "4", "5"], "US$9 against a US$120 median is a bait price");
  assert.equal(pickListing(list)!.itemId, "2");
  assert.equal(pickListing(list, new Set(["2"]))!.itemId, "3");
  assert.equal(pickListing([]), null);
  assert.deepEqual(pruneCheapOutliers(list.slice(0, 3)).map((x) => x.itemId), ["1", "2", "3"], "under four listings nothing is pruned");
});
test("the panel: the headline pick of each finish first, the rest by price, at most eight", () => {
  const l = (itemId: string, priceCents: number) => ({ itemId, title: "t", priceCents, currency: "USD", shippingCents: 0, condition: null, location: "US", imageUrl: null, endsAt: null });
  const N = [l("n1", 12_000), l("n2", 12_500), l("n3", 13_000)], F = [l("f1", 15_000), l("f2", 15_500)];
  const rows9 = panelListings({ N, F }, { N: N[0]!, F: F[0]! });
  assert.deepEqual(rows9.map((r) => `${r.finish}:${r.l.itemId}`), ["N:n1", "F:f1", "N:n2", "N:n3", "F:f2"]);
  assert.equal(panelListings({ N: Array.from({ length: 12 }, (_, i) => l(`x${i}`, 12_000 + i)) }, {}).length, 8);
  assert.deepEqual(panelListings({ N }, { N: N[1]! }, new Set(["n3"])).map((r) => r.l.itemId), ["n2", "n1"], "the given pick first, then the others, minus the banned item");
});

test("slabs: the grader before the grade, best grade first, never below half the raw reference, never a raw listing", () => {
  assert.deepEqual(parseGrade("The One Ring LTR 246 PSA 10 GEM MINT"), { grader: "PSA", grade: 10 });
  assert.deepEqual(parseGrade("BGS 9.5 The One Ring"), { grader: "BGS", grade: 9.5 });
  assert.deepEqual(parseGrade("The One Ring CGC-9"), { grader: "CGC", grade: 9 });
  assert.deepEqual(parseGrade("1 of 10 PSA graded, see photos"), { grader: "PSA", grade: null });
  assert.deepEqual(parseGrade("The One Ring LTR 246 NM"), { grader: null, grade: null });
  const items = [
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth PSA 9 MINT", "240.00", { conditionId: "2750", condition: "Graded" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth PSA 10 GEM MINT", "399.00", { conditionId: "2750", condition: "Graded" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth BGS 9.5", "310.00", { conditionId: "2750", condition: "Graded" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth PSA 8", "40.00", { conditionId: "2750", condition: "Graded" }),
    it("The One Ring LTR 246 Lord of the Rings Tales of Middle-earth NM", "119.00"),
    it("The One Ring Lord of the Rings Tales of Middle-earth PSA 10", "399.00", { conditionId: "2750", condition: "Graded" }),
  ];
  const g = screenGraded(items, RING, "US").get(487805)!;
  assert.deepEqual(g.map((x) => [x.grader, x.grade, x.priceCents]), [["PSA", "10", 39_900], ["BGS", "9.5", 31_000], ["PSA", "9", 24_000]], "US$40 for a PSA 8 is under half the raw reference; the title with no set is ambiguous");
  assert.ok(g.every((x) => x.finish === "N" && x.productId === 487805));
  assert.equal(screenName(items, RING, "US").byUnit.size, 1, "the raw search sees only the raw copy");
});

test("sealed: the product, the market's currency, new and fixed price, plausible against the product's market; a pack is not a box", () => {
  const MH3_BOX = 541_164;
  const t = { kind: "sealed" as const, id: MH3_BOX, name: "Modern Horizons 3 - Play Booster Display", marketCents: 30_393, refs: sealedRefs };
  assert.deepEqual(identityOfSealed("Magic The Gathering Modern Horizons 3 Play Booster Box Factory Sealed", t), { id: MH3_BOX });
  assert.deepEqual(identityOfSealed("Modern Horizons 3 Play Booster Pack", t), { reject: "other-product" }, "a pack is another product, found by name and kind");
  assert.deepEqual(identityOfSealed("Modern Horizons 3 Collector Booster Box", t), { reject: "other-product" });
  assert.deepEqual(identityOfSealed("Modern Horizons 3 Play Booster Box x4 lot", t), { reject: "junk" });
  const items = [
    it("MTG Modern Horizons 3 Play Booster Box Factory Sealed", "319.99"),
    it("Magic The Gathering Modern Horizons 3 Play Booster Box SEALED", "289.00", { shippingOptions: [{ shippingCost: { value: "12.00", currency: "USD" } }] }),
    it("MTG Modern Horizons 3 Play Booster Box", "99.00"),
    it("Modern Horizons 3 Play Booster Box Chinese", "250.00"),
    it("Modern Horizons 3 Collector Booster Box", "899.00"),
  ];
  const r = screenSealed(items, t, "US");
  assert.deepEqual(r.survivors.map((x) => x.priceCents), [28_900, 31_999]);
  assert.deepEqual(r.rejects, { "implausible-price": 1, "foreign-or-fake": 1, "other-product": 1 });
  assert.deepEqual(screenSealed(items, { ...t, marketCents: null }, "US").survivors, [], "no reference price: nothing is trusted");
});

test("a name none of whose printings can match its own canonical title is never searched", () => {
  assert.equal(selfMatches(RING), true);
  assert.equal(selfMatches(BOLT), true);
  assert.equal(selfMatches(nameTarget("the one ring", [], [])), false);
});
