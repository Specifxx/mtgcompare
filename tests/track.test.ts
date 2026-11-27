import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner, 2026-10-25: Vercel Web Analytics shows page views and buy clicks, nothing else; 2026-11-02 the share pair joined
// (word of mouth, counted in RiftCompare's growth report).
// 2026-11-14: the three sign-up events (written on 2026-11-12, dropped until now) and the A/B tests' eight (lib/ab.ts).
test("only the listed events reach Vercel Analytics; every other event name is dropped", () => {
  const src = readFileSync(new URL("../src/lib/track.ts", import.meta.url), "utf8");
  const list = /new Set\(\[([^\]]*\[[^\]]*\][^\]]*)\]\)/.exec(src)?.[1] ?? "";
  assert.deepEqual(
    [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]),
    ["return_visit", "buy_click", "ebay_pop", "share", "share_visit", "share_unlock", "tool_interest", "pulse", "alert_open", "alert_created", "weekly_signup", "after_buy_alert", "restock_signup", "nudge_eligible", "nudge_shown", "nudge_click", "bar_test", "hot_nudge", "ab_seen", "ab_paid", "ab_tcg", "ab_ebay", "ab_amazon", "ab_store", "ab_mini_tcg", "ab_mini_ebay"],
  );
  assert.match(src, /if \(!SENT\.has\(name\)\) return;/);
});
