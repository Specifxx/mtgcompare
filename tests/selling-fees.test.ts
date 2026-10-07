import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeFees, parseRate, type FeeInputs } from "../src/lib/selling-fees";

// RiftCompare's selling-fee tests (tests/free-tools-correctness.test.ts there),
// for the calculator ported verbatim to /tools/selling-fees.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (p: string) =>
  read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const base: FeeInputs = {
  price: 40,
  shipCharged: 1,
  shipCost: 0.8,
  commissionPct: 13.25,
  processingPct: 0,
  fixedFee: 0.3,
  commissionBase: "itemPlusShipping",
};

test("Selling fees: eBay's final value fee is charged on item + shipping", () => {
  const r = computeFees(base);
  assert.equal(r.commissionBaseAmount, 41);
  assert.ok(Math.abs(r.commission - 0.1325 * 41) < 1e-9);
  assert.ok(Math.abs(r.net - (41 - 0.1325 * 41 - 0.3 - 0.8)) < 1e-9);
  // TCGplayer's commission stays on the item price.
  const tcg = computeFees({ ...base, commissionBase: "item" });
  assert.equal(tcg.commissionBaseAmount, 40);
  assert.ok(r.net < tcg.net, "charging shipping too can only lower the payout");
});

test("Selling fees: no net payout until the commission is entered", () => {
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("  "), null);
  assert.equal(parseRate("0"), 0, "0% is an answer; blank is not");
  assert.equal(computeFees({ ...base, commissionPct: null }).complete, false);
  assert.equal(computeFees({ ...base, commissionPct: 0 }).complete, true);
  const ui = codeOnly("src/components/FeeCalculator.tsx");
  assert.match(ui, /calc\.complete \?/);
  assert.match(ui, /Enter your commission/);
  assert.match(ui, /commissionBase: "itemPlusShipping"/, "the eBay preset");
});

test("Selling fees: processing is on item + shipping, the fixed fee once, effective % of the sale price", () => {
  const r = computeFees({ price: 40, shipCharged: 1, shipCost: 0.8, commissionPct: 10, processingPct: 2.9, fixedFee: 0.3, commissionBase: "item" });
  assert.ok(Math.abs(r.processing - (0.029 * 41 + 0.3)) < 1e-9);
  assert.ok(Math.abs(r.totalFees - (4 + 0.029 * 41 + 0.3)) < 1e-9);
  assert.ok(Math.abs(r.effectiveFeePct - ((r.totalFees + 0.8) / 40) * 100) < 1e-9);
  assert.equal(computeFees({ ...base, price: 0, shipCharged: 0 }).effectiveFeePct, 0, "no NaN on an empty sale");
});

test("Selling fees: the presets are TCGplayer, eBay and another marketplace; the commission is never pre-filled", () => {
  const ui = codeOnly("src/components/FeeCalculator.tsx");
  assert.match(ui, /tcgplayer: \{/);
  assert.match(ui, /ebay: \{/);
  assert.match(ui, /custom: \{/);
  assert.match(ui, /useState\(""\)/, "commission starts blank");
  assert.match(ui, /setCommissionPct\(""\)/, "switching marketplace clears it");
  assert.match(read("src/app/tools/selling-fees/page.tsx"), /export const revalidate = 86400/);
});
