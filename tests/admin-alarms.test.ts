// The admin traffic lights (src/lib/admin-alarms.ts, section 15). Owner WP21.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DB_TARGET_BYTES, dbLevel, deployLevel, fileCountChange, freshness, releaseBurst, repoSize, spendLevel, worst } from "../src/lib/admin-alarms";

const NOW = new Date("2026-10-08T12:00:00Z");
test("published-data freshness: green under 26 h, amber from 26, red from 36, grey when unreadable", () => {
  assert.equal(freshness("2026-10-08T00:00:00Z", NOW).level, "ok");
  assert.equal(freshness("2026-10-07T09:00:00Z", NOW).level, "warn");     // 27 h
  assert.equal(freshness("2026-10-06T23:00:00Z", NOW).level, "bad");      // 37 h
  assert.deepEqual(freshness(null, NOW), { level: "unknown", ageHours: null });
  assert.equal(freshness("not a date", NOW).level, "unknown");
});
test("a published file set that shrinks is a failed read", () => {
  assert.deepEqual(fileCountChange(1000, 880), { level: "bad", pct: -12 });
  assert.equal(fileCountChange(1000, 940).level, "warn");
  assert.equal(fileCountChange(1000, 1200).level, "ok");
  assert.equal(fileCountChange(null, 5).level, "unknown");
});
test("repository budget and the days left", () => {
  assert.deepEqual(repoSize(500, 1000, 10), { level: "ok", usedPct: 50, daysLeft: 50 });
  assert.equal(repoSize(750, 1000, 10).level, "warn");
  assert.equal(repoSize(950, 1000, null).level, "bad");
  assert.equal(repoSize(null, 1000, 1).level, "unknown");
});
test("eBay spend against the cap", () => {
  assert.equal(spendLevel(500, 1000).level, "ok");
  assert.equal(spendLevel(900, 1000).level, "warn");
  assert.equal(spendLevel(1001, 1000).level, "bad");
  assert.equal(spendLevel(null, 1000).level, "unknown");
});
test("Neon private tables against the 100 MB target", () => {
  assert.equal(dbLevel(40 * 1024 * 1024).level, "ok");
  assert.equal(dbLevel(70 * 1024 * 1024).level, "warn");
  assert.equal(dbLevel(DB_TARGET_BYTES).level, "bad");
  assert.equal(dbLevel(undefined).level, "unknown");
});
test("deployment age is amber, never red; a release burst is the Rift burn", () => {
  assert.deepEqual([deployLevel(3), deployLevel(8), deployLevel(40), deployLevel(null)], ["ok", "warn", "warn", "unknown"]);
  assert.deepEqual([releaseBurst(1), releaseBurst(2), releaseBurst(3), releaseBurst(null)], ["ok", "warn", "bad", "unknown"]);
});
test("worst() never reports green over an unreadable input", () => {
  assert.equal(worst(["ok", "unknown"]), "unknown");
  assert.equal(worst(["ok", "warn", "unknown"]), "warn");
  assert.equal(worst(["ok", "bad", "warn"]), "bad");
  assert.equal(worst([]), "ok");
});
