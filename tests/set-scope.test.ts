import test from "node:test";
import assert from "node:assert/strict";
import {
  SET_FOOTER_COPY,
  cardInScope,
  compareByNumber,
  listRows,
  missingCsv,
  missingLine,
  missingText,
  otherSourceLabel,
  parseScope,
  parseShow,
  parseSort,
  preReleaseLine,
  promoOutsideSet,
  raritiesIn,
  summarise,
  summarisePreRelease,
  type ChecklistCard,
} from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// The set tracker's pure half. The scope rule: base = the plain printings
// (no treatment word), all = every printing the checklist lists, a promo
// treatment inside a set that is not a promo set is in neither. Fixtures are
// real products of tests/fixtures/magic-products.json (TCGplayer ids, collector
// numbers, lows in US cents).
// ─────────────────────────────────────────────────────────────────────────────

const card = (p: Partial<ChecklistCard> & Pick<ChecklistCard, "id" | "number" | "printing">): ChecklistCard => ({
  slug: `c-${p.id}`,
  name: "Card",
  variant: null,
  rarity: "C",
  setCode: "MKM",
  hasImage: true,
  isPromo: false,
  minCents: null,
  stores: 0,
  otherSource: false,
  ...p,
});

const caseOfHothouse = card({ id: 533889, number: "155", printing: "standard", name: "Case of the Locked Hothouse", rarity: "R", minCents: 170, stores: 4 });
const prerelease = card({ id: 536485, number: "155", printing: "prerelease", variant: "Prerelease", name: "Case of the Locked Hothouse", rarity: "R", isPromo: promoOutsideSet("prerelease", "expansion"), minCents: 600, stores: 2 });
const counterspell = card({ id: 238617, number: "267", printing: "standard", name: "Counterspell", rarity: "U", setCode: "MH2", minCents: 199, stores: 6 });
const kayla = card({ id: 452492, number: "62", printing: "extended", variant: "Extended Art", name: "Kayla's Music Box", rarity: "R", setCode: "BRC", minCents: 7, stores: 3 });
const stingcaster = card({ id: 692998, number: "457", printing: "borderless", variant: "Borderless · Facet Foil", name: "Stingcaster Mage", rarity: "M", setCode: "FRA", minCents: 29899, stores: 1, thin: true });
const unpriced = card({ id: 1042, number: null, printing: "standard", name: "Black Lotus", rarity: "R", setCode: "LEA" });
const CARDS = [caseOfHothouse, prerelease, counterspell, kayla, stingcaster, unpriced];

test("base: the plain printings; all adds the frame, art and foil-pattern versions; a stamped promo inside an expansion is in neither", () => {
  assert.deepEqual(CARDS.filter((c) => cardInScope(c, "base")).map((c) => c.id), [533889, 238617, 1042]);
  assert.deepEqual(CARDS.filter((c) => cardInScope(c, "all")).map((c) => c.id), [533889, 238617, 452492, 692998, 1042]);
});

test("a promo set's own promos count, and a THIN row is a member like any other", () => {
  assert.equal(promoOutsideSet("prerelease", "promo"), false);
  assert.equal(promoOutsideSet("promopack", "promo-pack"), false);
  assert.equal(promoOutsideSet("secretlair", "secret-lair"), false);
  assert.equal(promoOutsideSet("prerelease", "expansion"), true);
  assert.equal(promoOutsideSet(["borderless", "prerelease"], "expansion"), true);
  assert.equal(promoOutsideSet("borderless", "expansion"), false, "a frame is not a promo");
  const pack = card({ id: 719572, number: "43", printing: "promopack", setCode: "PFRA", isPromo: promoOutsideSet("promopack", "promo-pack") });
  assert.ok(cardInScope(pack, "base"), "inside a promo set the promo word is the plain printing");
  assert.ok(cardInScope(pack, "all"));
  assert.ok(cardInScope(stingcaster, "all"));
});

test("scope, show and sort parse to their defaults for anything unknown", () => {
  assert.equal(parseScope("all"), "all");
  assert.equal(parseScope(["all"]), "all");
  assert.equal(parseScope("everything"), "base");
  assert.equal(parseShow("owned"), "owned");
  assert.equal(parseShow(undefined), "missing");
  assert.equal(parseSort("number"), "number");
  assert.equal(parseSort("random"), "cheapest");
});

test("owned is any copy of the printing, any finish: owning the plain Case does not tick the Borderless Stingcaster", () => {
  const owned = { "533889": 2 };
  const base = summarise(CARDS, owned, "base");
  assert.deepEqual([base.total, base.owned, base.missing, base.percent], [3, 1, 2, 33]);
  const all = summarise(CARDS, owned, "all");
  assert.deepEqual([all.total, all.owned], [5, 1]);
});

test("cost counts the cheapest listing of each missing card, THIN included; a card nobody lists is 'not in stock'", () => {
  const s = summarise(CARDS, {}, "all");
  assert.equal(s.priced, 4);
  assert.equal(s.costCents, 170 + 199 + 7 + 29899);
  assert.equal(s.otherOnly, 0);
  assert.equal(s.notInStock, 1, "the unpriced Black Lotus");
});

test("an owned card is never costed, and an empty scope has no percentage rather than NaN", () => {
  const s = summarise(CARDS, { "692998": 1 }, "all");
  assert.equal(s.costCents, 170 + 199 + 7);
  assert.equal(summarise([], {}, "base").percent, null);
});

test("a set that has not released reports 'N revealed' with no denominator", () => {
  const p = summarisePreRelease(CARDS, { "533889": 1 });
  assert.deepEqual(p, { revealed: 5, owned: 1 }, "the prerelease stamp is not revealed for the set");
  assert.equal(preReleaseLine(p), "5 cards revealed so far");
  assert.equal(preReleaseLine({ revealed: 1, owned: 0 }), "1 card revealed so far");
});

test("collector numbers sort by prefix, numerically, then suffix, then plain before treated; no number last", () => {
  const star = card({ id: 2831, number: "231\u2605", printing: "standard" });
  const plain = card({ id: 2830, number: "231", printing: "standard" });
  const khc = card({ id: 9, number: "KHC-29", printing: "standard" });
  const lead = card({ id: 8, number: "029", printing: "standard" });
  const sorted = [unpriced, stingcaster, khc, star, plain, kayla, lead].sort(compareByNumber).map((c) => c.id);
  assert.deepEqual(sorted, [8, 452492, 2830, 2831, 692998, 9, 1042]);
});

test("cheapest and dearest put store-priced cards first, then the ones nobody lists", () => {
  const rows = listRows(CARDS, {}, { scope: "all", show: "missing", sort: "cheapest" }).map((c) => c.id);
  assert.deepEqual(rows, [452492, 533889, 238617, 692998, 1042]);
  const dear = listRows(CARDS, {}, { scope: "all", show: "missing", sort: "dearest" }).map((c) => c.id);
  assert.deepEqual(dear.slice(0, 3), [692998, 238617, 533889]);
});

test("show and rarity filters", () => {
  const owned = { "533889": 1 };
  assert.deepEqual(listRows(CARDS, owned, { scope: "base", show: "owned", sort: "number" }).map((c) => c.id), [533889]);
  assert.deepEqual(listRows(CARDS, owned, { scope: "all", show: "all", rarity: "R", sort: "number" }).map((c) => c.id), [452492, 533889, 1042]);
  assert.deepEqual(raritiesIn(CARDS, "all"), ["M", "R", "U"], "constants RARITIES order");
});

test("the copied list is a deck list: set and number, and the product pinned for a treated printing", () => {
  assert.equal(missingLine(caseOfHothouse), "1 Case of the Locked Hothouse (MKM) 155");
  assert.equal(missingLine(stingcaster), "1 Stingcaster Mage (FRA) 457 #692998");
  assert.equal(missingLine(unpriced), "1 Black Lotus #1042");
  assert.equal(missingText([caseOfHothouse, stingcaster]), "1 Case of the Locked Hothouse (MKM) 155\n1 Stingcaster Mage (FRA) 457 #692998");
});

test("the copied list resolves back to the exact printing through the deck parser", async () => {
  const { parseDeckList } = await import("../src/lib/deck");
  const [a, b] = parseDeckList(missingText([caseOfHothouse, stingcaster]));
  assert.equal(a.number, "155");
  assert.equal(a.set, "mkm");
  assert.equal(a.productId, undefined);
  assert.equal(b.productId, 692998);
});

test("the CSV carries a header, escapes commas and quotes, leaves an unpriced cell empty, and carries the TCGplayer id", () => {
  const csv = missingCsv([stingcaster, card({ id: 7, number: "16", printing: "standard", name: 'Jace, "Beleren"', setCode: "M11" })], "USD");
  const lines = csv.split("\n");
  assert.equal(lines[0], "set,number,printing,name,rarity,cheapest_usd,stores,tcgplayer_id");
  assert.equal(lines[1], "FRA,457,borderless,Stingcaster Mage (Borderless \u00b7 Facet Foil),M,298.99,1,692998");
  assert.equal(lines[2], 'M11,16,standard,"Jace, ""Beleren""",C,,0,7');
});

test("the labels and the footer", () => {
  assert.equal(otherSourceLabel("US"), "Other source only");
  assert.equal(SET_FOOTER_COPY, "Cheapest listing per card, before postage. Best Basket prices delivery.");
});
