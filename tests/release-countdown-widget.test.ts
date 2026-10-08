import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil } from "../src/app/embed/release-countdown/route";

test("daysUntil counts whole UTC days and never goes negative", () => {
  assert.equal(daysUntil("2026-10-15", new Date("2026-10-08T23:59:00Z")), 7);
  assert.equal(daysUntil("2026-10-08", new Date("2026-10-08T01:00:00Z")), 0);
  assert.equal(daysUntil("2026-10-01", new Date("2026-10-08T01:00:00Z")), 0);
});
