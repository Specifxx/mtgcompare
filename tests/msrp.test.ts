import { test } from "node:test";
import assert from "node:assert/strict";
import { MSRP, msrpOf } from "../src/lib/msrp";

test("every MSRP row names its announcement and the day it was checked", () => {
  const seen = new Set<number>();
  for (const r of MSRP) {
    assert.ok(Number.isInteger(r.productId) && r.productId > 0, "a TCGplayer product id");
    assert.ok(Number.isInteger(r.usdCents) && r.usdCents > 0, "whole cents");
    assert.match(r.source.url, /^https:\/\//, `${r.productId}: a source URL`);
    assert.ok(r.source.title.length > 0);
    assert.match(r.checkedOn, /^\d{4}-\d\d-\d\d$/);
    assert.ok(!seen.has(r.productId), `${r.productId} listed twice`);
    seen.add(r.productId);
  }
});

test("an unlisted product has no MSRP: nothing is invented", () => {
  assert.equal(msrpOf(1), null);
  assert.equal(msrpOf(-5), null);
});
