import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PULSE_MIN, PULSE_OPEN_TO_ALL, split } from "../src/components/CollectorPulse";

test("the split stays hidden below the minimum and rounds to whole percent", () => {
  assert.equal(split(null), null);
  assert.equal(split({ n: PULSE_MIN - 1 }), null);
  assert.deepEqual(split({ n: 10, buy: 6, hold: 3, skip: 1 }), { buy: 60, hold: 30, skip: 10 });
});

test("one question a visit: the pulse waits for ToolInterest's answer until 5 Dec", () => {
  const src = readFileSync("src/components/CollectorPulse.tsx", "utf8");
  assert.match(src, /TOOL_INTEREST_KEY/);
  assert.equal(new Date(PULSE_OPEN_TO_ALL).toISOString().slice(0, 10), "2026-12-05");
});

test("the pulse sits under the price table, never in the quick view", () => {
  const page = readFileSync("src/app/[region]/p/[slug]/page.tsx", "utf8");
  assert.ok(page.indexOf("<CollectorPulse") > page.indexOf("<OfferTable"));
  assert.doesNotMatch(readFileSync("src/components/QuickView.tsx", "utf8").toString(), /CollectorPulse/);
});
