import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BF_MODE, bfModeOn } from "../src/lib/bf-mode";

test("Black Friday mode is on for one day only, and off before and after", () => {
  assert.equal(bfModeOn(Date.parse("2026-11-26T23:59:59Z")), false);
  assert.equal(bfModeOn(Date.parse("2026-11-27T06:00:00Z")), true);
  assert.equal(bfModeOn(Date.parse("2026-11-28T09:59:59Z")), true);
  assert.equal(bfModeOn(Date.parse("2026-11-28T10:00:00Z")), false);
  assert.equal(bfModeOn(Date.parse("2027-11-26T12:00:00Z")), false);
  assert.ok(BF_MODE.end - BF_MODE.start <= 34 * 3600 * 1000, "never longer than Black Friday across every time zone");
});

test("the bar re-reads the clock in the browser and is never a pop-up", () => {
  const src = readFileSync("src/components/BfModeBar.tsx", "utf8");
  assert.match(src, /bfModeOn\(Date\.now\(\)\)/);
  assert.doesNotMatch(src, /position:\s*["']?fixed|className="[^"]*\bfixed\b|window\.open|<dialog/);
});
