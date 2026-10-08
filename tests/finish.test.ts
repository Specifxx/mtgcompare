// Invariant C2 (owner WP01a): a price belongs to a (product, finish). Every persisted price, offer, history point, alert, collection line, deal row and eBay row carries `finish`; there is no slot and no
// "headline" in a key; `uid` and `UnitKey` are the only unit identifiers; the headline is Normal first and is computed at read time. Real products of tests/fixtures/magic-products.json throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "../src/lib/constants";
import * as K from "../src/lib/catalog";
import * as T from "../src/lib/track";

interface Fx { productId: number; name: string; groupKind: string; prices: Record<string, { market: number | null; low: number | null }>; expect: { cls: number | "sealed"; hasN: boolean; hasF: boolean; etched: boolean; star: boolean; fnum: string | null; displayName: string | null } }
const ROOT = path.resolve(__dirname, "..");
const fixtures: Fx[] = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/magic-products.json"), "utf8"));
const fx = (id: number): Fx => fixtures.find((f) => f.productId === id)!;
const rowsOf = (f: Fx) => K.finishPrices(Object.entries(f.prices).map(([subTypeName, p]) => ({ productId: f.productId, subTypeName, marketPrice: p.market, lowPrice: p.low })));
const treatOf = (f: Fx): C.TreatmentKey[] => K.parseTcgName(f.name, { setCodes: new Set(), groupKind: f.groupKind as C.SetKind }).treat;

test("a unit is (productId, finish): uid = productId * 2 + finish index, UnitKey = '<productId>.<index>'; both round-trip for every fixture id and for the largest ids", () => {
  const ids = [...fixtures.map((f) => f.productId), 1, 1_400_000, 1_073_741_823];
  for (const id of ids) for (const f of C.FINISH_KEYS) {
    const uid = C.uidOf(id, f);
    assert.equal(uid % 2, f === "F" ? 1 : 0, "Normal is even, Foil is odd");
    assert.deepEqual(C.unitOfUid(uid), { id, finish: f });
    assert.deepEqual(C.parseUnitKey(C.unitKey(id, f)), { id, finish: f });
    assert.ok(uid < 2 ** 31, `${id}: a uid fits an int32`);
  }
  assert.equal(C.uidOf(2831, "N"), 5662);
  assert.equal(C.uidOf(2831, "F"), 5663);
  assert.equal(C.unitKey(2831, "F"), "2831.1");
  assert.equal(C.unitKey(251776, "N"), "251776.0");
  assert.deepEqual([C.finishFromIndex(0), C.finishFromIndex(1), C.finishFromIndex(7)], ["N", "F", "N"]);
});
test("parseUnitKey accepts exactly '<digits>.<0|1>': there is no key without a finish and no third finish", () => {
  for (const bad of ["2831", "2831.2", "2831.", ".1", "x.1", "2831.1.0", "-5.0", " 2831.0", "2831.01", ""]) assert.equal(C.parseUnitKey(bad), null, JSON.stringify(bad));
  assert.deepEqual(C.parseUnitKey("0.0"), { id: 0, finish: "N" });
});
test("TCGplayer's subtypes: only Normal and Foil are finishes; Surge, Galaxy, Etched and the rest are PRODUCTS whose single row is Foil", () => {
  assert.deepEqual(C.TCG_SUBTYPE_FINISH, { Normal: "N", Foil: "F" });
  const rows = K.finishPrices([
    { productId: 1, lowPrice: 0.5, marketPrice: 10, subTypeName: "Normal" }, { productId: 1, lowPrice: 3, marketPrice: null, subTypeName: "Foil" }, { productId: 1, lowPrice: 1, marketPrice: 1, subTypeName: "Etched" },
  ]);
  assert.deepEqual(rows.n, { marketCents: 1000, lowCents: null }, "$0.50 is under 25% of a $10 market: a thin low is dropped");
  assert.deepEqual(rows.f, { marketCents: null, lowCents: 300 });
  assert.deepEqual(rows.unknownSubtypes, ["Etched"], "counted, not a finish");
  assert.equal("pickPrice" in K, false, "OP's 'highest market wins' is deleted: it would headline the Foil for 89.8% of dual-finish printings");
  for (const id of [638920, 692998, 541332, 697908, 630946]) { const f = fx(id); assert.deepEqual([f.expect.hasN, f.expect.hasF, rowsOf(f).n, rowsOf(f).f !== null], [false, true, null, true], `${f.name}: a foil-pattern product has a Foil row only`); }
});
test("the finish a fixture has equals the price rows it carries (HASN / HASF), and availableFinishes reads them back from the mask", () => {
  for (const f of fixtures) {
    if (f.expect.cls === "sealed") continue;
    const r = rowsOf(f);
    assert.equal(r.n !== null, f.expect.hasN, `${f.productId} Normal`);
    assert.equal(r.f !== null, f.expect.hasF, `${f.productId} Foil`);
    const mask = (r.n ? C.PRICE_MASK.HASN : 0) | (r.f ? C.PRICE_MASK.HASF : 0);
    assert.deepEqual(C.availableFinishes(mask), [...(f.expect.hasN ? ["N"] : []), ...(f.expect.hasF ? ["F"] : [])]);
  }
  assert.deepEqual(C.availableFinishes(0), []);
  assert.deepEqual(C.availableFinishes(C.PRICE_MASK.HASF | C.PRICE_MASK.HASN), ["N", "F"]);
});
test("the headline is Normal first, never 'the dearer one': Birds of Paradise has a $22.89 Normal and a $3,980.75 Foil", () => {
  const f = fx(2831), r = rowsOf(f);
  assert.deepEqual([r.n!.marketCents, r.f!.marketCents], [2289, 398075]);
  assert.deepEqual(T.headlineOf(T.marketOnlyCents(r.n), T.marketOnlyCents(r.f)), { cents: 2289, finish: "N" });
  assert.equal(T.bestUsd({ marketN: 2289, marketF: 398075 }), 398075, "the dearer MARKET is only for value rankings");
  const foilOnly = fx(692998), fr = rowsOf(foilOnly);
  assert.deepEqual(T.headlineOf(null, T.marketOnlyCents(fr.f)), { cents: 29800, finish: "F" }, "a Foil-only product headlines Foil");
  assert.deepEqual(T.headlineOf(null, null), { cents: null, finish: "N" });
});
test("finishLabel / finishKind: Non-foil, Foil Etched, the pattern's own name, or plain Foil (real product names)", () => {
  const label = (id: number, finish: C.Finish): string => { const f = fx(id); return C.finishLabel({ flags: f.expect.etched ? C.CARD_FLAGS.ETCHED : 0, treat: treatOf(f) }, finish); };
  assert.equal(label(496078, "N"), "Non-foil");
  assert.equal(label(496078, "F"), "Foil", "Forest (0205): a Foil row of an ordinary product");
  assert.equal(label(541332, "F"), "Foil Etched", "Ezio Auditore da Firenze (Foil Etched)");
  assert.equal(label(532997, "F"), "Foil Etched", "Mirko, Obsessive Theorist: etched by the etched id although the name has no Foil Etched token");
  assert.equal(label(697908, "F"), "Surge Foil");
  assert.equal(label(638920, "F"), "Galaxy Foil");
  assert.equal(label(692998, "F"), "Facet Foil");
  assert.equal(label(719547, "F"), "Double Rainbow Foil");
  assert.equal(label(630946, "F"), "Neon Ink Foil");
  assert.equal(label(557904, "F"), "Rainbow Foil");
  assert.equal(label(286677, "F"), "Surge Foil", "Inquisitor Greyfax: NOT etched although both Scryfall indexes hit");
  assert.equal(C.finishKind({ flags: C.CARD_FLAGS.ETCHED }, "F"), "etched");
  assert.equal(C.finishKind({ flags: C.CARD_FLAGS.ETCHED }, "N"), "nonfoil", "etched is a kind of the Foil unit; the Normal unit of a product is never etched");
  assert.equal(C.finishKind({ flags: 0 }, "F"), "foil");
  assert.deepEqual(C.FINISH_LABEL, { nonfoil: "Non-foil", foil: "Foil", etched: "Foil Etched" });
});
test("?finish=: nonfoil, foil and etched are VIEWS of the same page; anything else is ignored and never a 404", () => {
  for (const [v, want] of [["nonfoil", { finish: "N", etched: false }], ["Normal", { finish: "N", etched: false }], ["n", { finish: "N", etched: false }], ["foil", { finish: "F", etched: false }], ["F", { finish: "F", etched: false }], ["etched", { finish: "F", etched: true }], ["foil-etched", { finish: "F", etched: true }], ["e", { finish: "F", etched: true }]] as const) assert.deepEqual(C.parseFinishParam(v), want, v);
  for (const v of ["", "x", "gold", "2", "foil etched", null, undefined]) assert.equal(C.parseFinishParam(v as string | null), null, String(v));
  assert.deepEqual([C.finishParam("N"), C.finishParam("F"), C.finishParam("F", "etched"), C.finishParam("N", "etched")], ["nonfoil", "foil", "etched", "nonfoil"]);
});
test("a shared TCGplayer id is ONE card: the Normal unit shows the printing without a star, the Foil unit the star printing (fixtures 2831 and 3077)", () => {
  for (const id of [2831, 3077]) {
    const star = fx(id).expect.fnum!, plain = star.replace("★", "");
    assert.equal(fx(id).expect.star, true);
    assert.equal(C.displayNumber({ number: plain, fnum: star }, "N"), plain);
    assert.equal(C.displayNumber({ number: plain, fnum: star }, "F"), star);
    assert.equal(C.nkey(star), C.nkey(plain), "the lookup key ignores the star");
    assert.ok(C.nsort(star) > C.nsort(plain) && C.nsort(star) < C.nsort(String(Number(plain) + 1)), "and the star sorts right after the plain number");
  }
});
test("normalizeFoil: collection and deck lines force the only finish a product has", () => {
  const foilOnly = (id: number): number => (rowsOf(fx(id)).n ? C.PRICE_MASK.HASN : 0) | (rowsOf(fx(id)).f ? C.PRICE_MASK.HASF : 0);
  assert.equal(T.normalizeFoil({ mask: foilOnly(692998) }, false), true, "Stingcaster Mage (Facet Foil) has a Foil row only");
  assert.equal(T.normalizeFoil({ mask: foilOnly(513650) }, true), false, "Brazen Borrower has a Normal row only");
  assert.equal(T.normalizeFoil({ mask: foilOnly(2831) }, true), true);
  assert.equal(T.normalizeFoil({ mask: foilOnly(2831) }, false), false);
});
test("buy links name the finish (the Foil parameter is unverified and harmless when ignored)", () => {
  assert.equal(C.tcgplayerUrl(2831), "https://www.tcgplayer.com/product/2831");
  assert.equal(C.tcgplayerUrl(2831, "N"), "https://www.tcgplayer.com/product/2831");
  assert.equal(C.tcgplayerUrl(2831, "F"), "https://www.tcgplayer.com/product/2831?Printing=Foil");
});

// ── the C2 sweep: where the finish lives in every persisted shape ──
test("C2 in the private schema: every model that holds a product id says how the finish travels with it", () => {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1]!, body: m[2]!.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean) }));
  const withProduct = models.filter((m) => m.body.some((l) => /^(cardId|productId|sealedId|commanderCardId|cardIds)\s/.test(l))).map((m) => m.name).sort();
  // model -> the field (or JSON element) that carries the finish. A new model with a product id must be added HERE, with its answer.
  const CARRIER: Record<string, { field: RegExp } | { json: string } | { why: string }> = {
    PriceReport: { field: /^finish\s+Int\s+@default\(0\)\s+@db\.SmallInt/ },
    PriceAlert: { field: /^finish\s+Int\s+@default\(0\)\s+@db\.SmallInt/ },
    CollectionCard: { field: /^isFoil\s+Boolean/ },
    EbayBest: { field: /^finish\s+Int\s+@db\.SmallInt/ },
    EbayPanel: { json: "finish" },
    PublishedDeck: { json: "finish" },
    SealedWatch: { why: "a sealed product has one price, finish 0" },
    CardStat: { why: "a view and search counter of the product, not a price" },
  };
  assert.deepEqual(withProduct, Object.keys(CARRIER).sort());
  for (const m of models.filter((x) => x.name in CARRIER)) {
    const c = CARRIER[m.name]!;
    const text = schema.slice(schema.indexOf(`model ${m.name} {`)).split(/^\}/m)[0]!;
    if ("field" in c) assert.ok(m.body.some((l) => c.field.test(l)), `${m.name} must carry its finish as a column`);
    if ("json" in c) assert.ok(new RegExp(`\\b${c.json}\\b`).test(text), `${m.name}: its JSON column says where ${c.json} sits`);
  }
  assert.match(schema, /@@unique\(\[email, cardId, finish, market\]\)/, "an alert is per (card, finish, market)");
  assert.match(schema, /@@unique\(\[userId, cardId, condition, isFoil\]\)/, "a collection line is per (card, condition, finish)");
});
test("C2 in the published formats: unit rows, offers, store listings and the flat picker rows are keyed by uid; the history key is the UnitKey", () => {
  const formats = fs.readFileSync(path.join(ROOT, "src/lib/data/plane/formats.ts"), "utf8");
  assert.match(formats, /export type UnRow = \[uid: number,/);
  assert.match(formats, /export type OfferTuple = \[uid: number,/);
  assert.match(formats, /export type StoreListingTuple = \[uid: number,/);
  assert.match(formats, /export interface IxF \{ v: 1; n: number; uid: number\[\]/);
  assert.match(formats, /t: \[row: number, finish: number,/, "the ix/p change rows name the finish");
  for (const sample of ["hist-p", "hist-t"]) {
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/fixtures/plane/${sample}.json`), "utf8")).content as { p: Record<string, unknown> };
    const keys = Object.keys(file.p);
    assert.ok(keys.length > 0, sample);
    for (const k of keys) assert.ok(C.parseUnitKey(k), `${sample}: ${k} is a UnitKey`);
  }
  const hist = fs.readFileSync(path.join(ROOT, "src/lib/history.ts"), "utf8");
  assert.match(hist, /Keys are UnitKey \("<productId>\.<finishIndex>"\)/);
});
