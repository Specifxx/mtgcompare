// The launch promotion, client-safe half: "the first 50 accounts get a month of
// Premium free" (owner's request, 2026-10-04). No Prisma here — the popup, the
// /api/promo route and the tests all read these numbers; the one writer is
// lib/launch-promo.ts.
export const PROMO_KEY = "launch-promo"; // the Counter row that counts claimed slots
/** The one switch: false stops new grants AND hides the popup (the status route answers "none left"). */
export const LAUNCH_PROMO_ENABLED = true;
export const PROMO_SLOTS = 50;
export const PROMO_DAYS = 30;
export const PROMO_SOURCE = "launch_promo"; // the whitelisted signup source the popup stamps

export interface PromoStatus {
  slots: number;
  claimed: number;
  left: number;
  days: number;
}

/** Slots still free for a claimed count; never negative, never above the total. Pure. */
export function promoLeft(claimed: number, slots: number = PROMO_SLOTS): number {
  const c = Number.isFinite(claimed) ? Math.max(0, Math.floor(claimed)) : 0;
  return Math.max(0, slots - c);
}

export function promoStatus(claimed: number, slots: number = PROMO_SLOTS, days: number = PROMO_DAYS): PromoStatus {
  const c = Math.min(slots, Math.max(0, Math.floor(Number.isFinite(claimed) ? claimed : 0)));
  return { slots, claimed: c, left: promoLeft(c, slots), days };
}

// ── When the popup may appear (pure, tests/launch-promo.test.ts pins it) ─────

/** Pages that already carry their own sign-in or are not for selling: never a popup there. */
export const PROMO_SKIP_PATHS = ["/login", "/premium", "/admin", "/account", "/profile", "/dashboard", "/watching", "/portfolio", "/c", "/alerts", "/privacy", "/terms", "/unsubscribe"] as const;

/** From the 2nd page view of a visit: the visitor has seen what the site does before being asked. */
export const PROMO_MIN_VIEWS = 2;
/** After a dismissal the popup rests this long; three dismissals end it for good. */
export const PROMO_SNOOZE_MS = 3 * 864e5;
export const PROMO_MAX_DISMISSALS = 3;
/** Seconds of quiet on the page before it opens (never on first paint). */
export const PROMO_DELAY_MS = 8_000;

export interface PromoGateInput {
  loaded: boolean; // /api/me has answered (or no hint cookie: answered instantly)
  signedIn: boolean;
  left: number | null; // null = not fetched yet
  views: number;
  pathname: string | null | undefined;
}

export function promoPopupEligible({ loaded, signedIn, left, views, pathname }: PromoGateInput): boolean {
  if (!loaded || signedIn) return false;
  if (left != null && left <= 0) return false; // null: not fetched yet, may ask
  if (views < PROMO_MIN_VIEWS) return false;
  if (!pathname) return false;
  return !PROMO_SKIP_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
