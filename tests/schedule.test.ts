// The daily clock (section 6.6). Owner WP01b. The crons themselves are pinned to the workflows by tests/plane-workflows.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { DATA_GROUP, DEMAND_SNAPSHOT_CRON, IMPORT_CRONS, IMPORT_WINDOW_UTC, SQUASH_CRON, WATCHDOG_CRON, parseDailyCron } from "../src/lib/schedule";
import { RELEASE, RELEASE_CRON } from "../src/lib/release-schedule";

test("the clock: import after the sources, two retries 30 minutes apart, the overlay after the phase-2 window opens, the squash on a Sunday", () => {
  assert.deepEqual(IMPORT_CRONS.map((c) => parseDailyCron(c)), [{ minute: 25, hour: 21, weekday: null }, { minute: 55, hour: 21, weekday: null }, { minute: 25, hour: 22, weekday: null }]);
  assert.deepEqual(parseDailyCron(DEMAND_SNAPSHOT_CRON), { minute: 40, hour: 22, weekday: null }); assert.deepEqual(parseDailyCron(SQUASH_CRON), { minute: 50, hour: 23, weekday: 0 }); assert.deepEqual(parseDailyCron(WATCHDOG_CRON), { minute: 17, hour: -1, weekday: null });
  assert.equal(DATA_GROUP, "data-publish"); assert.deepEqual(IMPORT_WINDOW_UTC, { start: "21:05", end: "23:30" });
});
test("data never waits for a deploy: no data cron lands on the release weekday at the release hour", () => {
  assert.equal(RELEASE.hourUtc, 8); for (const c of [...IMPORT_CRONS, DEMAND_SNAPSHOT_CRON, SQUASH_CRON]) { const p = parseDailyCron(c)!; assert.notEqual(p.hour, RELEASE.hourUtc, c); }
  assert.notEqual(parseDailyCron(SQUASH_CRON)!.weekday, parseDailyCron(RELEASE_CRON)!.weekday, "the squash (Sunday) and the release (Tuesday) never share a day");
});
