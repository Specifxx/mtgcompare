// The return-visit beacon (lib/return-visit.ts, components/ReturnBeacon.tsx; retention programme 2026-11-18).
// Pinned: new visitors send nothing, one event per returning visitor per day, buckets only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageBucket, daysBetween, gapBucket, pageType, parseRecord, step, viaOf } from "../src/lib/return-visit";

test("a new visitor is recorded and sends nothing", () => {
  const s = step(null, "2026-11-18", "card", "search");
  assert.deepEqual(s.next, { f: "2026-11-18", l: "2026-11-18", n: 1 });
  assert.equal(s.event, null);
});

test("a second view the same day sends nothing", () => {
  const rec = { f: "2026-11-10", l: "2026-11-18", n: 3 };
  assert.equal(step(rec, "2026-11-18", "card", "direct").event, null);
});

test("a returning visitor's first view of a day sends one bucketed event", () => {
  const s = step({ f: "2026-11-01", l: "2026-11-15", n: 2 }, "2026-11-18", "sealed", "direct");
  assert.deepEqual(s.next, { f: "2026-11-01", l: "2026-11-18", n: 3 });
  assert.deepEqual(s.event, { k: "2-7d:sealed", age: "8-30d", n: "3", via: "direct" });
});

test("buckets", () => {
  assert.equal(daysBetween("2026-10-31", "2026-11-01"), 1);
  assert.equal(gapBucket(1), "1d");
  assert.equal(gapBucket(30), "8-30d");
  assert.equal(gapBucket(31), "31d+");
  assert.equal(ageBucket(7), "1-7d");
  assert.equal(ageBucket(45), "31d+");
});

test("page type skips a region prefix and refuses odd segments", () => {
  assert.equal(pageType("/"), "home");
  assert.equal(pageType("/au/card/foo"), "card");
  assert.equal(pageType("/Card/foo"), "card");
  assert.equal(pageType("/%E2%9C%93"), "other");
});

test("via", () => {
  assert.equal(viaOf("https://www.google.com/", "", "x.com"), "search");
  assert.equal(viaOf("", "", "x.com"), "direct");
  assert.equal(viaOf("", "?utm_source=alerts&utm_medium=email", "x.com"), "email");
  assert.equal(viaOf("https://www.reddit.com/r/x", "", "x.com"), "social");
  assert.equal(viaOf("https://chatgpt.com/", "", "x.com"), "ai");
});

test("a damaged record is ignored", () => {
  assert.equal(parseRecord("{"), null);
  assert.equal(parseRecord(JSON.stringify({ f: "x", l: "2026-01-01", n: 1 })), null);
});
