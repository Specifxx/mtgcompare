// Coordinator's Vercel cost check (2026-11-24): impressions are sampled 1 in 10 visitors; clicks never are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPRESSION_SAMPLE, isImpression } from "../src/lib/track";

test("only seen/shown impressions are sampled", () => {
  assert.equal(IMPRESSION_SAMPLE, 10);
  for (const [n, k] of [["hot_nudge", "a:seen"], ["hot_nudge", "b:shown"], ["ebay_pop", "a:seen"], ["ab_seen", "x"], ["nudge_shown", ""], ["nudge_eligible", ""]] as const)
    assert.ok(isImpression(n, { k }), `${n} ${k}`);
  for (const [n, k] of [["hot_nudge", "a:buy"], ["ebay_pop", "a:ebay"], ["buy_click", ""], ["nudge_click", ""], ["ab_ebay", ""], ["alert_created", ""]] as const)
    assert.ok(!isImpression(n, { k }), `${n} ${k}`);
});
