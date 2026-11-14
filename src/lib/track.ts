import { track as vercelTrack } from "@vercel/analytics";

// Custom click events to Vercel Web Analytics: ONLY "buy_click" (owner, 2026-10-25: "I just want to see the visitors, the page
// numbers, and the buy click events"). Every other name is dropped here, so a new call site can never add billed events by accident.
// share and share_visit (owner, 2026-11-02: word of mouth, counted in the growth report) joined it.
// 2026-11-14: the sign-up events of 2026-11-12 (alert_open, alert_created, weekly_signup) were written but never listed here, so
// they were dropped and the sign-up recheck would have read zero; and the quick view's A/B tests (lib/ab.ts: ab_seen and one event a
// visit per kind of click, 20 November to 3 December) count through their own eight names.
const SENT: ReadonlySet<string> = new Set([
  "buy_click",
  "share",
  "share_visit",
  "alert_open",
  "alert_created",
  "weekly_signup",
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
