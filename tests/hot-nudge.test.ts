import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOT_NUDGE_DELAY_MS, HOT_NUDGE_WEEK_MAX, fromReddit, hotNudgeShows, pickHotNudgeArm, type NudgeState } from "../src/lib/hot-nudge";

// The Hot 100 buy prompt (2026-11-20, DECISIONS.md "The Hot 100 buy prompt, 50/50").
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const now = Date.parse("2026-11-20T10:00:00Z");
const base: NudgeState = { arm: "on", elapsedMs: 9000, scrolledPx: 900, screenPx: 800, boughtThisVisit: false, dialogOpen: false, shownThisVisit: false, shownAt: [], now };

test("Reddit landings only", () => {
  for (const r of ["https://www.reddit.com/", "https://old.reddit.com/r/mtgfinance/", "https://out.reddit.com/x", "https://reddit.com/"]) assert.ok(fromReddit(r), r);
  for (const r of ["", "https://www.google.com/", "https://notreddit.com/", "https://reddit.com.evil.io/", "garbage"]) assert.ok(!fromReddit(r), r);
});

test("50/50 arms; the off arm never shows", () => {
  assert.equal(pickHotNudgeArm(0.1), "off");
  assert.equal(pickHotNudgeArm(0.9), "on");
  assert.equal(hotNudgeShows(base), true);
  assert.equal(hotNudgeShows({ ...base, arm: "off" }), false);
});

test("never on load, never after a buy, never over a quick view, once a visit, 3 a week", () => {
  assert.equal(hotNudgeShows({ ...base, elapsedMs: HOT_NUDGE_DELAY_MS - 1 }), false);
  assert.equal(hotNudgeShows({ ...base, scrolledPx: 0 }), false);
  assert.equal(hotNudgeShows({ ...base, boughtThisVisit: true }), false);
  assert.equal(hotNudgeShows({ ...base, dialogOpen: true }), false);
  assert.equal(hotNudgeShows({ ...base, shownThisVisit: true }), false);
  const day = 864e5;
  assert.equal(hotNudgeShows({ ...base, shownAt: Array.from({ length: HOT_NUDGE_WEEK_MAX }, (_, i) => now - (i + 1) * day) }), false);
  assert.equal(hotNudgeShows({ ...base, shownAt: Array.from({ length: HOT_NUDGE_WEEK_MAX }, (_, i) => now - (8 + i) * day) }), true);
});

test("one paid link, TCGplayer; no eBay, no Amazon; dismissible; event allowed and small", () => {
  const c = read("src/components/HotBuyNudge.tsx");
  assert.match(c, /placement="tcgplayer-hot-nudge"/);
  assert.doesNotMatch(c, /ebay|amazon/i);
  assert.match(c, /aria-label="Close"/);
  assert.match(c, /Escape/);
  assert.match(c, /fromReddit\(document\.referrer\)/);
  assert.match(read("src/lib/track.ts"), /"hot_nudge"/);
  assert.match(read("src/app/[region]/hot-100/page.tsx"), /<HotBuyNudge/);
});
