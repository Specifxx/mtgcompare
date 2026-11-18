// The return nudge (lib/return-nudge.ts, components/ReturnNudge.tsx; owner 2026-11-18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStoreLink, nudgeEligible, nudgeShows, pickArm, pickPaidLinks, NUDGE_MIN_AWAY_MS, NUDGE_WINDOW_MS, type NudgeState } from "../src/lib/return-nudge";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const ok: NudgeState = { arm: "on", clickedAt: 1000, now: 60_000, awayMs: 10_000, shownBefore: false, blocked: false, hasLinks: true };

test("it shows only after a store click, a real absence, once, in the on arm, with links and nothing in the way", () => {
  assert.ok(nudgeShows(ok));
  assert.ok(!nudgeShows({ ...ok, clickedAt: 0 }));
  assert.ok(!nudgeShows({ ...ok, awayMs: NUDGE_MIN_AWAY_MS - 1 }));
  assert.ok(!nudgeShows({ ...ok, now: 1000 + NUDGE_WINDOW_MS + 1 }));
  assert.ok(!nudgeShows({ ...ok, shownBefore: true }));
  assert.ok(!nudgeShows({ ...ok, arm: "off" }));
  assert.ok(nudgeEligible({ ...ok, arm: "off" }), "the control arm is counted as eligible");
  assert.ok(!nudgeShows({ ...ok, blocked: true }));
  assert.ok(!nudgeShows({ ...ok, hasLinks: false }));
  assert.equal(pickArm(0.49), "on");
  assert.equal(pickArm(0.5), "off");
});

test("a store link is an unsponsored link to another site; only eBay and TCGplayer sponsored links are offered, never Amazon", () => {
  assert.ok(isStoreLink({ href: "https://pokebox.com.au/x", rel: "noopener" }, "mtgcompare.app"));
  assert.ok(!isStoreLink({ href: "https://www.ebay.com/itm/1", rel: "sponsored nofollow" }));
  assert.ok(!isStoreLink({ href: "https://mtgcompare.app/au/p/x", rel: "" }, "mtgcompare.app"));
  const links = [
    { href: "https://www.amazon.com/dp/1?tag=x", rel: "sponsored" },
    { href: "https://www.ebay.com/sch/i.html?_nkw=a&customid=1", rel: "sponsored nofollow" },
    { href: "https://partner.tcgplayer.com/c/1/2/3?u=x", rel: "sponsored nofollow" },
  ];
  assert.deepEqual(pickPaidLinks(links), { ebay: links[1].href, tcg: links[2].href });
});

test("mounted once; events whitelisted; GA affiliate click carries the arm; no Amazon in the card", () => {
  assert.match(src("app/layout.tsx"), /<ReturnNudge \/>/);
  assert.match(src("lib/track.ts"), /"nudge_eligible"/);
  assert.match(src("components/OutboundLink.tsx"), /nudge_arm/);
  assert.match(src("components/ReturnNudge.tsx"), /\[data-rate-card\]/);
  assert.doesNotMatch(src("components/ReturnNudge.tsx"), /amazon/i);
});
