import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CSV_LINE_CAP,
  collectionCsv,
  exportFilename,
  matchCsvRows,
  parseCollectionCsv,
  parsePrinting,
  splitCells,
  type CatalogueCard,
} from "../src/lib/collection-csv";

// ─────────────────────────────────────────────────────────────────────────────
// The printing-aware binder import — RiftCompare's tests/collection-csv.test.ts,
// rewritten for One Piece in wave 2 (2026-10-03). A line names ONE printing
// (Card.id is the TCGplayer productId): by a TCGplayer Product ID, or by card
// number plus printing, or by a bare number only when exactly one printing
// carries it. Never guessed. Real OP Compare rows below (TCGplayer ids).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CAT: CatalogueCard[] = [
  // Shanks OP01-120: standard, Parallel and Manga in Romance Dawn; a promo; PRB-01's alt, manga and reprint.
  { id: 454664, number: "OP01-120", printing: "standard", setCode: "OP01", setName: "Romance Dawn" },
  { id: 454665, number: "OP01-120", printing: "alt", setCode: "OP01", setName: "Romance Dawn" },
  { id: 454666, number: "OP01-120", printing: "manga", setCode: "OP01", setName: "Romance Dawn" },
  { id: 514047, number: "OP01-120", printing: "promo", setCode: "OP-PR", setName: "One Piece Promotion Cards" },
  { id: 586194, number: "OP01-120", printing: "alt", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 587708, number: "OP01-120", printing: "manga", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  { id: 594316, number: "OP01-120", printing: "reprint", setCode: "PRB-01", setName: "Premium Booster -The Best-" },
  // Zoro OP01-001: a Leader with a Parallel, and a second standard print in the demo deck.
  { id: 454512, number: "OP01-001", printing: "standard", setCode: "OP01", setName: "Romance Dawn" },
  { id: 454513, number: "OP01-001", printing: "alt", setCode: "OP01", setName: "Romance Dawn" },
  { id: 602789, number: "OP01-001", printing: "standard", setCode: "OP-DD", setName: "One Piece Demo Deck Cards" },
  // One printing only.
  { id: 9100001, number: "ST01-012", printing: "standard", setCode: "ST-01", setName: "Starter Deck 1: Straw Hat Crew" },
  { id: 544523, number: "EB01-001", printing: "standard", setCode: "EB-01", setName: "Extra Booster: Memorial Collection" },
  { id: 544524, number: "EB01-001", printing: "alt", setCode: "EB-01", setName: "Extra Booster: Memorial Collection" },
];

test("cells split on the delimiter, honouring quotes and doubled quotes", () => {
  assert.deepEqual(splitCells('a,"b, c","say ""hi""",e', ","), ["a", "b, c", 'say "hi"', "e"]);
  assert.deepEqual(splitCells("a\tb\t", "\t"), ["a", "b", ""]);
});

test("printing words map to OP Compare's printings; a TCGplayer finish is 'not stated'", () => {
  assert.equal(parsePrinting("Parallel"), "alt");
  assert.equal(parsePrinting("alternate art"), "alt");
  assert.equal(parsePrinting("Manga"), "manga");
  assert.equal(parsePrinting("SP"), "sp");
  assert.equal(parsePrinting("Treasure Rare"), "treasure");
  assert.equal(parsePrinting("standard"), "standard");
  assert.equal(parsePrinting("Reprint"), "reprint");
  // TCGplayer's own "Printing" column holds the FINISH, not the art.
  assert.equal(parsePrinting("Normal"), null);
  assert.equal(parsePrinting("Foil"), null);
  assert.equal(parsePrinting(""), null);
  assert.equal(parsePrinting("holographic swirl"), undefined);
});

test("a TCGplayer collection export maps exactly by Product ID, whatever the number says", () => {
  const text = [
    "Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU",
    "1,Shanks (Parallel),Shanks,Romance Dawn,OP01-120,OP01,Foil,Near Mint Foil,English,Secret Rare,454665,123",
    "2,Roronoa Zoro,Roronoa Zoro,Romance Dawn,OP01-001,OP01,Normal,Lightly Played,English,Leader,454512,124",
    "0,Nami,Nami,Romance Dawn,OP01-016,OP01,Normal,Near Mint,English,Rare,453500,125",
  ].join("\n");
  const r = parseCollectionCsv(text)!;
  assert.ok(r);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.rows.map((x) => [x.productId, x.qty, x.condition]), [[454665, 1, "NM"], [454512, 2, "LP"]], "a 0-quantity row is a product they don't hold");
  const m = matchCsvRows(r.rows, CAT);
  assert.deepEqual(m.matched.map((x) => x.card.id), [454665, 454512]);
  assert.deepEqual(m.unmatched, []);
});

test("our own export round-trips into the same printings, and its TOTAL row is not a skipped line", () => {
  const rows = [
    { name: "Shanks", setCode: "OP01", number: "OP01-120", printing: "manga", condition: "NM", isFoil: true, quantity: 1, unitCents: 25000, costBasisCents: null, note: null, tcgplayerId: 454666 },
    { name: "Shanks", setCode: "PRB-01", number: "OP01-120", printing: "reprint", condition: "LP", isFoil: true, quantity: 2, unitCents: 1000, costBasisCents: 900, note: "trade, \"mint\"", tcgplayerId: 594316 },
  ];
  const csv = collectionCsv(rows, "USD");
  assert.match(csv.split("\n")[0], /^name,set,number,printing,condition,foil,quantity,unit_usd,value_usd,paid_each_usd,note,tcgplayer_id$/);
  assert.match(csv, /\nTOTAL,,,,,,,,270\.00,,,\n$/);
  const r = parseCollectionCsv(csv)!;
  assert.deepEqual(r.skipped, []);
  const m = matchCsvRows(r.rows, CAT);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.copy.qty, x.copy.condition, x.copy.isFoil]), [[454666, 1, "NM", true], [594316, 2, "LP", true]]);
  assert.equal(exportFilename(new Date("2026-10-03T12:00:00Z")), "opcompare-binder-2026-10-03.csv");
});

test("number + printing names one printing; a set column narrows a number printed in two sets", () => {
  const text = [
    "number,printing,set,qty",
    "OP01-120,Parallel,OP01,1",
    "OP01-120,Manga,OP01,1",
    "OP01-120,reprint,,3",
    "OP01-001,standard,OP-DD,1",
    "OP01-001,standard,,1",
  ].join("\n");
  const r = parseCollectionCsv(text)!;
  const m = matchCsvRows(r.rows, CAT);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.copy.qty]), [[454665, 1], [454666, 1], [594316, 3], [602789, 1]]);
  assert.equal(m.unmatched.length, 1);
  assert.match(m.unmatched[0].reason, /OP01-001 has 2 printings \(Standard\)/);
});

test("a bare number matches only when exactly one printing carries it — never a guess", () => {
  const r = parseCollectionCsv("card number,quantity\nST01-012,4\nOP01-120,1\nEB01-001,1\nOP99-999,1")!;
  const m = matchCsvRows(r.rows, CAT);
  assert.deepEqual(m.matched.map((x) => [x.card.id, x.copy.qty]), [[9100001, 4]]);
  assert.deepEqual(
    m.unmatched.map((x) => x.reason),
    [
      "OP01-120 has 7 printings (Standard, Parallel, Manga, Promo, Reprint); add a printing column or a TCGplayer Product ID",
      "EB01-001 has 2 printings (Standard, Parallel); add a printing column or a TCGplayer Product ID",
      "OP99-999 is not a card we track",
    ],
  );
});

test("every unreadable line is listed with its reason, never dropped", () => {
  const text = ["number,printing,quantity,condition,foil", "OP01-120,glitter,1,,", ",standard,1,,", "OP01-120,Parallel,two,,", "OP01-120,Parallel,1,,sparkly", "nonsense,standard,1,,", "OP01-120,Parallel,1,Heavily Played,yes", "OP01-120,Parallel,1,battered,"].join("\n");
  const r = parseCollectionCsv(text)!;
  assert.deepEqual(
    r.skipped.map((s) => [s.line, s.reason.split(" (")[0]]),
    [
      [2, 'printing "glitter" not understood'],
      [3, "no card number or TCGplayer id"],
      [4, 'quantity "two" is not a whole number of 1 or more'],
      [5, 'foil "sparkly" not understood'],
      [6, 'card number "nonsense" not understood'],
    ],
  );
  assert.deepEqual(r.rows.map((x) => [x.condition, x.isFoil]), [["HP", true], ["NM", null]]);
  assert.equal(r.conditionDefaulted, 1, "a grade we cannot read goes in as Near Mint and is counted");
});

test("the same printing and condition on two lines is one entry", () => {
  const r = parseCollectionCsv("Product ID,Quantity\n454665,2\n454665,3\n454664,1")!;
  assert.deepEqual(r.rows.map((x) => [x.productId, x.qty]), [[454665, 5], [454664, 1]]);
});

test("a file without a number or product-id column is not a printing CSV (it is a pasted list)", () => {
  assert.equal(parseCollectionCsv("4 Monkey.D.Luffy\n1 OP01-120 Shanks (Parallel)"), null);
  assert.equal(parseCollectionCsv("name,quantity\nNami,2"), null);
  assert.equal(parseCollectionCsv(""), null);
});

test("an unknown product id falls back to the line's number, or says why", () => {
  const r = parseCollectionCsv("Product ID,Card Number,Printing,Set\n1,OP01-120,Parallel,OP01\n2,,,")!;
  const m = matchCsvRows(r.rows, CAT);
  assert.deepEqual(m.matched.map((x) => x.card.id), [454665]);
  assert.equal(m.unmatched[0].reason, "TCGplayer id 2 is not a One Piece card we track");
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
  assert.equal(csvCell("Shanks, the Red-Haired"), `"Shanks, the Red-Haired"`);
  assert.equal(csvCell(null), "");
});
