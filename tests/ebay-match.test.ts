// The eBay listing picker (src/lib/ebay-match.ts): OP Compare's matcher run
// against the FULL index, plus the eBay-only filters. Titles are eBay-style
// titles in the shapes One Piece sellers use (replace with titles captured on
// the first smoke run as they come in; keep every rule covered).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, type SealedRef } from "../src/lib/match";
import {
  EBAY_JUNK,
  NUMBER_RANGE_OP,
  canonicalTitle,
  selfMatches,
  REJECT_LOCATIONS,
  cardFilter,
  cardQuery,
  chooseListing,
  ebayConditionLabel,
  mapItem,
  panelListings,
  parseGrade,
  isGradedListing,
  screenGraded,
  priceFilter,
  pruneCheapOutliers,
  queryWord,
  sealedFilter,
  sealedQuery,
  type ChooseTarget,
  type EbayItem,
  type EbayListing,
} from "../src/lib/ebay-match";

// A slice of the real catalogue (ids are fixtures; variants and sets as TCGplayer has them).
const CARDS = [
  { id: 1, name: "Shanks", number: "OP01-120", variant: null, setCode: "OP01", setName: "Romance Dawn", marketUsd: 785 },
  { id: 2, name: "Shanks", number: "OP01-120", variant: "Parallel", setCode: "OP01", setName: "Romance Dawn", marketUsd: 8025 },
  { id: 3, name: "Shanks", number: "OP01-120", variant: "Parallel · Manga · Alternate Art", setCode: "OP01", setName: "Romance Dawn", marketUsd: 399874 },
  { id: 4, name: "Shanks", number: "OP01-120", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 2912 },
  { id: 5, name: "Shanks", number: "OP01-120", variant: "Reprint", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 289 },
  { id: 6, name: "Shanks", number: "OP01-120", variant: "Manga", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 125000 },
  { id: 30, name: "Portgas.D.Ace", number: "OP13-119", variant: "Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will", marketUsd: 60000 },
  { id: 31, name: "Portgas.D.Ace", number: "OP13-119", variant: "Red Super Alternate Art", setCode: "OP13", setName: "Carrying On His Will", marketUsd: 150000 },
  { id: 50, name: "Gecko Moria", number: "ST03-004", variant: "SP", setCode: "OP08", setName: "Two Legends", marketUsd: 9000 },
  { id: 51, name: "Gecko Moria", number: "ST03-004", variant: null, setCode: "ST-03", setName: "Starter Deck 3: The Seven Warlords of the Sea", marketUsd: 25 },
  { id: 60, name: "Nami", number: "OP01-016", variant: null, setCode: "OP01", setName: "Romance Dawn", marketUsd: 300 },
  { id: 61, name: "Nami", number: "OP01-016", variant: "Box Topper", setCode: "OP01", setName: "Romance Dawn", marketUsd: 4000 },
  { id: 62, name: "Nami", number: "OP01-016", variant: "Parallel", setCode: "OP01", setName: "Romance Dawn", marketUsd: 6000 },
  { id: 71, name: "Monkey.D.Luffy", number: "P-001", variant: "Judge Pack Vol. 2", setCode: "OP-PR", setName: "One Piece Promotion Cards", marketUsd: 3000 },
  { id: 70, name: "Monkey.D.Luffy", number: "P-001", variant: null, setCode: "OP-DD", setName: "One Piece Demo Deck Cards", marketUsd: 2232 },
  { id: 80, name: "Roronoa Zoro", number: "OP01-001", variant: null, setCode: "OP01", setName: "Romance Dawn", marketUsd: 2500 },
  // Original-set printings with a same-tag Premium Booster twin (market prices as of 2026-10-03).
  { id: 90, name: "Trafalgar Law", number: "OP05-069", variant: "Alternate Art · Manga", setCode: "OP05", setName: "Awakening of the New Era", marketUsd: 170058 },
  { id: 91, name: "Trafalgar Law", number: "OP05-069", variant: "Manga", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 106666 },
  { id: 92, name: "Yamato", number: "OP01-121", variant: "Parallel", setCode: "OP01", setName: "Romance Dawn", marketUsd: 13370 },
  { id: 93, name: "Yamato", number: "OP01-121", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 4156 },
  { id: 94, name: "Boa Hancock", number: "OP01-078", variant: "Parallel", setCode: "OP01", setName: "Romance Dawn", marketUsd: 14747 },
  { id: 95, name: "Boa Hancock", number: "OP01-078", variant: "Alternate Art", setCode: "PRB-01", setName: "Premium Booster -The Best-", marketUsd: 5480 },
  { id: 96, name: "Monkey.D.Luffy", number: "OP05-119", variant: "Wanted Poster", setCode: "OP13", setName: "Carrying On His Will", marketUsd: 65063 },
  { id: 97, name: "Monkey.D.Luffy", number: "OP05-119", variant: null, setCode: "OP05", setName: "Awakening of the New Era", marketUsd: 1800 },
  { id: 98, name: "Nico Robin", number: "OP18-031", variant: "Manga", setCode: "OP18", setName: "The Dominance of God", marketUsd: null },
  { id: 99, name: "Sabo", number: "OP13-120", variant: "Parallel", setCode: "OP13", setName: "Carrying On His Will", marketUsd: 1376 },
  { id: 100, name: "Sabo", number: "OP13-120", variant: null, setCode: "OP13", setName: "Carrying On His Will", marketUsd: 900 },
];
const idx = buildCardIndex(CARDS);
const single = (id: number, refUsd: number | null = null): ChooseTarget => {
  const c = CARDS.find((x) => x.id === id)!;
  return { kind: "single", id, name: c.name, variant: c.variant, setName: c.setName, marketUsd: c.marketUsd, refUsd, idx };
};

let n = 0;
const item = (title: string, value: string, o: Partial<EbayItem> & { ship?: string | null; cur?: string } = {}): EbayItem => ({
  conditionId: o.conditionId,
  itemId: `v1|${++n}|0`,
  title,
  price: { value, currency: o.cur ?? "USD" },
  buyingOptions: o.buyingOptions ?? ["FIXED_PRICE"],
  itemLocation: o.itemLocation ?? { country: "US" },
  shippingOptions: o.ship === null ? undefined : [{ shippingCost: { value: o.ship ?? "0.00", currency: o.cur ?? "USD" } }],
  itemWebUrl: `https://www.ebay.com/itm/${n}`,
  itemAffiliateWebUrl: o.itemAffiliateWebUrl,
  condition: o.condition ?? "Ungraded",
});
const pick = (items: EbayItem[], id: number, market: "US" | "UK" = "US") => chooseListing(items, single(id), market);
const pickedTitle = (items: EbayItem[], id: number) => pick(items, id).listing?.title ?? null;

test("the base OP01-120 never takes the Parallel, and the Parallel never takes the base", () => {
  const base = "One Piece Card Game Shanks OP01-120 SEC Romance Dawn English NM";
  const par = "Shanks OP01-120 Parallel Alt Art SEC Romance Dawn One Piece TCG English";
  assert.equal(pickedTitle([item(par, "75.00"), item(base, "7.50")], 1), base);
  assert.equal(pickedTitle([item(base, "7.50"), item(par, "75.00")], 2), par);
  assert.equal(pickedTitle([item(par, "75.00")], 1), null);
  assert.equal(pickedTitle([item(base, "7.50")], 2), null);
});

test("a Manga matches only its own printing (OP01 vs the Premium Booster)", () => {
  const op01 = "One Piece TCG Shanks OP01-120 Manga Rare Romance Dawn English";
  const prb = "Shanks OP01-120 Manga PRB-01 Premium Booster The Best One Piece";
  assert.equal(pickedTitle([item(op01, "3900.00"), item(prb, "1200.00")], 3), op01);
  assert.equal(pickedTitle([item(op01, "3900.00"), item(prb, "1200.00")], 6), prb);
  assert.equal(pickedTitle([item(op01, "3900.00")], 2), null);
});

test("an SP and a red SAA each match only their own printing", () => {
  const sp = "Gecko Moria ST03-004 SP Special Card Two Legends OP08 One Piece English";
  assert.equal(pickedTitle([item(sp, "88.00")], 50), sp);
  assert.equal(pickedTitle([item(sp, "88.00")], 51), null);
  const red = "Portgas.D.Ace OP13-119 Red Super Alternate Art Carrying On His Will English";
  const saa = "Portgas.D.Ace OP13-119 SAA Super Alternate Art OP13 English NM";
  assert.equal(pickedTitle([item(saa, "590.00"), item(red, "1450.00")], 31), red);
  assert.equal(pickedTitle([item(saa, "590.00"), item(red, "1450.00")], 30), saa);
});

test("rejects: foreign titles, Asian seller locations, lots, graded, proxies, junk, ranges", () => {
  const base = "Shanks OP01-120 SEC Romance Dawn English NM";
  const rej = (it: EbayItem, id = 1) => {
    const r = pick([it], id);
    assert.equal(r.listing, null, it.title);
    return Object.keys(r.rejects)[0];
  };
  assert.equal(rej(item("Shanks OP01-120 Japanese Romance Dawn", "8.00")), "match:foreign");
  for (const c of ["JP", "CN", "HK", "TW", "KR"]) assert.equal(rej(item(base, "8.00", { itemLocation: { country: c } })), "location", c);
  assert.ok(REJECT_LOCATIONS.has("JP") && REJECT_LOCATIONS.size === 5);
  assert.equal(rej(item("Shanks OP01-120 lot of 4 Romance Dawn", "30.00")), "not-raw");
  assert.equal(rej(item("Shanks OP01-120 Playset Romance Dawn", "30.00")), "match:not-single");
  assert.equal(rej(item("Shanks OP01-120 Proxy Romance Dawn", "3.00")), "match:not-single");
  assert.equal(rej(item("PSA 10 Shanks OP01-120 Romance Dawn", "80.00")), "not-raw");
  assert.equal(rej(item("One Piece OP01-120 Shanks bundle with sleeves", "9.00")), "junk");
  assert.equal(rej(item("Pick your card OP01-120 Shanks Romance Dawn", "8.00")), "junk");
  // matchCardTitle alone would take this for OP01-001 (the "010" is not a full number).
  assert.equal(rej(item("OP01-001 - 010 Romance Dawn Zoro Leader", "25.00"), 80), "number-range");
  assert.ok(EBAY_JUNK.test("One Piece 50 cards"));
});

test("booster/box words reject a single unless its own printing or set says them", () => {
  assert.equal(pickedTitle([item("Nami OP01-016 Romance Dawn Booster Box Pull NM", "3.00")], 60), null);
  const topper = "Nami OP01-016 Box Topper Romance Dawn One Piece English";
  assert.equal(pickedTitle([item(topper, "40.00")], 61), topper);
  const judge = "Monkey.D.Luffy P-001 Judge Pack Vol 2 Promo One Piece English";
  assert.equal(pickedTitle([item(judge, "30.00")], 71), judge);
  const prb = "Shanks OP01-120 Alternate Art PRB-01 Premium Booster The Best English";
  assert.equal(pickedTitle([item(prb, "29.00")], 4), prb);
});

test("a currency mismatch and a non-fixed-price item are rejected", () => {
  const base = "Shanks OP01-120 SEC Romance Dawn English NM";
  assert.deepEqual(pick([item(base, "6.00", { cur: "USD" })], 1, "UK").rejects, { currency: 1 });
  assert.ok(pick([item(base, "6.00", { cur: "GBP" })], 1, "UK").listing);
  assert.deepEqual(pick([item(base, "6.00", { buyingOptions: ["AUCTION"] })], 1).rejects, { "not-fixed-price": 1 });
});

test("plausibility: under 0.3× and over 4× + US$5 are rejected", () => {
  const t = "Shanks OP01-120 Parallel Alt Art Romance Dawn English"; // market 80.25
  assert.equal(pickedTitle([item(t, (8025 * 0.29 / 100).toFixed(2))], 2), null);
  assert.equal(pickedTitle([item(t, ((8025 * 4 + 600) / 100).toFixed(2))], 2), null);
  assert.equal(pickedTitle([item(t, "60.00")], 2), t);
});

// ── Review fixes (2026-10-03): real eBay titles, each pinned ─────────────────

test("sibling sets: a title that doesn't name the set never takes a printing with a same-tag twin elsewhere", () => {
  const rej = (title: string, value: string, id: number) => {
    const r = pick([item(title, value)], id);
    assert.equal(r.listing, null, title);
    assert.deepEqual(r.rejects, { "sibling-set": 1 }, title);
  };
  // Each was ACCEPTED for the expensive original-set printing at the reprint's price.
  rej("Shanks OP01-120 SEC Manga Rare One Piece English", "1300.00", 3);
  rej("Trafalgar Law OP05-069 Manga Rare SR", "1100.00", 90);
  rej("Shanks OP01-120 SEC Alt Art One Piece", "30.00", 2);
  rej("Yamato OP01-121 SEC Alt Art", "45.00", 92);
  rej("Boa Hancock OP01-078 SR Alternate Art", "55.00", 94);
  // Naming the set (by name or by code) still matches either printing.
  for (const [title, value, id] of [
    ["Trafalgar Law OP05-069 Manga Rare SR Awakening of the New Era", "1650.00", 90],
    ["Trafalgar Law OP05-069 Manga PRB-01 One Piece", "1050.00", 91],
    ["Yamato OP01-121 SEC Parallel OP-01 Romance Dawn", "130.00", 92],
    ["Yamato OP01-121 Alt Art PRB01 Premium Booster The Best", "41.00", 93],
  ] as const)
    assert.equal(pickedTitle([item(title, value)], id), title);
});

test("foreign and fake wording eBay sellers use (eBay-only, match.ts unchanged)", () => {
  const base = (title: string, value = "4.00", o: Parameters<typeof item>[2] = {}) => {
    const r = pick([item(title, value, o)], 1, o.cur === "EUR" ? ("EU" as "US") : "US");
    assert.equal(r.listing, null, title);
    return Object.keys(r.rejects)[0];
  };
  for (const t of [
    "Shanks OP01-120 SEC One Piece Japan",
    "Shanks OP01-120 SEC One Piece China Exclusive",
    "Shanks OP01-120 SEC One Piece Korea",
    "Shanks OP01-120 SEC Thai",
    "Shanks OP01-120 SEC Version Française One Piece",
    "Shanks OP01-120 SEC One Piece Orica",
    "Shanks OP01-120 SEC One Piece Fan Art Holo",
    "Shanks OP01-120 SEC One Piece Reproduction",
    "Shanks OP01-120 One Piece Metal Card",
    "Shanks OP01-120 One Piece Unofficial",
  ])
    assert.equal(base(t), "foreign-or-fake", t);
  for (const t of ["Carte One Piece Shanks OP01-120 SEC VF", "Carte One Piece Shanks OP01-120 SEC FR"])
    assert.equal(base(t, "6.50", { cur: "EUR", itemLocation: { country: "FR" } }), "foreign-or-fake", t);
  // Still a match: plain English titles, and a Japanese-set name word is not "Japan".
  assert.equal(pickedTitle([item("Shanks OP01-120 SEC Romance Dawn One Piece TCG English NM", "6.50")], 1), "Shanks OP01-120 SEC Romance Dawn One Piece TCG English NM");
});

test("not a raw single: slabs, lots, variation listings, damaged, signed, misprints, eBay's Graded condition", () => {
  for (const [t, v] of [
    ["Shanks OP01-120 SEC One Piece PSA10", "30.00"],
    ["Shanks OP01-120 SEC One Piece BGS9.5", "25.00"],
    ["Shanks OP01-120 SEC One Piece ARS 10", "25.00"],
    ["Shanks OP01-120 SEC One Piece ACE 10", "25.00"],
    ["Shanks OP01-120 SEC Lot", "20.00"],
    ["Shanks OP01-120 SEC x10", "20.00"],
    ["Shanks OP01-120 SEC 3 copies", "20.00"],
    ["Shanks OP01-120 SEC Qty 2", "15.00"],
    ["Shanks OP01-120 SEC U Pick", "6.00"],
    ["Shanks OP01-120 SEC - Choose Version Base/Parallel", "6.00"],
    ["Shanks OP01-120 SEC Damaged", "4.00"],
    ["Shanks OP01-120 SEC Heavily Played", "3.00"],
    ["Shanks OP01-120 SEC Creased", "3.00"],
    ["Shanks OP01-120 SEC Signed autograph", "30.00"],
    ["Shanks OP01-120 SEC Error Misprint", "6.50"],
  ]) {
    const r = pick([item(t, v)], 1);
    assert.equal(r.listing, null, t);
    assert.deepEqual(r.rejects, { "not-raw": 1 }, t);
  }
  const slab = pick([item("Shanks OP01-120 SEC Romance Dawn One Piece", "30.00", { condition: "Graded", conditionId: "2750" })], 1);
  assert.deepEqual(slab.rejects, { graded: 1 });
  // "Ace" the character is not an ACE grade.
  assert.equal(pickedTitle([item("Portgas.D.Ace OP13-119 SAA Super Alternate Art OP13 English NM", "590.00")], 30), "Portgas.D.Ace OP13-119 SAA Super Alternate Art OP13 English NM");
});

test("a word the product's own printing carries is allowed: the Wanted Poster matches itself", () => {
  const t = "Monkey D Luffy OP05-119 Wanted Poster SEC Emperors in the New World";
  assert.equal(pickedTitle([item(t, "600.00")], 96), t);
  // …and "poster" still rejects the plain card.
  assert.equal(pick([item("Monkey D Luffy OP05-119 SEC Awakening of the New Era poster", "18.00")], 97).rejects.junk, 1);
});

test("selfMatches: the canonical title of each printing matches it, except ones no listing can reach", () => {
  const c = (id: number) => {
    const x = CARDS.find((y) => y.id === id)!;
    return { id, name: x.name, number: x.number, variant: x.variant, setName: x.setName, setCode: x.setCode };
  };
  for (const id of [1, 2, 3, 4, 6, 30, 31, 50, 90, 91, 92, 93, 96]) assert.ok(selfMatches(c(id), idx), canonicalTitle(c(id)));
  const jp = buildCardIndex([{ id: 1, name: "Sabo", number: "OP07-118", variant: "Japanese Version 3rd Anniversary Set", setCode: "OP-PR", setName: "One Piece Promotion Cards" }]);
  assert.equal(selfMatches({ id: 1, name: "Sabo", number: "OP07-118", variant: "Japanese Version 3rd Anniversary Set", setName: "One Piece Promotion Cards", setCode: "OP-PR" }, jp), false);
  const twins = buildCardIndex([
    { id: 1, name: "St. Marcus Mars", number: "OP13-091", variant: "Parallel", setCode: "OP13", setName: "Carrying On His Will" },
    { id: 2, name: "St. Marcus Mars", number: "OP13-091", variant: "Alternate Art", setCode: "OP13", setName: "Carrying On His Will" },
  ]);
  assert.equal(selfMatches({ id: 1, name: "St. Marcus Mars", number: "OP13-091", variant: "Parallel", setName: "Carrying On His Will", setCode: "OP13" }, twins), false);
});

test("unpriced products: no reference → nothing; a store reference → its floor, 3+ survivors, no cheap head", () => {
  const robin = "Nico Robin OP18-031 Manga Rare SEC The Dominance of God One Piece";
  // No market price and no store reference: never trusted.
  assert.deepEqual(chooseListing([item(robin, "300.00")], single(98), "US").rejects, { "no-reference": 1 });
  // A store reference of US$400: the 0.3× floor applies, and one listing is not enough.
  assert.equal(chooseListing([item(robin, "380.00")], single(98, 40000), "US").listing, null);
  assert.equal(chooseListing([item(robin, "100.00"), item(robin, "380.00"), item(robin, "390.00")], single(98, 40000), "US").listing, null);
  const ok = chooseListing([item(robin, "360.00"), item(robin, "380.00"), item(robin, "390.00")], single(98, 40000), "US");
  assert.equal(ok.listing?.priceCents, 36000);
  // A head under half the survivors' median is dropped (and then too few remain).
  const head = chooseListing([item(robin, "150.00"), item(robin, "380.00"), item(robin, "390.00"), item(robin, "400.00")], single(98, 40000), "US");
  assert.equal(head.listing?.priceCents, 38000);
  // Orica at US$3: the title rejects it before price is even read.
  assert.deepEqual(chooseListing([item("Nico Robin OP18-031 Manga Alt Art One Piece Orica", "3.00")], single(98, 40000), "US").rejects, { "foreign-or-fake": 1 });
  // The server-side floor uses the reference too.
  assert.equal(cardFilter("US", 40000), "buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[114.00..],priceCurrency:USD");
});

test("postage: a cheap item with dear postage is rejected; the delivered price must be plausible", () => {
  // OP13-120 Sabo Parallel, market US$13.76: $4.50 + $25.00 postage would have been "Cheapest" at $4.50.
  const bait = item("Sabo OP13-120 Parallel SEC Carrying On His Will", "4.50", { ship: "25.00" });
  assert.deepEqual(pick([bait], 99).rejects, { postage: 1 });
  const fair = item("Sabo OP13-120 Parallel SEC Carrying On His Will NM", "9.00", { ship: "4.00" });
  assert.equal(pick([bait, fair], 99).listing?.itemId, fair.itemId);
  // Postage within max(item, US$15) and a plausible delivered price passes.
  assert.equal(pick([item("Roronoa Zoro OP01-001 Leader Romance Dawn English", "20.00", { ship: "12.00" })], 80).listing?.priceCents, 2000);
});

test("ties on delivered price prefer known postage; a range needs a number after the dash, not '100%'", () => {
  const unknown = item("Sabo OP13-120 Parallel SEC A", "10.00", { ship: null });
  const free = item("Sabo OP13-120 Parallel SEC B", "10.00", { ship: "0.00" });
  assert.equal(pick([unknown, free], 99).listing?.itemId, free.itemId);
  assert.equal(pick([free, unknown], 99).listing?.itemId, free.itemId);
  assert.ok(NUMBER_RANGE_OP.test("OP01-001 - 010 Romance Dawn Zoro Leader"));
  assert.ok(NUMBER_RANGE_OP.test("OP01-001 to OP01-010"));
  assert.ok(!NUMBER_RANGE_OP.test("Shanks OP01-120 - 100% Authentic Romance Dawn"));
  assert.equal(pickedTitle([item("Shanks OP01-120 - 100% Authentic Romance Dawn", "7.00")], 1), "Shanks OP01-120 - 100% Authentic Romance Dawn");
});

test("chooseListing picks the cheapest DELIVERED listing", () => {
  const z = "Roronoa Zoro OP01-001 Leader Romance Dawn English";
  const cheapItem = item(z, "8.00", { ship: "20.00" });
  const free = item(`${z} NM`, "12.00", { ship: "0.00" });
  assert.equal(pick([cheapItem, free], 80).listing?.itemId, free.itemId);
  // Unknown postage sorts as 0 but is stored as null.
  const unknown = item(`${z} LP`, "11.00", { ship: null });
  const r = pick([cheapItem, free, unknown], 80).listing!;
  assert.equal(r.itemId, unknown.itemId);
  assert.equal(r.shippingCents, null);
});

const L = (cents: number, i: number): EbayListing => ({ itemId: String(i), title: "", priceCents: cents, currency: "USD", shippingCents: 0, url: "", condition: null, location: "US", imageUrl: null });
test("pruneCheapOutliers drops a 0.3×-median head only with 4+ listings", () => {
  assert.equal(pruneCheapOutliers([L(300, 1), L(1000, 2), L(1000, 3), L(1100, 4)])[0].itemId, "2");
  assert.equal(pruneCheapOutliers([L(300, 1), L(1000, 2), L(1100, 3)])[0].itemId, "1");
  assert.equal(pruneCheapOutliers([L(100, 1), L(300, 2), L(300, 3), L(400, 4)])[0].itemId, "1"); // median < 500
});

test("ebayConditionLabel never guesses NM", () => {
  assert.equal(ebayConditionLabel("Ungraded"), null);
  assert.equal(ebayConditionLabel("Used"), null);
  assert.equal(ebayConditionLabel("Near mint or better"), "NM");
  assert.equal(ebayConditionLabel("Excellent"), "LP");
  assert.equal(ebayConditionLabel("Very Good"), "MP");
  assert.equal(ebayConditionLabel("Poor"), "HP");
  assert.equal(ebayConditionLabel("New"), "NM");
  assert.equal(ebayConditionLabel(null), null);
});

test("queries: one name word, no variant words, P- numbers keep One Piece and get no retry", () => {
  assert.equal(queryWord("Monkey.D.Luffy"), "Luffy");
  assert.equal(queryWord("Trafalgar Law"), "Trafalgar");
  assert.equal(queryWord("Shanks"), "Shanks");
  assert.equal(queryWord("Ace"), null);
  assert.deepEqual(cardQuery({ number: "OP01-120", name: "Shanks" }), { strict: "One Piece OP01-120 Shanks", retry: "OP01-120 Shanks" });
  assert.deepEqual(cardQuery({ number: "P-001", name: "Monkey.D.Luffy" }), { strict: "One Piece P-001 Luffy", retry: null });
  for (const c of CARDS) {
    const q = cardQuery(c);
    assert.doesNotMatch(`${q.strict} ${q.retry ?? ""}`, /parallel|manga|alternate|judge|pack|sp\b|rare|romance|booster/i);
  }
  assert.equal(sealedQuery("Romance Dawn Booster Box"), "One Piece Romance Dawn Booster Box");
});

test("filters: delivery country, price floor in the market currency with 5% FX slack", () => {
  assert.match(priceFilter(1234 / 0.79, "GBP"), /^price:\[12\.3[34]\.\.\],priceCurrency:GBP$/);
  assert.equal(cardFilter("US", 250), "buyingOptions:{FIXED_PRICE},deliveryCountry:US");
  assert.equal(cardFilter("EU", 10000), "buyingOptions:{FIXED_PRICE},deliveryCountry:ES,price:[26.22..],priceCurrency:EUR");
  assert.equal(cardFilter("UK", 10000), "buyingOptions:{FIXED_PRICE},deliveryCountry:GB,price:[22.52..],priceCurrency:GBP");
  assert.equal(sealedFilter("AU", 10000), "buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:AU,price:[71.25..],priceCurrency:AUD");
  assert.equal(sealedFilter("CA", null), "buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:CA");
});

test("mapItem: affiliate URL preferred and EPN-tagged, postage in cents, condition label", () => {
  const l = mapItem({
    itemId: "v1|1|0",
    title: "t",
    price: { value: "12.50", currency: "GBP" },
    shippingOptions: [{ shippingCost: { value: "1.99", currency: "GBP" } }],
    itemWebUrl: "https://www.ebay.co.uk/itm/1",
    itemAffiliateWebUrl: "https://www.ebay.co.uk/itm/1?mkevt=1&mkcid=1&mkrid=710-99999-0-0&campid=1&toolid=10001",
    condition: "Near mint or better",
    itemLocation: { country: "GB" },
  })!;
  assert.equal(l.priceCents, 1250);
  assert.equal(l.shippingCents, 199);
  assert.equal(l.condition, "NM");
  const u = new URL(l.url);
  assert.equal(u.searchParams.get("mkrid"), "710-99999-0-0"); // eBay's own rotation kept
  assert.equal(u.searchParams.get("campid"), "5339155912");
  assert.equal(u.searchParams.get("customid"), "oc-uk-product");
});

test("sealed: identity through matchSealedTitle", () => {
  const refs: SealedRef[] = [
    { id: 900, name: "Romance Dawn Booster Box", kind: "Booster Box", setCode: "OP01", setName: "Romance Dawn" },
    { id: 901, name: "Paramount War Booster Box", kind: "Booster Box", setCode: "OP02", setName: "Paramount War" },
  ];
  const t: ChooseTarget = { kind: "sealed", id: 901, marketUsd: 30000, refs };
  const ok = item("One Piece Card Game Paramount War OP-02 Booster Box English Sealed", "320.00");
  const other = item("One Piece Romance Dawn OP-01 Booster Box English Sealed", "300.00");
  const r = chooseListing([other, ok], t, "US");
  assert.equal(r.listing?.itemId, ok.itemId);
  assert.equal(r.rejects["other-product"], 1);
});

// ── Graded slabs: captured from the same search, never an Offer ──────────────
test("parseGrade reads the grader and grade, and never invents one", () => {
  assert.deepEqual(parseGrade("PSA 10 GEM MINT Shanks OP01-120 Manga Rare One Piece"), { grader: "PSA", grade: 10 });
  assert.deepEqual(parseGrade("Shanks OP01-120 Parallel BGS 9.5 Romance Dawn"), { grader: "BGS", grade: 9.5 });
  assert.deepEqual(parseGrade("CGC-9 Portgas.D.Ace OP13-119 SAA"), { grader: "CGC", grade: 9 });
  assert.deepEqual(parseGrade("Shanks OP01-120 SGC10 One Piece"), { grader: "SGC", grade: 10 });
  assert.deepEqual(parseGrade("Shanks OP01-120 PSA graded, see photos"), { grader: "PSA", grade: null });
  assert.deepEqual(parseGrade("One of 10 PSA submissions Shanks"), { grader: "PSA", grade: null });
  assert.deepEqual(parseGrade("Shanks OP01-120 SEC Romance Dawn NM"), { grader: null, grade: null });
  assert.equal(isGradedListing("PSA 9 Shanks"), true);
  assert.equal(isGradedListing("Shanks OP01-120 NM"), false);
});

test("screenGraded keeps slabs of the target printing only, best grade first, and the raw path still rejects them", () => {
  const slab10 = item("PSA 10 GEM MINT Shanks OP01-120 Parallel Alt Art SEC Romance Dawn One Piece TCG", "260.00", { conditionId: "2750", condition: "Graded" });
  const slab9 = item("BGS 9 Shanks OP01-120 Parallel Alt Art Romance Dawn One Piece", "150.00", { conditionId: "2750", condition: "Graded" });
  const wrongPrinting = item("PSA 10 Shanks OP01-120 SEC Romance Dawn One Piece English", "40.00", { conditionId: "2750", condition: "Graded" });
  const raw = item("Shanks OP01-120 Parallel Alt Art SEC Romance Dawn One Piece TCG English", "80.00");
  const noGrader = item("Graded Shanks OP01-120 Parallel Alt Art Romance Dawn One Piece", "100.00", { conditionId: "2750", condition: "Graded" });
  const lowBait = item("PSA 8 Shanks OP01-120 Parallel Alt Art Romance Dawn One Piece", "5.00", { conditionId: "2750", condition: "Graded" });
  const lot = item("Lot of 3 PSA 10 Shanks OP01-120 Parallel Alt Art Romance Dawn One Piece", "600.00", { conditionId: "2750", condition: "Graded" });
  const all = [slab9, raw, wrongPrinting, noGrader, lowBait, lot, slab10];
  const slabs = screenGraded(all, single(2), "US");
  assert.deepEqual(slabs.map((l) => `${l.grader} ${l.grade}`), ["PSA 10", "BGS 9"]);
  assert.equal(pick(all, 2).listing?.title, raw.title); // raw pricing is unchanged
  assert.equal(screenGraded(all, single(1), "US").length, 1); // the base printing's own slab
});

test("panelListings puts the headline pick first and caps at 8", () => {
  const list = Array.from({ length: 12 }, (_, i) => L(1000 + i * 10, i));
  const out = panelListings(list, list[3]);
  assert.equal(out[0].itemId, "3");
  assert.equal(out.length, 8);
  assert.equal(new Set(out.map((l) => l.itemId)).size, 8);
  assert.equal(panelListings(list, null, new Set(["0"]))[0].itemId, "1");
});

test("mapItem carries Browse's own https image only", () => {
  const it = item("Shanks OP01-120 NM", "7.50");
  assert.equal(mapItem({ ...it, image: { imageUrl: "https://i.ebayimg.com/x.jpg" } })?.imageUrl, "https://i.ebayimg.com/x.jpg");
  assert.equal(mapItem({ ...it, image: { imageUrl: "http://i.ebayimg.com/x.jpg" } })?.imageUrl, null);
  assert.equal(mapItem(it)?.imageUrl, null);
});
