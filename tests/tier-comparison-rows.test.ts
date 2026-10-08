// The three paid-analytics rows of TIER_COMPARISON (Deal Finder, Rising Cards, Demand Finder) are written from gateMatrix()
// (src/lib/premium-gates.ts) in src/lib/plans.ts. This test reads the CELLS back into numbers and fails when the table and the gates
// disagree, so a change to a tier-limits constant, a minTier or a hand-edited row is caught here and not by a visitor.
import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_FEATURES, TIER_COMPARISON, paidToolRows, type TierRow } from "../src/lib/plans";
import { FEATURES, FEATURE_RULES, gateMatrix, type Feature } from "../src/lib/premium-gates";
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "../src/lib/tier-limits";

const ROW: Record<Feature, string> = { "deal-finder": "Deal Finder", rising: "Rising Cards", demand: "Demand Finder — most searched & viewed cards" };
const row = (f: Feature): TierRow => {
  const r = TIER_COMPARISON.find((x) => x.feature === ROW[f]);
  assert.ok(r, `${f}: no row named "${ROW[f]}"`);
  return r!;
};
/** A table cell read back as the number of rows it promises: "Top 3" and "Top 10 searched" are counts, a tick or "Full list…" is everything, a dash is none. */
function promised(cell: boolean | string): number | "all" {
  if (cell === true) return "all";
  if (cell === false) return 0;
  const top = /^Top (\d+)( searched)?$/.exec(cell);
  if (top) return Number(top[1]);
  if (/^Full list/.test(cell)) return "all";
  assert.fail(`a cell the test cannot read: "${cell}"`);
}

test("each paid-analytics row promises exactly what gateMatrix() gives a free account, Plus and Premium", () => {
  for (const m of gateMatrix()) {
    const r = row(m.feature);
    assert.deepEqual([promised(r.account), promised(r.plus), promised(r.premium)], [m.free, m.plus, m.premium], m.feature);
  }
});

test("the three rows are the three features of the gate module, in OP's positions", () => {
  assert.deepEqual(gateMatrix().map((m) => m.feature), [...FEATURES]);
  const at = (f: Feature) => TIER_COMPARISON.findIndex((x) => x.feature === ROW[f]);
  assert.deepEqual([at("deal-finder"), at("rising"), at("demand")], [7, 8, 14]);
  assert.equal(TIER_COMPARISON.length, 18);
});

test("the owner's split: Deal Finder from Plus, Rising Cards and Demand Finder from Premium (2026-10-08)", () => {
  assert.deepEqual([row("deal-finder").account, row("deal-finder").plus, row("deal-finder").premium], [`Top ${FREE_DEAL_ROWS}`, "Full list + only my cards", "Full list + only my cards"]);
  assert.deepEqual([row("rising").account, row("rising").plus, row("rising").premium], [`Top ${FREE_RISING_ROWS}`, `Top ${FREE_RISING_ROWS}`, "Full list"]);
  assert.deepEqual([row("demand").account, row("demand").plus, row("demand").premium], [`Top ${FREE_DEMAND_ROWS} searched`, `Top ${FREE_DEMAND_ROWS} searched`, true]);
  assert.deepEqual(FEATURES.map((f) => FEATURE_RULES[f].minTier), ["plus", "premium", "premium"]);
});

test("a feature a tier does NOT get in full never reads as full in that column", () => {
  for (const f of FEATURES) {
    const r = row(f), min = FEATURE_RULES[f].minTier;
    if (min === "premium") assert.notEqual(promised(r.plus), "all", `${f}: Plus does not unlock the full list`);
    assert.equal(promised(r.premium), "all", `${f}: Premium (and an admin) gets everything`);
    assert.notEqual(promised(r.account), "all", `${f}: a free account never reads as full`);
  }
});

test("the pricing bullets name the tool of their tier", () => {
  assert.ok(PLAN_FEATURES.plus.some((b) => /Deal Finder/.test(b)), "Plus names Deal Finder");
  assert.ok(!PLAN_FEATURES.plus.some((b) => /Rising|Demand/.test(b)), "Plus does not promise the two Premium tools");
  assert.ok(PLAN_FEATURES.premium.some((b) => /Rising Cards/.test(b) && /Demand Finder/.test(b)), "Premium names both of its tools");
});

test("the 'three paid tools' table of /premium (and docs/premium-gates.md) says the same as the gate, column by column", () => {
  const rows = paidToolRows();
  assert.deepEqual(rows.map((r) => r.feature), [...FEATURES]);
  assert.deepEqual(rows.map((r) => [r.label, r.path, r.from]), [["Deal Finder", "/tools/deal-finder", "Plus"], ["Rising Cards", "/tools/rising", "Premium"], ["Demand Finder", "/tools/demand", "Premium"]]);
  const by = Object.fromEntries(rows.map((r) => [r.feature, r]));
  // signed out: a COUNT of deals and a locked preview, never a row; Demand Finder shows everyone the strip /movers shows
  assert.deepEqual([by["deal-finder"]!.signedOut, by.rising!.signedOut, by.demand!.signedOut], ["Deal count", "Preview", `Top ${FREE_DEMAND_ROWS} searched`]);
  assert.deepEqual([by["deal-finder"]!.free, by.rising!.free, by.demand!.free], [`Top ${FREE_DEAL_ROWS}`, `Top ${FREE_RISING_ROWS}`, `Top ${FREE_DEMAND_ROWS} searched`]);
  assert.deepEqual([by["deal-finder"]!.plus, by.rising!.plus, by.demand!.plus], ["Every deal", `Top ${FREE_RISING_ROWS}`, `Top ${FREE_DEMAND_ROWS} searched`]);
  assert.deepEqual([by["deal-finder"]!.premium, by.rising!.premium, by.demand!.premium], ["Every deal", "Full list", `Top ${PREMIUM_DEMAND_ROWS} searched & viewed`]);
  const m = gateMatrix().map((g) => g.feature);
  assert.deepEqual(rows.map((r) => r.feature), m, "one line per gated feature, in the gate's order");
});
