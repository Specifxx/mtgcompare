import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseCondition, playedDiscounts, playedDiscountText, type ConditionListing } from "../src/lib/played-discount";

// RiftCompare's played-listing tests (tests/free-tools-correctness.test.ts
// there), for lib/played-discount.ts copied verbatim.

const row = (id: string, condition: string | null, priceCents: number, isFoil = false): ConditionListing => ({ id, condition, isFoil, priceCents });

test("Played listing: 'LP · 22% under the cheapest NM here', from the page's own listings", () => {
  const d = playedDiscounts([
    row("nm1", "Near Mint", 1_000),
    row("nm2", "NM", 1_200),
    row("lp", "Lightly Played", 780),
    row("mp", "MP", 1_050),
    row("hp", "Heavily Played", 1_000),
  ]);
  assert.equal(d.get("lp")?.grade, "LP");
  assert.equal(d.get("lp")?.pctUnder, 22);
  assert.equal(d.get("lp")?.cheapestNmCents, 1_000);
  assert.equal(playedDiscountText(d.get("lp")!), "22% under the cheapest NM here");
  assert.equal(playedDiscountText(d.get("mp")!), "costs more than the cheapest NM here");
  assert.equal(playedDiscountText(d.get("hp")!), "same price as the cheapest NM here");
  assert.equal(d.has("nm1"), false, "NM rows carry no note");
});

test("Played listing: only against an NM copy of the same finish, and only when one exists", () => {
  const d = playedDiscounts([row("nm", "NM", 1_000), row("lpFoil", "LP", 1_500, true), row("odd", "Default Title", 500)]);
  assert.equal(d.has("lpFoil"), false);
  assert.equal(d.has("odd"), false, "an unreadable condition is not 'played'");
  assert.equal(playedDiscounts([row("lp", "LP", 800)]).size, 0, "no NM in this market, no note");
  const foil = playedDiscounts([row("nmF", "NM", 2_000, true), row("lpF", "LP", 1_500, true)]);
  assert.equal(foil.get("lpF")?.pctUnder, 25);
});

test("Played listing: OP Compare's stored grades (lib/match.ts conditionLabel) read unchanged", () => {
  for (const g of ["NM", "LP", "MP", "HP", "DMG"] as const) assert.equal(normaliseCondition(g), g);
  assert.equal(normaliseCondition(null), null);
  assert.equal(normaliseCondition("Near Mint or Better"), "NM");
});

test("Played listing: no 'typical discount' from a fixed condition table", () => {
  const d = playedDiscounts([row("nm", "NM", 1_000), row("lp", "LP", 780)]).get("lp")!;
  assert.deepEqual(Object.keys(d).sort(), ["cheapestNmCents", "grade", "pctUnder"]);
  const src = readFileSync(join(process.cwd(), "src/lib/played-discount.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /CONDITION_MULTIPLIER/);
});
