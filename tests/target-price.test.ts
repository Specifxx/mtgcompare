// RiftCompare's target-price unit tests (tests/target-alert-route.test.ts, the
// pure half), ported in wave 2 (2026-10-03).
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TARGET_CENTS, MIN_TARGET_CENTS, centsToInput, clampTargetCents, honouredTargetIds, parseMoneyInput } from "../src/lib/target-price";

test("the field's number rules: whole cents, every currency format, clamp 1..10,000,000", () => {
  assert.equal(MIN_TARGET_CENTS, 1);
  assert.equal(MAX_TARGET_CENTS, 10_000_000);
  assert.equal(parseMoneyInput("12"), 1200);
  assert.equal(parseMoneyInput("12.5"), 1250);
  assert.equal(parseMoneyInput("$12.50"), 1250);
  assert.equal(parseMoneyInput("A$ 1,200.00"), 120000);
  assert.equal(parseMoneyInput("S$ 9.99"), 999);
  assert.equal(parseMoneyInput("12,50"), 1250, "a decimal comma (EU)");
  assert.equal(parseMoneyInput("€ 7,5"), 750);
  assert.equal(parseMoneyInput(""), null, "empty clears");
  assert.equal(parseMoneyInput("abc"), null);
  assert.equal(clampTargetCents(0), 1);
  assert.equal(clampTargetCents(-50), 1);
  assert.equal(clampTargetCents(12.4), 12);
  assert.equal(clampTargetCents(MAX_TARGET_CENTS * 3), MAX_TARGET_CENTS);
  assert.equal(centsToInput(1250), "12.50");
  assert.equal(centsToInput(null), "");
  assert.equal(centsToInput(undefined), "");
});

test("honouredTargetIds: the oldest watches' targets win, ties broken by id; none when not entitled", () => {
  const rows = [
    { id: "c", targetCents: 100, createdAt: "2026-09-03T00:00:00.000Z" },
    { id: "a", targetCents: 100, createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "x", targetCents: null, createdAt: "2026-08-01T00:00:00.000Z" }, // no target: never counted
    { id: "b2", targetCents: 100, createdAt: "2026-09-02T00:00:00.000Z" },
    { id: "b1", targetCents: 100, createdAt: "2026-09-02T00:00:00.000Z" }, // same createMany as b2
  ];
  assert.deepEqual([...honouredTargetIds(rows, 2)].sort(), ["a", "b1"]);
  assert.deepEqual([...honouredTargetIds(rows, 3)].sort(), ["a", "b1", "b2"]);
  assert.equal(honouredTargetIds(rows, Number.POSITIVE_INFINITY).size, 4, "Premium: every target");
  assert.equal(honouredTargetIds(rows, 0).size, 0, "not entitled: none");
  const asDates = rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
  assert.deepEqual([...honouredTargetIds(asDates, 2)].sort(), ["a", "b1"]);
});
