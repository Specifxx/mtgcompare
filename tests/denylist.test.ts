import test from "node:test";
import assert from "node:assert/strict";
import { hostOf, withoutDenied } from "../src/lib/denylist";

test("denylist drops a denied host (www or not) and keeps the rest", () => {
  const stores = [{ base: "https://www.badshop.co.uk" }, { base: "https://goodshop.com" }];
  assert.deepEqual(withoutDenied(stores, new Set(["badshop.co.uk"])).map((s) => hostOf(s.base)), ["goodshop.com"]);
});
test("an empty denylist keeps every store", () => {
  assert.equal(withoutDenied([{ base: "https://a.com" }], new Set()).length, 1);
});
