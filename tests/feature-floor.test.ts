import test from "node:test";
import assert from "node:assert/strict";
import { FEATURE_MIN_USD_CENTS, featureWorthy, featured, priciestFirst } from "../src/lib/feature-floor";

test("the floor is US$100, converted for other markets", () => {
  assert.equal(FEATURE_MIN_USD_CENTS, 10_000);
  assert.equal(featureWorthy(9_999, "US"), false);
  assert.equal(featureWorthy(10_000, "US"), true);
  assert.equal(featureWorthy(14_999, "AU"), false); // A$149.99 < US$100 at 1.5
  assert.equal(featureWorthy(15_000, "AU"), true);
  assert.equal(featureWorthy(null, "US"), false);
});

test("featured keeps the dearer products first and drops cheap ones unless topped up", () => {
  const items = [{ n: "pack", c: 500 }, { n: "box", c: 13_000 }, { n: "case", c: 60_000 }, { n: "bundle", c: 8_000 }];
  assert.deepEqual(featured(items, "US", (x) => x.c, 5).map((x) => x.n), ["case", "box"]);
  assert.deepEqual(featured(items, "US", (x) => x.c, 3, true).map((x) => x.n), ["case", "box", "bundle"]);
  assert.deepEqual(priciestFirst(items, "US", (x) => x.c).map((x) => x.n), ["case", "box", "bundle", "pack"]);
});
