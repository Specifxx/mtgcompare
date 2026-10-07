// "This browser tab is the one an account was just created in" (RiftCompare's
// lib/signup-session.ts, ported in wave 2, 2026-10-03).
//
// The OAuth callback marks a NEW account's landing with ?welcome=<provider>,
// and SignupWelcome turns that into analytics and strips it from the URL.
// WelcomeChecklist shows on that very landing however its effect is ordered
// against SignupWelcome's, and the Plus/Premium slide-in can stay away for
// the session. sessionStorage, so "the rest of the session" is this tab until
// it closes. Both fail closed in private mode or on the server.
const KEY = "oc_signup_session";

/** Called by SignupWelcome on a ?welcome landing. */
export function markSignupSession(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode — the URL check below still covers the landing itself */
  }
}

/** True in the tab where an account was just created, from its landing on. */
export function isSignupSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
  } catch {
    /* fall through to the URL */
  }
  try {
    return new URLSearchParams(window.location.search).has("welcome");
  } catch {
    return false;
  }
}
