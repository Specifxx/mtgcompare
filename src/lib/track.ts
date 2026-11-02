import { track as vercelTrack } from "@vercel/analytics";

// Custom click events to Vercel Web Analytics: ONLY "buy_click" (owner, 2026-10-25: "I just want to see the visitors, the page
// numbers, and the buy click events"). Every other name is dropped here, so a new call site can never add billed events by accident.
// share and share_visit (owner, 2026-11-02: word of mouth, counted in the growth report) joined it.
const SENT: ReadonlySet<string> = new Set(["buy_click", "share", "share_visit"]);

export function track(name: string, props?: Record<string, string | number | boolean | null>): void {
  if (!SENT.has(name)) return;
  try {
    vercelTrack(name, props);
  } catch {
    /* analytics must never get in the way of the page */
  }
}
