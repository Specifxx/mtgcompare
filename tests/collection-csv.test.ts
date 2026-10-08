import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CSV_LINE_CAP,
  collectionCsv,
  exportFilename,
  finishFor,
  matchCsvRows,
  parseCollectionCsv,
  parseFinishCell,
  splitCells,
  type CsvCard,
  type CsvData,
} from "../src/lib/collection-csv";
import { CARD_FLAGS } from "../src/lib/constants";
import { nkey } from "../src/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// The binder import. A line names ONE product (Card.id is the TCGplayer
// productId) by a TCGplayer Product ID, or by set plus collector number; the
// finish is the line's (Foil, Etched, Normal, blank = Normal) and the product's
// own finishes win. Never guessed. Rows are real products of
// tests/fixtures/magic-products.json (TCGplayer ids, set codes, collector numbers).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const q = { market: null, low: null };
const card = (id: number, name: string, setCode: string, number: string | null, o: { n?: boolean; f?: boolean; etched?: boolean; treat?: string[] } = {}): CsvCard => ({
  id, name, setCode, number, flags: o.etched ? CARD_FLAGS.ETCHED : 0, treat: o.treat ?? [], n: o.n === false ? null : q, f: o.f === false ? null : q,
});
const CAT: CsvCard[] = [
  card(238617, "Counterspell", "MH2", "267"),                                  // Modern Horizons 2: Normal and Foil
  card(240803, "Counterspell (Foil Etched)", "MH2", "267", { n: false, etched: true, treat: ["etched"] }),   // its etched twin: another product, Foil only
  card(496078, "Forest", "WHO", "205"),
  card(541332, "Ezio Auditore da Firenze", "ACR", "203", { n: false, etched: true, treat: ["etched"] }),
  card(533889, "Case of the Locked Hothouse", "MKM", "155"),
  card(536485, "Case of the Locked Hothouse", "PMKM", "155", { n: false, treat: ["prerelease"] }),
  card(2831, "Birds of Paradise", "7ED", "231"),
  card(692998, "Stingcaster Mage", "FRA", "457", { n: false, treat: ["borderless", "facet"] }),
  // two ordinary products that share one set and number: never guessed
  card(900001, "Sol Ring", "C21", "263"),
  card(900002, "Sol Ring", "C21", "263", { treat: ["stamped"] }),
];
const byId = new Map(CAT.map((c) => [c.id, c]));
const data: CsvData = {
  byIds: async (ids) => new Map(ids.filter((i) => byId.has(i)).map((i) => [i, byId.get(i)!])),
  bySetNumber: async (pairs) => {
    const out = new Map<string, CsvCard[]>();
    for (const p of pairs) {
      const key = `${p.set.toLowerCase()}|${nkey(p.number)}`;
      const hit = CAT.filter((c) => c.setCode.toLowerCase() === p.set.toLowerCase() && nkey(c.number) === nkey(p.number));
      if (hit.length) out.set(key, hit);
    }
    return out;
  },
  setCodes: async (names) => new Map(names.filter((n) => n === "modern horizons 2").map((n) => [n, "mh2"])),
};

test("cells split on the delimiter, honouring quotes and doubled quotes", () => {
  assert.deepEqual(splitCells('a,"b, c","say ""hi""",e', ","), ["a", "b, c", 'say "hi"', "e"]);
  assert.deepEqual(splitCells("a\tb\t", "\t"), ["a", "b", ""]);
});

test("finish words: Foil, foil, Etched, Foil Etched, Normal, Nonfoil, blank (= Normal); anything else is reported", () => {
  for (const w of ["Foil", "foil", "FOIL", "foiled", "Surge Foil", "yes"]) assert.deepEqual(parseFinishCell(w), { foil: true, etched: false }, w);
  for (const w of ["Etched", "Foil Etched", "etched foil"]) assert.deepEqual(parseFinishCell(w), { foil: true, etched: true }, w);
  for (const w of ["Normal", "Nonfoil", "non-foil", "Regular"]) assert.deepEqual(parseFinishCell(w), { foil: false, etched: false }, w);
  assert.equal(parseFinishCell(""), null);
  assert.equal(parseFinishCell("sparkly"), undefined);
});

test("a TCGplayer collection export maps exactly by Product ID, and its Printing column is the finish", async () => {
  const text = [
    "Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU",
    "1,Counterspell,Counterspell,Modern Horizons 2,267,MH2,Foil,Near Mint,English,Uncommon,238617,123",
    "2,Forest,Forest,Universes Beyond: Doctor Who,0205,WHO,Normal,Lightly Played,English,Land,496078,124",
    "0,Birds of Paradise,Birds of Paradise,7th Edition,231,7ED,Normal,Near Mint,English,Rare,2831,125",
  ].join("\n");
  const r = parseCollectionCsv(text)!;
  assert.ok(r);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.rows.map((x) => [x.productId, x.qty, x.condition, x.isFoil]), [[238617, 1, "NM", true], [496078, 2, "LP", false]], "a 0-quantity row is a product they don't hold");
  const m = await matchCsvRows(r.rows, data);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.isFoil]), [[238617, true], [496078, false]]);
  assert.deepEqual(m.unmatched, []);
});

test("Moxfield, Deckbox and ManaBox exports: set code or set name plus collector number, finish column", async () => {
  const moxfield = ["Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number", "1,0,Counterspell,mh2,Near Mint,English,foil,,2026-10-01,267", "2,0,Counterspell,mh2,Near Mint,English,etched,,2026-10-01,267"].join("\n");
  const m1 = await matchCsvRows(parseCollectionCsv(moxfield)!.rows, data);
  assert.deepEqual(m1.matched.map((x) => [x.card.id, x.isFoil, x.copy.qty]), [[238617, true, 1], [240803, true, 2]], "Etched finds the etched twin of the printing");
  const deckbox = ["Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil", "1,0,Counterspell,Modern Horizons 2,267,Near Mint,English,"].join("\n");
  const m2 = await matchCsvRows(parseCollectionCsv(deckbox)!.rows, data);
  assert.deepEqual(m2.matched.map((x) => [x.card.id, x.isFoil]), [[238617, false]], "a set NAME resolves through the sets, blank is Normal");
  const manabox = ["Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Condition,Language", "Forest,WHO,Universes Beyond: Doctor Who,205,normal,common,4,near_mint,en"].join("\n");
  const m3 = await matchCsvRows(parseCollectionCsv(manabox)!.rows, data);
  assert.deepEqual(m3.matched.map((x) => [x.card.id, x.copy.qty]), [[496078, 4]]);
});

test("our own export round-trips into the same products and finishes, and its TOTAL row is not a skipped line", async () => {
  const rows = [
    { name: "Counterspell (Foil Etched)", setCode: "MH2", number: "267", finish: "Etched" as const, condition: "NM", quantity: 1, unitCents: 326, costBasisCents: null, note: null, tcgplayerId: 240803 },
    { name: "Forest", setCode: "WHO", number: "205", finish: "" as const, condition: "LP", quantity: 2, unitCents: 25, costBasisCents: 10, note: 'trade, "mint"', tcgplayerId: 496078 },
  ];
  const csv = collectionCsv(rows, "USD");
  assert.match(csv.split("\n")[0], /^name,set,number,condition,finish,quantity,unit_usd,value_usd,paid_each_usd,note,tcgplayer_id$/);
  assert.match(csv, /\nTOTAL,,,,,,,3\.76,,,\n$/);
  const r = parseCollectionCsv(csv)!;
  assert.deepEqual(r.skipped, []);
  const m = await matchCsvRows(r.rows, data);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.copy.qty, x.copy.condition, x.isFoil]), [[240803, 1, "NM", true], [496078, 2, "LP", false]]);
  assert.equal(exportFilename(new Date("2026-10-08T12:00:00Z")), "mtgcompare-binder-2026-10-08.csv");
});

test("the only finish a product has is forced; Etched with no etched twin falls back to the Foil of the base card with a warning", async () => {
  const r = parseCollectionCsv("Product ID,Foil\n692998,\n533889,etched\n541332,normal")!;
  const m = await matchCsvRows(r.rows, data);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.isFoil]), [[692998, true], [533889, true], [541332, true]], "Stingcaster Mage and Ezio exist only in Foil; a Normal ask is forced to it");
  assert.equal(finishFor(CAT[0], { isFoil: null, etched: false }).isFoil, false);
  assert.equal(finishFor(CAT[6], { isFoil: true, etched: false }).warning, null, "Birds of Paradise has a Foil row: nothing to say");
  const noFoil = card(1, "Black Lotus", "LEA", "232", { f: false });
  assert.deepEqual(finishFor(noFoil, { isFoil: true, etched: false }), { isFoil: false, warning: "has no Foil version; added as non-foil" });
  const byNumber = await matchCsvRows(parseCollectionCsv("Set,Number,Foil\nMKM,155,etched")!.rows, data);
  assert.equal(byNumber.matched[0].card.id, 533889);
  assert.match(byNumber.matched[0].warning ?? "", /no Foil Etched version/);
});

test("a number needs a set, and two ordinary products sharing a set and number are never guessed", async () => {
  const r = parseCollectionCsv("Set,Number,Quantity\nMKM,155,1\n,155,1\nC21,263,1\nZZZ,1,1\nmkm,0155,2")!;
  const m = await matchCsvRows(r.rows, data);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.copy.qty]), [[533889, 3]], "leading zeros are not identity: 155 and 0155 are one entry");
  assert.equal(m.unmatched.length, 3);
  assert.match(m.unmatched[0].reason, /155 needs a set/);
  assert.match(m.unmatched[1].reason, /C21 263 is shared by 2 products/);
  assert.match(m.unmatched[2].reason, /ZZZ 1 is not a card we list/);
});

test("every unreadable line is listed with its reason, never dropped", () => {
  const text = [
    "set,number,quantity,condition,foil,language",
    "MKM,155,1,,,",
    "MKM,,1,,,",
    "MKM,155,two,,,",
    "MKM,155,1,,sparkly,",
    "MKM,155,1,Heavily Played,yes,",
    "MKM,155,1,battered,,",
    "MKM,155,1,,,Japanese",
  ].join("\n");
  const r = parseCollectionCsv(text)!;
  assert.deepEqual(
    r.skipped.map((s) => [s.line, s.reason.split(" (")[0]]),
    [
      [3, "no collector number or TCGplayer id"],
      [4, 'quantity "two" is not a whole number of 1 or more'],
      [5, 'finish "sparkly" not understood'],
      [8, 'language "Japanese": only English printings are listed'],
    ],
  );
  assert.deepEqual(r.rows.map((x) => [x.condition, x.isFoil]), [["NM", null], ["HP", true]], "the NM and battered lines merge into one entry");
  assert.equal(r.conditionDefaulted, 1, "a grade we cannot read goes in as Near Mint and is counted");
});

test("the same product, finish and condition on two lines is one entry", () => {
  const r = parseCollectionCsv("Product ID,Quantity\n238617,2\n238617,3\n496078,1")!;
  assert.deepEqual(r.rows.map((x) => [x.productId, x.qty]), [[238617, 5], [496078, 1]]);
});

test("a file without a number or product-id column is not a binder CSV (it is a pasted list)", () => {
  assert.equal(parseCollectionCsv("4 Lightning Bolt (M11) 146\n1 Sol Ring"), null);
  assert.equal(parseCollectionCsv("name,quantity\nSol Ring,2"), null);
  assert.equal(parseCollectionCsv(""), null);
});

test("an unknown product id falls back to the line's set and number, or says why", async () => {
  const r = parseCollectionCsv("Product ID,Card Number,Set\n1,267,MH2\n2,,")!;
  const m = await matchCsvRows(r.rows, data);
  assert.deepEqual(m.matched.map((x) => x.card.id), [238617]);
  assert.equal(m.unmatched[0].reason, "TCGplayer id 2 is not a Magic card we list");
});

test("a huge file is capped and the rest reported", () => {
  const lines = ["Product ID,Quantity", ...Array.from({ length: CSV_LINE_CAP + 3 }, (_, i) => `${100000 + i},1`)];
  const r = parseCollectionCsv(lines.join("\n"))!;
  assert.equal(r.rows.length, CSV_LINE_CAP);
  assert.equal(r.skippedCount, 3);
});

test("the import route reads 500 KB at most, and its writes stay inside a budget", () => {
  const route = code("src/app/api/collection/import/route.ts");
  assert.match(route, /export const maxDuration = 60/);
  assert.match(route, /readJsonBody\(req, IMPORT_MAX_TEXT_CHARS/);
  const lib = code("src/lib/collection-server.ts");
  assert.match(lib, /IMPORT_MAX_TEXT_CHARS = 500_000/);
  assert.match(lib, /WRITE_BUDGET_MS = 40_000/);
  // The free limit takes already-held cards first and reports the rest.
  assert.match(lib, /portfolioAllowance\(limitDb, account, \[\.\.\.new Set\(list\.map\(\(r\) => r\.cardId\)\)\]\)/);
  assert.match(lib, /limitSkipped: allowance\.blocked\.length/);
});

test("the export neutralises formula-leading text cells and leaves numbers alone", async () => {
  const { csvCell } = await import("../src/lib/collection-csv");
  for (const lead of ["=", "+", "-", "@", "\t"]) assert.ok(csvCell(`${lead}1+1`).replace(/^"/, "").startsWith("'"), JSON.stringify(lead));
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell("12.50"), "12.50");
  assert.equal(csvCell("-3.00"), "-3.00", "a negative amount is a number, not a formula");
  assert.equal(csvCell(-3), "-3");
  assert.equal(csvCell("Urza, Lord High Artificer"), `"Urza, Lord High Artificer"`);
  assert.equal(csvCell(null), "");
});
