// Signup-source attribution — the SHARED, import-anywhere half (RiftCompare's
// lib/signup-source-shared.ts, ported in wave 2, 2026-10-03).
//
// No "use client": the OAuth callback validates the cookie with
// parseSignupSource(), and a server module cannot import a client-marked file.
// The whitelist means attribution is only ever one of these known strings, so
// a tampered cookie can't inject arbitrary text into the User table or the
// admin breakdown.
export const SIGNUP_SOURCE_COOKIE = "oc_signup_src";

export const SIGNUP_SOURCES = new Set<string>([
  "navbar",
  "header",
  "home",
  "login",
  "email",
  "referral",
  // The Plus/Premium funnel's own two surfaces.
  "premium_cta", // the /premium pricing-card button and /premium/start
  "premium_dialog", // the Plan dialog
  "tool_preview", // a tool's signed-out preview ("Create a free account")
  "tool_gate",
  "card_cta",
  "card_alert", // the card page's price-drop alert CTA
  "quickview_alert", // the same CTA, compact, inside QuickView
  "quickview",
  "watchlist_drawer", // the drawer's "Sign in to sync and get alerts"
  "watch_toast", // the toast after a signed-out heart
  "launch_promo", // the free-month popup (lib/launch-promo-shared.ts)
  "feedback",
  "article_intro",
  "article_end",
  "other",
]);

/** The cookie's value if it's a known source, else null (never a raw string). */
export function parseSignupSource(value: string | null | undefined): string | null {
  return value && SIGNUP_SOURCES.has(value) ? value : null;
}

// localStorage key for a watch that was mid-flight when a signed-out visitor
// chose "Continue with Google/Discord" on the price-drop alert CTA; SignupWelcome
// (root layout) completes it after the OAuth round trip.
export const PENDING_WATCH_KEY = "oc_pending_watch";
