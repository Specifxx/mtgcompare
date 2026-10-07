import test from "node:test";
import assert from "node:assert/strict";
import {
  SET_GAP_CHUNK,
  encodeCursor,
  missingIn,
  nextChunkLabel,
  nothingStockedMessage,
  parseCursor,
  planSetGap,
  preReleaseGapMessage,
  revealedWithoutListing,
  setGapFields,
  setGapNote,
} from "../src/lib/set-gap";
import type { ChecklistCard } from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// FINISH THIS SET, the pure half — RiftCompare's tests/set-gap.test.ts, ported
// in wave 2 (2026-10-03) with OP Compare's Int ids and "OP01-120" numbers. The
// /api/basket source=set branch is the tools track's file; its route checks
// live with that route.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: number, n: number, minCents: number | null, extra: Partial<ChecklistCard> = {}): ChecklistCard => ({
  id,
  slug: `c${id}`,
  name: `Card ${n}`,
  number: `OP01-${String(n).padStart(3, "0")}`,
  variant: null,
  printing: "standard",
  rarity: "C",
  setCode: "OP01",
  hasImage: true,
  isPromo: false,
  minCents,
  stores: minCents == null ? 0 : 1,
  otherSource: false,
  ...extra,
});

test("the gap is the set in scope minus what the account owns; a stray promo never", () => {
  const cards = [c(1, 1, 100), c(2, 2, 200), c(3, 2, 900, { printing: "alt" }), c(4, 3, 50, { printing: "promo", isPromo: true })];
  const base = missingIn(cards, { "1": 1 }, { scope: "base" });
  assert.deepEqual(base.missing.map((x) => x.id), [2]);
  assert.equal(base.ownedInScope, 1);
  const all = missingIn(cards, { "1": 1 }, { scope: "all" });
  assert.deepEqual(all.missing.map((x) => x.id), [2, 3]);
});

test("a rarity filter narrows both what is owned and what is missing", () => {
  const cards = [c(1, 1, 100, { rarity: "SR" }), c(2, 2, 200), c(3, 3, 300, { rarity: "SR" })];
  const r = missingIn(cards, { "1": 1 }, { scope: "base", rarity: "SR" });
  assert.deepEqual(r.missing.map((x) => x.id), [3]);
  assert.equal(r.ownedInScope, 1);
});

test("a card no real store has is reported as not stocked, never dropped and never priced", () => {
  const cards = [c(1, 1, 100), c(2, 2, null, { otherSource: true }), c(3, 3, null)];
  const p = planSetGap("OP01", cards, {}, { scope: "base" });
  assert.deepEqual(p.chunk.map((x) => x.id), [1]);
  assert.deepEqual(p.notStocked.map((x) => x.id), [2, 3]);
  assert.equal(p.summary.notStockedCount, 2);
  assert.equal(revealedWithoutListing(cards), 2);
});

test(`a gap over ${SET_GAP_CHUNK} is a ranked chunk with a cursor to the next, nothing lost or repeated`, () => {
  const cards = Array.from({ length: SET_GAP_CHUNK + 30 }, (_, i) => c(1000 + i, i + 1, 10 + i));
  const first = planSetGap("OP01", cards, {}, { scope: "base" });
  assert.equal(first.chunk.length, SET_GAP_CHUNK);
  assert.equal(first.summary.moreAfter, 30);
  assert.equal(setGapNote(first.summary), `Your ${SET_GAP_CHUNK} cheapest missing cards. 30 more not included.`);
  assert.equal(nextChunkLabel(first.summary), "Plan the next 30");
  const second = planSetGap("OP01", cards, {}, { scope: "base", after: parseCursor(first.summary.nextCursor) });
  assert.equal(second.chunk.length, 30);
  assert.equal(second.summary.nextCursor, null);
  const ids = new Set([...first.chunk, ...second.chunk].map((x) => x.id));
  assert.equal(ids.size, SET_GAP_CHUNK + 30, "every card exactly once");
  assert.equal(setGapNote(second.summary), "The next 30 cheapest missing cards. That is all of the rest.");
});

test("the next chunk follows a CURSOR, not a rank: a card bought between two clicks skips nothing", () => {
  const cards = Array.from({ length: SET_GAP_CHUNK + 5 }, (_, i) => c(1000 + i, i + 1, 10 + i));
  const first = planSetGap("OP01", cards, {}, { scope: "base" });
  const after = parseCursor(first.summary.nextCursor);
  const second = planSetGap("OP01", cards, { "1000": 1, "1001": 1 }, { scope: "base", after });
  assert.deepEqual(second.chunk.map((x) => x.id), [1000 + SET_GAP_CHUNK, 1001 + SET_GAP_CHUNK, 1002 + SET_GAP_CHUNK, 1003 + SET_GAP_CHUNK, 1004 + SET_GAP_CHUNK]);
});

test("a cursor with nothing after it while cards remain starts again from the cheapest and says so", () => {
  const cards = [c(1, 1, 100), c(2, 2, 200)];
  const p = planSetGap("OP01", cards, {}, { scope: "base", after: { cents: 99999, number: "OP01-999", printing: "standard", id: 9 } });
  assert.equal(p.summary.restarted, true);
  assert.deepEqual(p.chunk.map((x) => x.id), [1, 2]);
  assert.match(setGapNote(p.summary)!, /starts again from the cheapest/);
});

test("cursors round-trip and anything that is not exactly one is the first chunk", () => {
  const k = { cents: 1234, number: "OP01-120", printing: "alt", id: 454665 };
  assert.deepEqual(parseCursor(encodeCursor(k)), k);
  assert.deepEqual(parseCursor(encodeCursor({ cents: 1, number: null, printing: "don", id: 5 })), { cents: 1, number: null, printing: "don", id: 5 });
  for (const bad of [null, 5, "", "1|2", "x|OP01-001|standard|1", "1|OP01-001|standard|abc"]) assert.equal(parseCursor(bad), null);
});

test("equal prices break by card number, then printing, whatever order the catalogue arrives in", () => {
  const cards = [c(3, 5, 100, { printing: "alt" }), c(2, 5, 100), c(1, 9, 100)];
  assert.deepEqual(planSetGap("OP01", cards, {}, { scope: "all" }).chunk.map((x) => x.id), [2, 3, 1]);
  assert.deepEqual(planSetGap("OP01", [...cards].reverse(), {}, { scope: "all" }).chunk.map((x) => x.id), [2, 3, 1]);
});

test("a per-card ceiling leaves out the dearer cards, and says how many", () => {
  const p = planSetGap("OP01", [c(1, 1, 100), c(2, 2, 5000)], {}, { scope: "base", maxPriceCents: 1000 });
  assert.deepEqual(p.chunk.map((x) => x.id), [1]);
  assert.equal(p.summary.overCeiling, 1);
});

test("ranking uses the price the plan pays at the floor; an unpriceable card never takes a slot", () => {
  const cards = [c(1, 1, 100), c(2, 2, 200), c(3, 3, 300)];
  const prices = new Map([
    [1, { floorCents: 900, anyCents: 100 }],
    [2, { floorCents: null, anyCents: 200 }],
  ]);
  const p = planSetGap("OP01", cards, {}, { scope: "base", prices });
  assert.deepEqual(p.chunk.map((x) => [x.id, x.minCents]), [[1, 900]]);
  assert.equal(p.summary.belowFloorCount, 1);
  assert.equal(p.summary.noPostageCount, 1);
});

test("a non-Premium answer carries counts only: no store, line or card name", () => {
  const p = planSetGap("OP01", [c(1, 1, null)], {}, { scope: "base" });
  const answer = { summary: p.summary, setName: "Romance Dawn", notStocked: [{ name: "Card 1", setCode: "OP01", number: "OP01-001" }] };
  assert.deepEqual(Object.keys(setGapFields(false, answer)), ["setGap"]);
  assert.deepEqual(Object.keys(setGapFields(true, answer)), ["setGap", "setName", "notStocked"]);
});

test("the refusals name counts, never a denominator", () => {
  assert.equal(nothingStockedMessage(3, "the United States"), "None of the 3 cards you're missing has a store listing in the United States right now.");
  assert.equal(preReleaseGapMessage("OP-15", 12), "OP-15 isn't out yet, so there is nothing to order. 12 revealed cards have no store listing yet.");
});
