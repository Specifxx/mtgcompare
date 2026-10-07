// WHEN A CORNER NUDGE MAY APPEAR AT ALL. Pure, so tests/nudge-gate.test.ts
// pins every branch. A straight port of RiftCompare's lib/nudge-gate.ts
// ("Nudges: value first", 2026-09-29 there): a visitor is shown what the site
// does BEFORE they are asked for anything, and a "no" is respected.
//
// Signed-out visitors never get a corner card: they meet InlineSignupPrompt
// inside the page, which needs no gate because it never interrupts anything.
// lib/nudge-timing.ts holds the delay, caps and snoozes; lib/nudge-runtime.ts
// is the browser half (timers, watchers).

// ── The Plus/Premium slide-in (signed in, no paid tier, checkout open) ──────

/** Not on the session's first two page views: eligible from the 3rd. */
export const PREMIUM_MIN_VIEWS = 3;

/** A new account's job is to use the free site, not to buy: 48 hours from User.createdAt. */
export const PREMIUM_MIN_ACCOUNT_AGE_MS = 48 * 3_600_000;

/** Whole-word path prefixes: "/tools" matches /tools and /tools/x, not /toolsmith. */
export function pathSkipped(pathname: string | null | undefined, skips: readonly string[]): boolean {
  if (!pathname) return false;
  return skips.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * The slide-in's skipped paths: sign-in, /premium itself, the account and
 * admin pages, and every page that already carries its OWN inline paid prompt
 * (the tools' walls, the watchlist). Stacking a corner card on those is asking
 * twice for one thing.
 */
export const PREMIUM_SKIP_PATHS = ["/login", "/premium", "/tools", "/watchlist", "/watching", "/account", "/admin"] as const;

/** Milliseconds since `createdAt` (an ISO string or Date), or null when it is missing or unreadable. */
export function accountAgeMs(createdAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!createdAt) return null;
  const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

export interface PremiumGateInput {
  /** Signed-in page views this session, the current one included. */
  views: number;
  /** accountAgeMs(); null (unknown) fails CLOSED: no ask without knowing how new they are. */
  accountAgeMs: number | null;
  pathname: string | null | undefined;
}

export function premiumSlideInEligible({ views, accountAgeMs: age, pathname }: PremiumGateInput): boolean {
  if (views < PREMIUM_MIN_VIEWS) return false;
  if (age === null || age < PREMIUM_MIN_ACCOUNT_AGE_MS) return false;
  return !pathSkipped(pathname, PREMIUM_SKIP_PATHS);
}

// ── The monthly subscriber's annual offer ───────────────────────────────────

/** From the 2nd page view of a session. */
export const ANNUAL_MIN_VIEWS = 2;
/** Let a monthly subscription prove it is sticking before pitching a year up front. */
export const ANNUAL_MIN_MONTHS = 2;

/**
 * A subscription set to end (cancelAtPeriodEnd) is never offered a year up
 * front: the switch would bill twelve months to someone who chose to leave.
 */
export function annualOfferEligible(sub: { interval: string | null; monthsActive?: number | null; annualAvailable?: boolean; cancelAtPeriodEnd?: boolean; status?: string } | null | undefined): boolean {
  if (!sub || sub.cancelAtPeriodEnd || (sub.status != null && sub.status !== "active")) return false;
  return sub.interval === "month" && sub.annualAvailable === true && (sub.monthsActive ?? 0) >= ANNUAL_MIN_MONTHS;
}

// ── The caps, as one pure decision (storage is read by the component) ───────

export interface CapState {
  dismissals: number;
  snoozeUntil: number;
  seenThisSession: boolean;
  now: number;
  maxDismissals: number;
}

/** May a corner card be armed, given its stored history? */
export function capsAllow(s: CapState): boolean {
  if (s.dismissals >= s.maxDismissals) return false; // a firm no is permanent
  if (s.now < s.snoozeUntil) return false; // snoozed
  return !s.seenThisSession; // once per session
}

// ── Never mid-task ──────────────────────────────────────────────────────────

/** After a dialog or drawer closes, leave the visitor alone for this long. */
export const DIALOG_QUIET_MS = 10_000;
/** A scroll this recent means they are moving through the page. */
export const SCROLL_QUIET_MS = 1_000;
/** A key press this recent means they are typing. */
export const TYPING_QUIET_MS = 3_000;
/** How long to wait before looking again while an input has focus. */
export const INPUT_RECHECK_MS = 3_000;

export interface QuietInput {
  dialogOpen: boolean;
  /** A text field (input, textarea, select, contenteditable) has focus. */
  inputFocused: boolean;
  /** ms since the last dialog/drawer closed; Infinity when none has. */
  sinceDialogClosedMs: number;
  /** ms since the last scroll event; Infinity when none has. */
  sinceScrollMs: number;
  /** ms since the last key press; Infinity when none has. */
  sinceKeyMs: number;
}

/**
 * 0 when a nudge may appear right now; otherwise how long to wait before
 * asking again. Checked when the timer FIRES (a visitor can start a task during
 * the wait) as well as when it is armed.
 */
export function quietWaitMs(q: QuietInput): number {
  if (q.dialogOpen) return DIALOG_QUIET_MS;
  const waits = [0];
  if (q.inputFocused) waits.push(INPUT_RECHECK_MS);
  waits.push(DIALOG_QUIET_MS - q.sinceDialogClosedMs);
  waits.push(SCROLL_QUIET_MS - q.sinceScrollMs);
  waits.push(TYPING_QUIET_MS - q.sinceKeyMs);
  return Math.max(...waits.filter((w) => Number.isFinite(w)), 0);
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

/** Is this element somewhere a person types (or picks from a list)? */
export function isTextEntry(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((el.type ?? "text").toLowerCase());
  return false;
}
