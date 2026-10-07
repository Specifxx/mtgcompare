// The corner nudges' rules (lib/nudge-gate.ts, lib/nudge-timing.ts), ported
// from RiftCompare with its numbers: 3rd page view, 48-hour account, 12 s,
// once a session, 7/14-day snoozes, never after two dismissals.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ANNUAL_MIN_MONTHS,
  DIALOG_QUIET_MS,
  INPUT_RECHECK_MS,
  PREMIUM_MIN_ACCOUNT_AGE_MS,
  PREMIUM_SKIP_PATHS,
  SCROLL_QUIET_MS,
  TYPING_QUIET_MS,
  accountAgeMs,
  annualOfferEligible,
  capsAllow,
  isTextEntry,
  pathSkipped,
  premiumSlideInEligible,
  quietWaitMs,
} from "../src/lib/nudge-gate";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "../src/lib/nudge-timing";

const H = 3_600_000;
const NOW = Date.parse("2026-10-03T12:00:00Z");
const old = PREMIUM_MIN_ACCOUNT_AGE_MS + 1;

test("the timing numbers are RiftCompare's", () => {
  assert.equal(NUDGE_DELAY_MS, 12_000);
  assert.equal(MAX_NUDGE_DISMISSALS, 2);
  assert.equal(SNOOZE_AFTER_DISMISS_MS, 7 * 86_400_000);
  assert.equal(SNOOZE_AFTER_CLICK_MS, 14 * 86_400_000);
  assert.equal(PREMIUM_MIN_ACCOUNT_AGE_MS, 48 * H);
});

test("slide-in: from the 3rd page view only", () => {
  assert.equal(premiumSlideInEligible({ views: 1, accountAgeMs: old, pathname: "/sets" }), false);
  assert.equal(premiumSlideInEligible({ views: 2, accountAgeMs: old, pathname: "/sets" }), false);
  assert.equal(premiumSlideInEligible({ views: 3, accountAgeMs: old, pathname: "/sets" }), true);
  assert.equal(premiumSlideInEligible({ views: 9, accountAgeMs: old, pathname: "/card/x" }), true);
});

test("slide-in: an account under 48 hours, or of unknown age, is never asked", () => {
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: 47 * H, pathname: "/" }), false);
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: null, pathname: "/" }), false, "unknown age fails closed");
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: 48 * H, pathname: "/" }), true);
});

test("slide-in: skipped on sign-in, pricing, tools, watchlist, account and admin pages", () => {
  for (const p of ["/login", "/premium", "/premium/welcome", "/tools", "/tools/deal-finder", "/tools/buy-list", "/watchlist", "/account", "/admin", "/admin/premium"]) {
    assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: old, pathname: p }), false, p);
  }
  assert.deepEqual([...PREMIUM_SKIP_PATHS], ["/login", "/premium", "/tools", "/watchlist", "/watching", "/account", "/admin"]);
});

test("pathSkipped matches whole path segments only", () => {
  assert.equal(pathSkipped("/toolsmith", ["/tools"]), false);
  assert.equal(pathSkipped("/tools", ["/tools"]), true);
  assert.equal(pathSkipped("/tools/x", ["/tools"]), true);
  assert.equal(pathSkipped(null, ["/tools"]), false);
});

test("accountAgeMs reads ISO strings and Dates, null when unreadable, never negative", () => {
  assert.equal(accountAgeMs("2026-10-01T12:00:00Z", NOW), 48 * H);
  assert.equal(accountAgeMs(new Date(NOW - H), NOW), H);
  assert.equal(accountAgeMs(null, NOW), null);
  assert.equal(accountAgeMs("not a date", NOW), null);
  assert.equal(accountAgeMs("2027-01-01T00:00:00Z", NOW), 0);
});

test("caps: two dismissals end it, a snooze holds it, and it shows once a session", () => {
  const base = { dismissals: 0, snoozeUntil: 0, seenThisSession: false, now: NOW, maxDismissals: MAX_NUDGE_DISMISSALS };
  assert.equal(capsAllow(base), true);
  assert.equal(capsAllow({ ...base, dismissals: 1 }), true);
  assert.equal(capsAllow({ ...base, dismissals: 2 }), false);
  assert.equal(capsAllow({ ...base, snoozeUntil: NOW + 1 }), false);
  assert.equal(capsAllow({ ...base, snoozeUntil: NOW - 1 }), true);
  assert.equal(capsAllow({ ...base, seenThisSession: true }), false);
});

test("annual offer: monthly, yearly Price available, at least two months in", () => {
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: ANNUAL_MIN_MONTHS, annualAvailable: true }), true);
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: 1, annualAvailable: true }), false);
  assert.equal(annualOfferEligible({ interval: "year", monthsActive: 5, annualAvailable: true }), false);
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: 5, annualAvailable: false }), false);
  assert.equal(annualOfferEligible(null), false);
  // A plan set to end, or not active (past_due), is never offered a year up front.
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: 5, annualAvailable: true, cancelAtPeriodEnd: true }), false);
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: 5, annualAvailable: true, status: "past_due" }), false);
  assert.equal(annualOfferEligible({ interval: "month", monthsActive: 5, annualAvailable: true, status: "active", cancelAtPeriodEnd: false }), true);
});

test("quietWaitMs: never over a dialog, mid-scroll, while typing or in a field", () => {
  const idle = { dialogOpen: false, inputFocused: false, sinceDialogClosedMs: Infinity, sinceScrollMs: Infinity, sinceKeyMs: Infinity };
  assert.equal(quietWaitMs(idle), 0);
  assert.equal(quietWaitMs({ ...idle, dialogOpen: true }), DIALOG_QUIET_MS);
  assert.equal(quietWaitMs({ ...idle, inputFocused: true }), INPUT_RECHECK_MS);
  assert.equal(quietWaitMs({ ...idle, sinceScrollMs: 200 }), SCROLL_QUIET_MS - 200);
  assert.equal(quietWaitMs({ ...idle, sinceKeyMs: 1000 }), TYPING_QUIET_MS - 1000);
  assert.equal(quietWaitMs({ ...idle, sinceDialogClosedMs: 4000 }), DIALOG_QUIET_MS - 4000);
});

test("isTextEntry: text fields yes, buttons and checkboxes no", () => {
  assert.equal(isTextEntry({ tagName: "INPUT", type: "search" }), true);
  assert.equal(isTextEntry({ tagName: "input" }), true);
  assert.equal(isTextEntry({ tagName: "TEXTAREA" }), true);
  assert.equal(isTextEntry({ tagName: "SELECT" }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isTextEntry({ tagName: "BUTTON" }), false);
  assert.equal(isTextEntry(null), false);
});

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("the slide-in is for signed-in non-members with checkout open, and reads its rules from the gate", () => {
  const src = read("src/components/PremiumSlideIn.tsx");
  assert.match(src, /!!me\.user && !me\.tier/);
  assert.match(src, /checkoutOpen/);
  assert.match(src, /premiumSlideInEligible\(/);
  assert.match(src, /NUDGE_DELAY_MS/);
  assert.match(src, /SNOOZE_AFTER_DISMISS_MS/);
  assert.match(src, /SNOOZE_AFTER_CLICK_MS/);
  assert.match(src, /armNudge\(/);
});

test("/api/me tells the browser when the account was made", () => {
  assert.match(read("src/app/api/me/route.ts"), /createdAt: user\?\.createdAt\?\.toISOString\(\) \?\? null/);
});
