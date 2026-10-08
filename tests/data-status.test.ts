// status.json and its alarms (spec 12.10.3; contract 15.3). The admin panel and the hourly watchdog read ONE file; every alarm rule is a pure function of its inputs and is run here both ways (it fires, it stays quiet). Owner WP01b (the schema and rules),
// WP21 reads it (admin-publication.ts) and WP02 fetches it (readPublicationStatus).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { POINTER_STALE_HOURS, computeAlarms, daysToLimit, kindOfFamily, publicationStatusOf, tokenRejectedAlarm, REPO_CRIT_KB, REPO_WARN_KB, type AlarmCode, type StatusFile, type WatchInput } from "../src/lib/data/plane/status";
import type { PointerFile } from "../src/lib/data/plane/formats";
import { readPublicationStatus, resetPlaneForTests } from "../src/lib/data/plane/runtime";

const NOW = new Date("2026-10-08T09:00:00Z");
const ptr = (o: Partial<PointerFile> = {}): PointerFile => ({ v: 1, seq: 412, ref: "a".repeat(40), publishedAt: "2026-10-08T08:00:00Z", priceDay: "2026-10-07", tcgcsv: "2026-10-07T20:06:09Z", scryfall: "2026-10-07T21:05:42Z", phase: "full", format: "v1", counts: { cards: 98_991, units: 28_538, files: 9_488 }, manifestSha256: "m", prev: "b".repeat(40), repo: "o/data", histCut: "2026-09-27", pvAt: "2026-10-07T22:45:00Z", ...o });
const status = (o: Partial<StatusFile> = {}): StatusFile => ({
  v: 1, at: "2026-10-08T08:00:00Z", by: "publish", pointer: { seq: 412, ref: "a".repeat(40), prev: "b".repeat(40), publishedAt: "2026-10-08T08:00:00Z", priceDay: "2026-10-07", phase: "full", tcgcsv: "t", scryfall: "s", format: "v1", manifestSha256: "m", repo: "o/data", histCut: "2026-09-27", pvAt: "2026-10-07T22:45:00Z" },
  counts: { cards: 98_991, listed: 98_796, thin: 33_640, tracked: 28_538, oracles: 33_447, sets: 439, sealed: 3_712, offers: 191_242, files: 9_488, bytesRaw: 145_000_000, bytesGz: 51_000_000 },
  families: [["cat", 1392, 10_560_000, 3_030_000], ["px", 1392, 3_360_000, 1_070_000], ["hist/p", 2782, 55_680_000, 23_970_000], ["of", 1228, 16_970_000, 3_920_000], ["hm", 1, 8_140, 3_340]],
  config: { trackConfigHash: "abc", guardTrips: { flagChange: 0 }, catalogFloorCents: 1, indexFloorCents: 50 }, groups: [[24770, 80, 80]],
  guards: { flagChange: null, groupHold: [], storeHold: [], configChanged: false, countsOk: true }, previous: { files: 9_480, cards: 98_900, listed: 98_700, tracked: 28_500, oracles: 33_440 },
  refusals: [], runs: [{ at: "2026-10-08T08:00:00Z", kind: "full", ok: true, seconds: 3_300, note: "ok" }, { at: "2026-10-07T22:00:00Z", kind: "catalog", ok: true, seconds: 480, note: "ok" }],
  repo: { kb: 400_000, at: "2026-10-08T08:00:00Z", trend: [["2026-10-01", 380_000], ["2026-10-08", 400_000]], isPrivate: true, lastSquashAt: "2026-10-04T23:50:00Z" },
  token: { expiresAt: "2027-09-01", daysLeft: 328, checkedAt: "2026-10-08T08:00:00Z" }, hosts: { at: "2026-10-08T08:00:00Z", raw: { ok: true, ms: 80 }, api: { ok: true, ms: 190 } }, alarms: [], ...o,
});
const input = (o: Partial<WatchInput> = {}): WatchInput => ({ now: NOW, pointer: ptr(), status: status(), headIsUnpointedDataCommit: null, servedRef: "a".repeat(40), minutesSincePointerPush: 5, manifestMismatch: false, mainLastCommitAgeDays: 3, ...o });
const codes = (i: WatchInput): AlarmCode[] => computeAlarms(i).map((a) => a.code).sort();

test("a healthy publication raises no alarm", () => { assert.deepEqual(codes(input()), []); });
test("STALE_36H: the pointer is 36 hours old (error), and 'no pointer at all' is the same alarm", () => {
  assert.equal(POINTER_STALE_HOURS, 36);
  assert.deepEqual(codes(input({ pointer: ptr({ publishedAt: "2026-10-06T20:00:00Z" }) })), ["STALE_36H"]);
  assert.deepEqual(codes(input({ pointer: ptr({ publishedAt: "2026-10-07T10:00:00Z" }) })), [], "23 hours is fine");
  assert.ok(codes(input({ pointer: null })).includes("STALE_36H"));
});
test("STORE_STALE: two catalogue-only publishes in a row mean the store stage failed twice", () => {
  const runs = [{ at: "x", kind: "catalog" as const, ok: true, seconds: 1, note: "" }, { at: "y", kind: "catalog" as const, ok: true, seconds: 1, note: "" }];
  assert.deepEqual(codes(input({ status: status({ runs }) })), ["STORE_STALE"]);
  assert.deepEqual(codes(input({ status: status({ runs: [runs[0]!, { at: "z", kind: "full", ok: true, seconds: 1, note: "" }] }) })), []);
});
test("FILES_DROP_10 and COUNT_COLLAPSE: a count that falls under 90% of the previous publish is an error, 89% and 91% on each side", () => {
  const c = status().counts;
  assert.deepEqual(codes(input({ status: status({ counts: { ...c, files: Math.floor(9_480 * 0.89) } }) })), ["FILES_DROP_10"]);
  assert.deepEqual(codes(input({ status: status({ counts: { ...c, files: Math.ceil(9_480 * 0.91) } }) })), []);
  assert.deepEqual(codes(input({ status: status({ counts: { ...c, tracked: 20_000 } }) })), ["COUNT_COLLAPSE"]);
});
test("REFUSED, HOST_DOWN (warn for raw only, error for both), MANIFEST_MISMATCH, UNPOINTED_DATA_COMMIT, POINTER_BEHIND", () => {
  assert.deepEqual(codes(input({ status: status({ runs: [{ at: "x", kind: "refused", ok: false, seconds: 0, note: "PX_IDS" }], refusals: [{ at: "x", seq: 413, code: "PX_IDS", message: "m" }] }) })), ["REFUSED"]);
  const h = (raw: boolean, api: boolean) => computeAlarms(input({ status: status({ hosts: { at: "x", raw: { ok: raw, ms: 1 }, api: { ok: api, ms: 1 } } }) })).filter((a) => a.code === "HOST_DOWN").map((a) => a.level);
  assert.deepEqual(h(false, true), ["warn"]); assert.deepEqual(h(false, false), ["error"]); assert.deepEqual(h(true, false), []);
  assert.deepEqual(codes(input({ manifestMismatch: true })), ["MANIFEST_MISMATCH"]);
  assert.deepEqual(codes(input({ headIsUnpointedDataCommit: { sha: "c".repeat(40), ageMinutes: 45 } })), ["UNPOINTED_DATA_COMMIT"]);
  assert.deepEqual(codes(input({ headIsUnpointedDataCommit: { sha: "c".repeat(40), ageMinutes: 10 } })), [], "a publish in flight is not an alarm");
  assert.deepEqual(codes(input({ servedRef: "d".repeat(40), minutesSincePointerPush: 20 })), ["POINTER_BEHIND"]);
  assert.deepEqual(codes(input({ servedRef: "d".repeat(40), minutesSincePointerPush: 5 })), []);
});
test("repository size: warn at 1.5 GB, error at 3 GB, ROTATION_DUE when the 14-day trend reaches 3 GB within 60 days; SQUASH_OVERDUE after 10 days", () => {
  const repo = (kb: number, trend: [string, number][] = [], lastSquashAt: string | null = "2026-10-04T23:50:00Z") => status({ repo: { kb, at: "x", trend, isPrivate: true, lastSquashAt } });
  assert.deepEqual(codes(input({ status: repo(REPO_WARN_KB + 1) })), ["REPO_SIZE_WARN"]); assert.deepEqual(codes(input({ status: repo(REPO_CRIT_KB + 1) })), ["REPO_SIZE_CRIT"]);
  const rising = Array.from({ length: 14 }, (_, i) => [`2026-09-${String(25 + i).padStart(2, "0")}`, 1_000_000 + i * 40_000] as [string, number]);   // +40,000 KB a day from 1.0 GB
  assert.ok(codes(input({ status: repo(1_480_000, rising) })).includes("ROTATION_DUE"), "the trend reaches 3 GB in about 37 days");
  const flat = Array.from({ length: 14 }, (_, i) => [`d${i}`, 1_000_000] as [string, number]); assert.equal(daysToLimit(flat, REPO_CRIT_KB), null); assert.equal(daysToLimit(flat.slice(0, 4), REPO_CRIT_KB), null, "four samples are not a trend");
  assert.equal(daysToLimit(rising, REPO_CRIT_KB), Math.floor((REPO_CRIT_KB - 1_520_000) / 40_000));
  assert.deepEqual(codes(input({ status: repo(400_000, [], "2026-09-25T00:00:00Z") })), ["SQUASH_OVERDUE"]);
});
test("DATA_REPO_PUBLIC (error unless allowed), TOKEN_EXPIRING (warn at 30 days, error at 7), PREVIEW_STALE (48 h), KEEPALIVE_DUE (50 days)", () => {
  const s = status({ repo: { ...status().repo, isPrivate: false } });
  assert.deepEqual(codes(input({ status: s })), ["DATA_REPO_PUBLIC"]); assert.deepEqual(codes(input({ status: s, allowPublic: true })), []);
  const tok = (d: number) => computeAlarms(input({ status: status({ token: { expiresAt: "x", daysLeft: d, checkedAt: "x" } }) })).filter((a) => a.code === "TOKEN_EXPIRING").map((a) => a.level);
  assert.deepEqual(tok(29), ["warn"]); assert.deepEqual(tok(6), ["error"]); assert.deepEqual(tok(60), []);
  assert.deepEqual(codes(input({ pointer: ptr({ pvAt: "2026-10-05T22:45:00Z" }), status: status({ pointer: { ...status().pointer, pvAt: "2026-10-05T22:45:00Z" } }) })), ["PREVIEW_STALE"]);
  assert.deepEqual(codes(input({ mainLastCommitAgeDays: 51 })), ["KEEPALIVE_DUE"]); assert.deepEqual(codes(input({ mainLastCommitAgeDays: 20 })), []);
  assert.equal(tokenRejectedAlarm(NOW).level, "error");
});
test("an alarm keeps its first `since` while it stays raised", () => {
  const first = computeAlarms(input({ manifestMismatch: true })); const later = computeAlarms({ ...input({ manifestMismatch: true }), now: new Date("2026-10-09T09:00:00Z"), status: status({ alarms: first }) });
  assert.equal(later.find((a) => a.code === "MANIFEST_MISMATCH")!.since, first[0]!.since);
});
test("publicationStatusOf carries the field names section 15.3 requires, and every field survives a missing file", () => {
  const p = publicationStatusOf(status(), ptr());
  assert.equal(p.pointer.sha, "a".repeat(40)); assert.equal(p.pointer.ref, p.pointer.sha); assert.equal(p.pointer.publishedAt, "2026-10-08T08:00:00Z"); assert.equal(p.pointer.dataDay, "2026-10-07");
  assert.equal(p.files.total, 9_488); assert.equal(p.files.previous, 9_480); assert.deepEqual(Object.keys(p.files.byKind).sort(), ["catalogue", "history", "offers", "prices", "views"]); assert.equal(p.files.byKind.history!.files, 2782);
  assert.equal(p.repo.sizeKb, 400_000); assert.equal(p.repo.budgetKb, REPO_CRIT_KB); assert.equal(p.repo.history.length, 2);
  assert.equal(p.run.ok, true); assert.equal(p.run.mode, "full"); assert.deepEqual(p.run.errors, []); assert.deepEqual(p.run.guards, { flagChange: null, groupHold: [], storeHold: [], configChanged: false });
  assert.equal(p.sources.tcgcsvLastUpdated, "t"); assert.equal(p.sources.scryfallBuild, "s"); assert.equal(p.format.version, "v1"); assert.deepEqual(p.catalog, { rows: 98_991, listed: 98_796, thin: 33_640, tracked: 28_538, oracles: 33_447 }); assert.equal(p.token.daysLeft, 328);
  const none = publicationStatusOf(null, null); assert.equal(none.pointer.sha, null); assert.equal(none.files.total, null); assert.equal(none.run.ok, null); assert.deepEqual(none.run.errors, []); assert.deepEqual(none.alarms, []); assert.equal(none.repo.sizeKb, null);
  const onlyPointer = publicationStatusOf(undefined, ptr()); assert.equal(onlyPointer.pointer.sha, "a".repeat(40)); assert.equal(onlyPointer.catalog.rows, null);
  const failed = publicationStatusOf(status({ runs: [{ at: "x", kind: "full", ok: false, seconds: 1, note: "store stage timed out" }] })); assert.deepEqual(failed.run.errors, ["store stage timed out"]);
  assert.equal(kindOfFamily("hist/w"), "history"); assert.equal(kindOfFamily("ix/s"), "offers"); assert.equal(kindOfFamily("pv"), "premium", "the preview slices are the 'premium' kind: the only files derived from private counters");
});
test("readPublicationStatus never throws: a directory with status.json, a directory without, and a network that fails", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plane-st-")); fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(ptr())); fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(status()));
  try {
    resetPlaneForTests(); const withFile = await readPublicationStatus({ env: { PLANE_DIR: dir } }); assert.equal(withFile.files.total, 9_488);
    fs.rmSync(path.join(dir, "status.json")); const without = await readPublicationStatus({ env: { PLANE_DIR: dir } }); assert.equal(without.files.total, null); assert.equal(without.pointer.sha, "a".repeat(40));
    resetPlaneForTests(); const down = await readPublicationStatus({ env: { PLANE_REPO: "o/none", PLANE_TOKEN: "t" }, fetchFn: async () => { throw new Error("offline"); }, timeoutMs: 50 }); assert.equal(down.files.total, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); resetPlaneForTests(); }
});
