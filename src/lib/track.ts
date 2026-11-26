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
  "pulse", // collector pulse answers (components/CollectorPulse.tsx, 2026-11-26): {k: buy|hold|skip}, one per answer
  "alert_open",
  "alert_created",
  "weekly_signup",
  "after_buy_alert", // the price alert offer after a buy click (components/AfterBuyAlert.tsx, 2026-11-26): {k: shown|created|close}
  "restock_signup", // back in stock, free for everyone (components/premium/RestockAlert.tsx, 2026-11-18)
  "nudge_eligible",
  "nudge_shown",
  "nudge_click",
  "hot_nudge", // the Hot 100 buy prompt A/B (lib/hot-nudge.ts, 2026-11-20): {k: "<arm>:seen|shown|buy"}
  ...["ab_seen", "ab_paid", "ab_tcg", "ab_ebay", "ab_amazon", "ab_store", "ab_mini_tcg", "ab_mini_ebay"],
]);

// Impressions are sampled 1 in 10 VISITORS (coordinator's Vercel cost check, 2026-11-24: per-view "seen"/"shown" events took Web
// Analytics from about $0.05 to $0.31 a day). A sampled visitor sends every impression with `w: 10`, so a read multiplies by `w`;
// an unsampled visitor sends none. Per visitor, not per event, so an A/B arm's seen and its clicks come from the same people and
// the arms stay comparable (both sampled alike). Clicks, sign-ups and buy clicks are never sampled.
export const IMPRESSION_SAMPLE = 10;
const IMPRESSION_EVENTS: ReadonlySet<string> = new Set(["ab_seen", "nudge_eligible", "nudge_shown"]);
export function isImpression(name: string, props?: Record<string, unknown>): boolean {
  if (IMPRESSION_EVENTS.has(name)) return true;
  const k = typeof props?.k === "string" ? props.k : "";
  return (name === "hot_nudge" || name === "ebay_pop") && /:(seen|shown)$/.test(k);
}
let sampled: boolean | null = null;
function inSample(): boolean {
  if (sampled != null) return sampled;
  try {
    let v = window.localStorage.getItem("mtg-imp-sample");
    if (v !== "1" && v !== "0") {
      v = Math.random() < 1 / IMPRESSION_SAMPLE ? "1" : "0";
      window.localStorage.setItem("mtg-imp-sample", v);
    }
    sampled = v === "1";
  } catch {
    sampled = Math.random() < 1 / IMPRESSION_SAMPLE;
  }
  return sampled;
}

export function track(name: string, props?: Record<string, string | number | boolean | null>): void {
  if (!SENT.has(name)) return;
  try {
    if (isImpression(name, props)) {
      if (!inSample()) return;
      props = { ...props, w: IMPRESSION_SAMPLE };
    }
    vercelTrack(name, props);
  } catch {
    /* analytics must never get in the way of the page */
  }
}
