import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BF_MODE, bfHref, bfModeOn, bfPhase } from "../src/lib/bf-mode";

test("the sale bar runs from Black Friday to the end of TCGplayer's sale, and is off before and after", () => {
  assert.equal(bfModeOn(Date.parse("2026-11-26T23:59:59Z")), false);
  assert.equal(bfModeOn(Date.parse("2026-11-27T06:00:00Z")), true);
  assert.equal(bfModeOn(Date.parse("2026-11-28T10:00:00Z")), true);
  assert.equal(bfModeOn(Date.parse("2026-12-01T03:59:59Z")), true);
  assert.equal(bfModeOn(Date.parse("2026-12-01T04:00:00Z")), false);
  assert.equal(bfModeOn(Date.parse("2027-11-26T12:00:00Z")), false);
  assert.ok(BF_MODE.end - BF_MODE.start <= 4 * 24 * 3600 * 1000 + 4 * 3600 * 1000, "never past the sale weekend");
});

test("the label follows the weekend, and Cyber Monday links the Cyber Monday page", () => {
  assert.equal(bfPhase(Date.parse("2026-11-27T20:00:00Z")), "blackFriday");
  assert.equal(bfPhase(Date.parse("2026-11-29T12:00:00Z")), "cyberWeekend");
  assert.equal(bfPhase(Date.parse("2026-11-30T12:00:00Z")), "cyberMonday");
  assert.equal(bfHref("/us/black-friday", "cyberMonday"), "/us/cyber-monday");
  assert.equal(bfHref("/black-friday", "cyberWeekend"), "/black-friday");
});

test("the bar re-reads the clock in the browser and is never a pop-up", () => {
  const src = readFileSync("src/components/BfModeBar.tsx", "utf8");
  assert.match(src, /bfModeOn\(now\)/);
  assert.match(src, /Date\.now\(\)/);
  assert.doesNotMatch(src, /position:\s*["']?fixed|className="[^"]*\bfixed\b|window\.open|<dialog/);
});
