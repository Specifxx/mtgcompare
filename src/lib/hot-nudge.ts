// The Hot 100 buy prompt, 50/50 (owner, 2026-11-20: "we might need some pop up buy clicks ads to convert"). On 19-20 Nov the Hot 100
// Reddit post brought 2,596 Reddit visitors to /us/hot-100 (95% phones) and the page itself had 2 buy clickers.
// WHO: only a visit that LANDED on a Hot 100 page from reddit.com (document.referrer). Google visitors and crawlers never see it, so
// the light-ads group (MTG, heavy-ads test to 10 Dec) and search are untouched.
// WHAT (arm "on"): one small card at the bottom of the screen with the week's #1 riser: its photo, its cheapest in-stock price (the card's own), "Compare
// every store" (opens the quick view) and ONE paid link, TCGplayer (a tagged search; no eBay, no Amazon in a pop-up: owner rules).
// WHEN: never on load. After 8 s on the page AND a scroll past the first screen, only if the visit has not clicked buy and no quick
// view is open. Once a visit, at most 3 times in 7 days, ✕ / Escape close it, it leaves by itself after 30 s.
// COUNTED through ONE event, `hot_nudge` {k}: "<arm>:seen" once a visit on landing, "<arm>:shown" when the card appears, "<arm>:buy"
// on the visit's first outbound buy click on the page (any store, the quick view's rows included). Read: buy / seen per arm, from
// 22 Nov; keep it (hotNudgeArm returns "on") if "on" wins at p < 0.05, else "off".
export const HOT_NUDGE_ARM_KEY = "hot-nudge";
export const HOT_NUDGE_SHOWS_KEY = "hot-nudge-shows";
export const HOT_NUDGE_VISIT_KEY = "hot-nudge-visit";
export const HOT_NUDGE_DELAY_MS = 8000;
export const HOT_NUDGE_HIDE_MS = 30000;
export const HOT_NUDGE_WEEK_MAX = 3;
const WEEK_MS = 7 * 864e5;

export type HotNudgeArm = "off" | "on";

export function pickHotNudgeArm(r: number): HotNudgeArm {
  return r < 0.5 ? "off" : "on";
}

/** A landing from Reddit: the referrer's host is reddit.com or a subdomain (old., out., www.). */
export function fromReddit(referrer: string): boolean {
  try {
    const h = new URL(referrer).hostname.toLowerCase();
    return h === "reddit.com" || h.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

export interface NudgeState {
  arm: HotNudgeArm;
  elapsedMs: number;
  scrolledPx: number;
  screenPx: number;
  boughtThisVisit: boolean;
  dialogOpen: boolean;
  shownThisVisit: boolean;
  shownAt: number[]; // earlier shows, ms since epoch
  now: number;
}

/** Shows within the last 7 days. */
export function recentShows(shownAt: number[], now: number): number[] {
  return shownAt.filter((t) => Number.isFinite(t) && now - t < WEEK_MS && t <= now);
}

export function hotNudgeShows(s: NudgeState): boolean {
  if (s.arm !== "on") return false;
  if (s.boughtThisVisit || s.dialogOpen || s.shownThisVisit) return false;
  if (s.elapsedMs < HOT_NUDGE_DELAY_MS) return false;
  if (s.scrolledPx < Math.max(300, s.screenPx * 0.6)) return false;
  return recentShows(s.shownAt, s.now).length < HOT_NUDGE_WEEK_MAX;
}
