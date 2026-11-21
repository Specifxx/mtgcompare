import { track as vercelTrack } from "@vercel/analytics";

// Custom click events to Vercel Web Analytics: ONLY "buy_click" (owner, 2026-10-25: "I just want to see the visitors, the page
// numbers, and the buy click events"). Every other name is dropped here, so a new call site can never add billed events by accident.
// share and share_visit (owner, 2026-11-02: word of mouth, counted in the growth report) joined it.
// 2026-11-14: the sign-up events of 2026-11-12 (alert_open, alert_created, weekly_signup) were written but never listed here, so
// they were dropped and the sign-up recheck would have read zero; and the quick view's A/B tests (lib/ab.ts: ab_seen and one event a
// visit per kind of click, 20 November to 3 December) count through their own eight names.
const SENT: ReadonlySet<string> = new Set([
  "return_visit", // the retention programme's return beacon (lib/return-visit.ts, 2026-11-18): one per returning visitor a day
  "buy_click",
  "ebay_pop", // the eBay stand-out A/B (lib/ebay-pop.ts, 2026-11-19 to 3 Dec): one seen a visit, one first eBay click a visit
  "share",
  "share_visit",
  "share_unlock", // the share-for-a-deal test (2026-11-18)
  "tool_interest", // which RiftCompare tool to build here next (components/ToolInterest.tsx, 2026-11-18)
  "alert_open",
  "alert_created",
  "weekly_signup",
  "restock_signup", // back in stock, free for everyone (components/premium/RestockAlert.tsx, 2026-11-18)
  "nudge_eligible",
  "nudge_shown",
  "nudge_click",
  "hot_nudge", // the Hot 100 buy prompt A/B (lib/hot-nudge.ts, 2026-11-20): {k: "<arm>:seen|shown|buy"}
  ...["ab_seen", "ab_paid", "ab_tcg", "ab_ebay", "ab_amazon", "ab_store", "ab_mini_tcg", "ab_mini_ebay"],
]);

export function track(name: string, props?: Record<string, string | number | boolean | null>): void {
  if (!SENT.has(name)) return;
  try {
    vercelTrack(name, props);
  } catch {
    /* analytics must never get in the way of the page */
  }
}
