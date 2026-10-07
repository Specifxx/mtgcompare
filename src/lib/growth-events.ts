"use client";

// The sign-up funnel's analytics events (RiftCompare's lib/growth-events.ts):
//
//   signup_cta_click { placement }           a sign-up button was clicked
//   auth_start       { provider, placement } an OAuth provider button was clicked
//   signup_complete  { provider, placement } a NEW account landed (first login only)
//   alert_created    { logged_in }           a watch / alert was created
//
// signup_complete fires on the page the provider redirects back to
// (SignupWelcome, keyed off ?welcome=<provider>, which the callback sets only
// for a new account). The placement that started it is remembered here at
// auth_start, in localStorage for 30 minutes.
import { trackEvent } from "./analytics";

const PLACEMENT_KEY = "oc_auth_placement";
const PLACEMENT_TTL_MS = 30 * 60_000;

export function trackSignupCta(placement: string): void {
  trackEvent("signup_cta_click", { placement });
}

export function trackAuthStart(provider: string, placement: string): void {
  trackEvent("auth_start", { provider, placement });
  try {
    localStorage.setItem(PLACEMENT_KEY, JSON.stringify({ placement, at: Date.now() }));
  } catch {
    /* private mode — signup_complete then reports placement "unknown" */
  }
}

/** The placement recorded at auth_start, if recent; consumed on read. */
export function takeAuthPlacement(now = Date.now()): string {
  try {
    const raw = localStorage.getItem(PLACEMENT_KEY);
    localStorage.removeItem(PLACEMENT_KEY);
    const v = raw ? (JSON.parse(raw) as { placement?: string; at?: number }) : null;
    if (v?.placement && v.at && now - v.at < PLACEMENT_TTL_MS) return v.placement;
  } catch {
    /* corrupt or unavailable */
  }
  return "unknown";
}

export function trackSignupComplete(provider: string): void {
  trackEvent("signup_complete", { provider, placement: takeAuthPlacement() });
}

export function trackAlertCreated(loggedIn: boolean): void {
  trackEvent("alert_created", { logged_in: loggedIn });
}
