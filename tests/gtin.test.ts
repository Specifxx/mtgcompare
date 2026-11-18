import { test } from "node:test";
import assert from "node:assert/strict";
import { gtinLabel, gtinLd, normaliseGtin, uniqueGtins } from "../src/lib/gtin";

test("valid barcodes are kept, broken ones refused", () => {
  assert.equal(normaliseGtin("0820650806513"), "0820650806513"); // Pokémon Sword & Shield booster box (EAN-13)
  assert.equal(normaliseGtin("820650806513"), "820650806513"); // the same as a UPC-A
  assert.equal(normaliseGtin("4573102630483"), "4573102630483"); // a Gunpla JAN
  assert.equal(normaliseGtin("45496596477"), "045496596477"); // a UPC that lost its leading zero
  assert.equal(normaliseGtin("0820650806514"), null); // wrong check digit
  assert.equal(normaliseGtin("12345"), null);
  assert.equal(normaliseGtin("0000000000000"), null);
  assert.equal(normaliseGtin(null), null);
  assert.equal(normaliseGtin(" 0820-6508-06513 "), "0820650806513");
});

test("structured data names the right GTIN property", () => {
  assert.deepEqual(gtinLd("820650806513"), { gtin12: "820650806513" });
  assert.deepEqual(gtinLd("0820650806513"), { gtin13: "0820650806513" });
  assert.deepEqual(gtinLd(null), {});
  assert.equal(gtinLabel("820650806513"), "UPC");
  assert.equal(gtinLabel("0820650806513"), "EAN");
});

test("a barcode two products share is dropped from both", () => {
  const ps: { id: number; upc?: string }[] = [{ id: 1, upc: "0820650806551" }, { id: 2, upc: "0820650806551" }, { id: 3, upc: "0820650806513" }];
  uniqueGtins(ps);
  assert.equal(ps[0].upc, undefined);
  assert.equal(ps[1].upc, undefined);
  assert.equal(ps[2].upc, "0820650806513");
});
