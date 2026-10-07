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
// The set tracker's pure half — RiftCompare's tests/set-scope.test.ts, ported
// for One Piece in wave 2 (2026-10-03). The scope rule is OP's: base = the
// standard prints (and a Premium Booster's reprints), Leaders included, DON!!
// out; all = every printing; a promo inside a booster group is in neither.
// Fixtures are real OP01 / PRB-01 / ST-01 printings (TCGplayer ids).
// ─────────────────────────────────────────────────────────────────────────────

const card = (p: Partial<ChecklistCard> & Pick<ChecklistCard, "id" | "number" | "printing">): ChecklistCard => ({
  slug: `c-${p.id}`,
  name: "Card",
  variant: null,
  rarity: "C",
  setCode: "OP01",
  hasImage: true,
  isPromo: false,
  minCents: null,
  stores: 0,
  otherSource: false,
  ...p,
});

const shanks = card({ id: 454664, number: "OP01-120", printing: "standard", name: "Shanks", rarity: "SEC", minCents: 2500, stores: 4 });
const shanksPar = card({ id: 454665, number: "OP01-120", printing: "alt", variant: "Parallel", name: "Shanks", rarity: "SEC", minCents: 40000, stores: 2 });
const shanksManga = card({ id: 454666, number: "OP01-120", printing: "manga", variant: "Parallel · Manga · Alternate Art", name: "Shanks", rarity: "SEC", otherSource: true });
const zoroLeader = card({ id: 454512, number: "OP01-001", printing: "standard", name: "Roronoa Zoro", rarity: "L", minCents: 150, stores: 6 });
const strayPromo = card({ id: 514047, number: "OP01-120", printing: "promo", variant: "Championship 2023", name: "Shanks", rarity: "PR", isPromo: promoOutsideSet("promo", "booster") });
const don = card({ id: 500001, number: null, printing: "don", name: "DON!! Card", rarity: "DON!!" });
const nami = card({ id: 453500, number: "OP01-016", printing: "standard", name: "Nami", rarity: "R" });
const CARDS = [shanks, shanksPar, shanksManga, zoroLeader, strayPromo, don, nami];

test("base: standard prints with the Leader, no Parallel, Manga or DON!!; all adds them; a stray promo is in neither", () => {
  assert.deepEqual(CARDS.filter((c) => cardInScope(c, "base")).map((c) => c.id), [454664, 454512, 453500]);
  assert.deepEqual(CARDS.filter((c) => cardInScope(c, "all")).map((c) => c.id), [454664, 454665, 454666, 454512, 500001, 453500]);
});

test("a Premium Booster's reprints are its base set, and a promo group's promos count", () => {
  const reprint = card({ id: 594316, number: "OP01-120", printing: "reprint", setCode: "PRB-01" });
  assert.ok(cardInScope(reprint, "base"));
  assert.equal(promoOutsideSet("promo", "promo"), false);
  assert.equal(promoOutsideSet("promo", "event"), false);
  assert.equal(promoOutsideSet("promo", "booster"), true);
  const p001 = card({ id: 450299, number: "P-001", printing: "promo", setCode: "OP-PR", isPromo: promoOutsideSet("promo", "promo") });
  assert.ok(cardInScope(p001, "base"));
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

test("owned is any copy of the printing: owning the standard Shanks does not tick its Parallel", () => {
  const owned = { "454664": 2 };
  const base = summarise(CARDS, owned, "base");
  assert.deepEqual([base.total, base.owned, base.missing, base.percent], [3, 1, 2, 33]);
  const all = summarise(CARDS, owned, "all");
  assert.deepEqual([all.total, all.owned], [6, 1]);
});

test("an eBay-only card is counted in neither the cost nor the not-in-stock total", () => {
  const s = summarise(CARDS, {}, "all");
  assert.equal(s.priced, 3);
  assert.equal(s.costCents, 2500 + 40000 + 150);
  assert.equal(s.otherOnly, 1, "the Manga only eBay lists");
  assert.equal(s.notInStock, 2, "DON!! and Nami");
});

test("an owned card is never costed, and an empty scope has no percentage rather than NaN", () => {
  const s = summarise(CARDS, { "454665": 1 }, "all");
  assert.equal(s.costCents, 2500 + 150);
  assert.equal(summarise([], {}, "base").percent, null);
});

test("a set that has not released reports 'N revealed' with no denominator", () => {
  const p = summarisePreRelease(CARDS, { "454664": 1 });
  assert.deepEqual(p, { revealed: 6, owned: 1 }, "the stray promo is not revealed for the set");
  assert.equal(preReleaseLine(p), "6 cards revealed so far");
  assert.equal(preReleaseLine({ revealed: 1, owned: 0 }), "1 card revealed so far");
});

test("card numbers sort by set prefix, numerically, then standard before Parallel before Manga; DON!! last", () => {
  const sorted = [don, shanksManga, nami, shanksPar, zoroLeader, shanks].sort(compareByNumber).map((c) => c.id);
  assert.deepEqual(sorted, [454512, 453500, 454664, 454665, 454666, 500001]);
  const st = card({ id: 1, number: "ST01-012", printing: "standard" });
  assert.ok(compareByNumber(shanks, st) < 0, "OP01 before ST01");
});

test("cheapest and dearest put store-priced cards first, then eBay-only, then not in stock", () => {
  const rows = listRows(CARDS, {}, { scope: "all", show: "missing", sort: "cheapest" }).map((c) => c.id);
  assert.deepEqual(rows, [454512, 454664, 454665, 454666, 453500, 500001]);
  const dear = listRows(CARDS, {}, { scope: "all", show: "missing", sort: "dearest" }).map((c) => c.id);
  assert.deepEqual(dear.slice(0, 3), [454665, 454664, 454512]);
});

test("show and rarity filters", () => {
  const owned = { "454664": 1 };
  assert.deepEqual(listRows(CARDS, owned, { scope: "base", show: "owned", sort: "number" }).map((c) => c.id), [454664]);
  assert.deepEqual(listRows(CARDS, owned, { scope: "all", show: "all", rarity: "SEC", sort: "number" }).map((c) => c.id), [454664, 454665, 454666]);
  assert.deepEqual(raritiesIn(CARDS, "base"), ["L", "R", "SEC"], "One Piece rarity order");
});

test("the copied list names each printing, and pins a non-standard one so Best Basket prices the right card", () => {
  assert.equal(missingLine(shanks), "1 Shanks OP01-120");
  assert.equal(missingLine(shanksPar), "1 Shanks OP01-120 (Parallel) #454665");
  assert.equal(missingLine(don), "1 DON!! Card #500001");
  assert.equal(missingText([shanks, shanksPar]), "1 Shanks OP01-120\n1 Shanks OP01-120 (Parallel) #454665");
});

test("the copied list resolves back to the exact printing through the deck parser", async () => {
  const { parseDeckList } = await import("../src/lib/deck");
  const [a, b] = parseDeckList(missingText([shanks, shanksPar]));
  assert.equal(a.number, "OP01-120");
  assert.equal(a.productId, undefined);
  assert.equal(b.productId, 454665);
});

test("the CSV carries a header, escapes commas and quotes, leaves an unpriced cell empty, and carries the TCGplayer id", () => {
  const csv = missingCsv([shanksPar, card({ id: 7, number: "OP01-016", printing: "standard", name: 'Nami, "Navigator"' })], "USD");
  const lines = csv.split("\n");
  assert.equal(lines[0], "set,number,printing,name,rarity,cheapest_usd,stores,tcgplayer_id");
  assert.equal(lines[1], "OP01,OP01-120,alt,Shanks (Parallel),SEC,400.00,2,454665");
  assert.equal(lines[2], 'OP01,OP01-016,standard,"Nami, ""Navigator""",C,,0,7');
});

test("the labels and the footer", () => {
  assert.equal(otherSourceLabel("US"), "eBay only");
  assert.equal(SET_FOOTER_COPY, "Cheapest listing per card, before postage. Best Basket prices delivery.");
});
