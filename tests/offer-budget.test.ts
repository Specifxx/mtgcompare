// budgetOffers (src/lib/import.ts, 2026-10-17): under OFFER_ROWS_BUDGET every unit keeps its cheapest live offers in every market before a dearer unit gets more. Before, the cheapest UNITS
// lost every row, so Sol Ring, Lightning Bolt and Swords to Plowshares showed TCGplayer only.
import test from "node:test";
import assert from "node:assert/strict";
import { OFFER_FLOOR_PER_MARKET, budgetOffers } from "../src/lib/import";
import type { OfferTuple } from "../src/lib/data/plane/formats";

const o = (uid: number, market: number, store: number, cents: number, inStock: 0 | 1 = 1): OfferTuple => [uid, market, store, cents, 0, inStock, `/${uid}/${store}`];
const live = (t: OfferTuple) => t[5] === 1;
const value = (v: Record<number, number>) => (uid: number) => v[uid] ?? 0;

test("under budget nothing changes", () => {
  const rows = [o(2, 0, 10, 100), o(2, 0, 11, 90)];
  assert.deepEqual(budgetOffers(rows, 10, value({}), live), rows);
});

test("a cheap card keeps its 3 cheapest live offers per market; the dear card gets the rest of the budget", () => {
  const cheap = [10, 11, 12, 13, 14, 15].map((s, i) => o(2, 0, s, 100 + i));           // Sol Ring: 6 US stores
  const cheapCa = [20, 21].map((s, i) => o(2, 4, s, 150 + i));                            // and 2 Canadian ones
  const dear = [30, 31, 32, 33, 34, 35, 36, 37].map((s, i) => o(4, 0, s, 9000 + i));    // The One Ring: 8 US stores
  const kept = budgetOffers([...cheap, ...cheapCa, ...dear], 12, value({ 2: 124, 4: 11020 }), live);
  assert.equal(kept.length, 12);
  assert.deepEqual(kept.filter((r) => r[0] === 2 && r[1] === 0).map((r) => r[2]), [10, 11, 12], "the cheap card's 3 cheapest US stores");
  assert.equal(kept.filter((r) => r[0] === 2 && r[1] === 4).length, 2, "and both Canadian ones");
  assert.equal(kept.filter((r) => r[0] === 4).length, 7, "the floor (3) plus 4 of the rest go to the dearest card");
  assert.equal(OFFER_FLOOR_PER_MARKET, 3);
});

test("a live offer beats a cheaper out-of-stock one for the floor; the floor shrinks to 2, then 1, when it alone is over budget", () => {
  const rows = [o(2, 0, 10, 50, 0), o(2, 0, 11, 100), o(2, 0, 12, 110), o(2, 0, 13, 120), o(6, 0, 20, 300), o(6, 0, 21, 310), o(6, 0, 22, 320)];
  const k3 = budgetOffers(rows, 6, value({ 2: 100, 6: 300 }), live);
  assert.deepEqual(k3.filter((r) => r[0] === 2).map((r) => r[2]), [11, 12, 13], "live first");
  const k2 = budgetOffers(rows, 4, value({ 2: 100, 6: 300 }), live);
  assert.deepEqual(k2.map((r) => `${r[0]}:${r[2]}`).sort(), ["2:11", "2:12", "6:20", "6:21"]);
  const k1 = budgetOffers(rows, 2, value({ 2: 100, 6: 300 }), live);
  assert.deepEqual(k1.map((r) => `${r[0]}:${r[2]}`).sort(), ["2:11", "6:20"]);
});

test("if even one offer per unit and market is over budget, the dearest units keep theirs", () => {
  const rows = [o(2, 0, 10, 100), o(4, 0, 10, 100), o(6, 0, 10, 100)];
  assert.deepEqual(budgetOffers(rows, 2, value({ 2: 10, 4: 500, 6: 300 }), live).map((r) => r[0]).sort(), [4, 6]);
});
