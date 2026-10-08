// lastActiveAt / activeDays (lib/activity.ts) — RiftCompare's activity tests,
// with UTC days (MTG Compare's import and history are UTC throughout).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activityUpdate, ACTIVITY_STAMP_INTERVAL_MS, utcDay } from "../src/lib/activity";

const at = (iso: string) => new Date(iso);

test("a first-ever visit starts the count", () => {
  const r = activityUpdate({ lastActiveAt: null, activeDays: 0 }, at("2026-10-03T02:00:00Z"));
  assert.equal(r?.activeDays?.increment, 1);
  assert.deepEqual(r?.lastActiveAt, at("2026-10-03T02:00:00Z"));
});

test("a second page view moments later writes NOTHING", () => {
  const last = at("2026-10-03T02:00:00Z");
  assert.equal(activityUpdate({ lastActiveAt: last, activeDays: 3 }, at("2026-10-03T02:00:05Z")), null);
  assert.equal(activityUpdate({ lastActiveAt: last, activeDays: 3 }, at("2026-10-03T02:29:00Z")), null);
  assert.equal(ACTIVITY_STAMP_INTERVAL_MS, 30 * 60_000);
});

test("a stale same-day visit refreshes the timestamp but does NOT count a second day", () => {
  const r = activityUpdate({ lastActiveAt: at("2026-10-03T02:00:00Z"), activeDays: 3 }, at("2026-10-03T03:00:00Z"));
  assert.ok(r);
  assert.equal(r!.activeDays, undefined);
});

test("a new UTC day always counts, even four minutes later", () => {
  const r = activityUpdate({ lastActiveAt: at("2026-10-03T23:58:00Z"), activeDays: 9 }, at("2026-10-04T00:02:00Z"));
  assert.equal(r?.activeDays?.increment, 1);
  assert.equal(utcDay(at("2026-10-03T23:59:59Z")), "2026-10-03");
});

test("the stamp is fire-and-forget, from /api/me and the account pages — never the root layout", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/activity.ts"), "utf8");
  assert.match(src, /void prisma\.user\.update/);
  for (const p of ["src/app/api/me/route.ts", "src/app/dashboard/page.tsx", "src/app/profile/page.tsx"]) {
    assert.match(readFileSync(join(process.cwd(), p), "utf8"), /touchActivity\(user\)/, p);
  }
  assert.doesNotMatch(readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8"), /touchActivity/);
  const auth = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");
  assert.match(auth, /lastActiveAt: true, activeDays: true/, "the read is free: the session row already carries both");
});
