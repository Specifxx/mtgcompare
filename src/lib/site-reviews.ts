import { SITE_REVIEWS } from "./site-reviews-config";

// RATE US, AND WHAT PEOPLE SAY (owner, 2026-11-03: RiftCompare's feedback
// pop-up on every site, each site's reviews public, approved in RiftCompare's
// admin; "star reviews are automatically on the website").
//
// This site keeps nothing: the rating card posts to RiftCompare's shared
// review service, which stores the stars and words, counts the stars in this
// site's score at once, and holds written reviews until the owner approves
// them in riftcompare.com/admin/reviews. The score and the approved reviews
// come back as one public JSON the CDN keeps six hours, fetched in the browser,
// so no page here gains a function, a database read or a build step.
// RiftCompare's DECISIONS.md, "Every site's reviews, approved in one queue".
//
// WHEN THE CARD ASKS (RiftCompare's corner card, owner 2026-10-28; never its
// rating-drive pop-up): never on arrival; after 4 pages and 3 minutes of use,
// or just after the visitor comes back from a store tab they opened here; at
// most three times, 14 days apart; never again once they rated or said "Don't
// ask again". Always closable (✕, Escape, "Not now"). The footer's "Rate us"
// opens the same card at any time.

export const REVIEWS_SERVICE = "https://riftcompare.com/api/site-reviews";
export const reviewsFeedUrl = () => `${REVIEWS_SERVICE}/${SITE_REVIEWS.key}`;

export const OPEN_EVENT = "site-reviews:open";
export const RATED_EVENT = "site-reviews:rated";

export const ASK_AFTER_PAGES = 4;
export const ASK_AFTER_MS = 3 * 60_000;
/** After a store tab: enough pages to have used the site at all. */
export const ASK_INTENT_PAGES = 2;
export const VISIT_GAP_MS = 30 * 60_000;
export const SNOOZE_MS = 14 * 86_400_000;
export const MAX_ASKS = 3;
export const STORAGE_KEY = "srv_rate";
export const SESSION_KEY = "srv_rate_seen";
export const SESSION_PAGES_KEY = "srv_rate_pages";

const NEVER = [/^\/admin/, /^\/api\//, /^\/contact/, /^\/privacy/, /^\/terms/, /^\/embed/, /^\/widgets/, /^\/unsubscribe/];

export function askAllowedOn(path: string): boolean {
  return !NEVER.some((r) => r.test(path));
}

export interface RateState {
  firstSeen: number;
  lastSeen: number;
  pages: number;
  snoozedAt: number;
  asks: number;
  rated: boolean;
  optedOut: boolean;
}

export function freshState(now: number): RateState {
  return { firstSeen: now, lastSeen: now, pages: 0, snoozedAt: 0, asks: 0, rated: false, optedOut: false };
}

export function parseState(raw: string | null, now: number): RateState {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return freshState(now);
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    const firstSeen = num(v.firstSeen, now);
    return {
      firstSeen,
      lastSeen: num(v.lastSeen, firstSeen),
      pages: num(v.pages, 0),
      snoozedAt: num(v.snoozedAt, 0),
      asks: num(v.asks, 0),
      rated: v.rated === true,
      optedOut: v.optedOut === true,
    };
  } catch {
    return freshState(now);
  }
}

export function countPage(s: RateState, now: number): RateState {
  return { ...s, pages: s.pages + 1, lastSeen: now };
}

export interface Visit {
  /** Distinct pages seen in this tab's visit. */
  pages: number;
  /** They just came back from a store tab opened here. */
  intent?: boolean;
}

/** Should the corner card ask now? Pure. */
export function shouldAsk(s: RateState, now: number, path: string, visit: Visit): boolean {
  if (s.rated || s.optedOut || s.asks >= MAX_ASKS) return false;
  if (!askAllowedOn(path)) return false;
  if (visit.intent) {
    if (s.pages < ASK_INTENT_PAGES) return false;
  } else {
    if (visit.pages < 2) return false;
    if (s.pages < ASK_AFTER_PAGES) return false;
    if (now - s.firstSeen < ASK_AFTER_MS) return false;
  }
  if (s.snoozedAt && now - s.snoozedAt < SNOOZE_MS) return false;
  return true;
}

export function loadState(now = Date.now()): RateState {
  try {
    return parseState(localStorage.getItem(STORAGE_KEY), now);
  } catch {
    return parseState(null, now);
  }
}

export function saveState(s: RateState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode: nothing is remembered, and without a page count it never asks.
  }
}

export function markRated(): void {
  saveState({ ...loadState(), rated: true });
  try {
    window.dispatchEvent(new Event(RATED_EVENT));
  } catch {
    /* not in a browser */
  }
}

/** The footer's "Rate us" and the reviews block's button. */
export function openRateCard(): void {
  try {
    window.dispatchEvent(new Event(OPEN_EVENT));
  } catch {
    /* not in a browser */
  }
}

/** The public payload of /api/site-reviews/<key> on RiftCompare. */
export interface SiteReviewsFeed {
  site: string;
  name?: string;
  rating: { average: number; count: number; split: Record<"1" | "2" | "3" | "4" | "5", number> } | null;
  reviews: { id: string; rating: number | null; message: string; name: string; date: string }[];
}

let feedPromise: Promise<SiteReviewsFeed | null> | null = null;

/** One fetch per page load, shared by every block that shows the score. */
export function loadFeed(): Promise<SiteReviewsFeed | null> {
  feedPromise ??= fetch(reviewsFeedUrl())
    .then((r) => (r.ok ? (r.json() as Promise<SiteReviewsFeed>) : null))
    .catch(() => null);
  return feedPromise;
}

/** "4.8 · 23 ratings" */
export function scoreLine(r: { average: number; count: number }): string {
  return `${r.average.toFixed(1)} · ${r.count.toLocaleString("en-US")} ${r.count === 1 ? "rating" : "ratings"}`;
}
