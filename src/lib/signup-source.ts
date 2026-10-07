"use client";

import { trackEvent } from "./analytics";
import { SIGNUP_SOURCE_COOKIE, parseSignupSource } from "./signup-source-shared";

// The one choke point every sign-in CTA calls on click (RiftCompare's
// lib/signup-source.ts): sign_in_click fires with the source, and a 30-minute
// cookie records it so the OAuth callback can stamp User.signupSource —
// attribution that survives the third-party round trip. Not httpOnly (set from
// JS by design); the server whitelists the value before persisting it.
export function markSignupSource(source: string): void {
  const safe = parseSignupSource(source) ?? "other";
  trackEvent("sign_in_click", { source: safe });
  stashSignupSource(safe);
}

/** Cookie only, no event — for attribution that isn't a click (a ?src= landing). */
export function stashSignupSource(source: string): void {
  const safe = parseSignupSource(source) ?? "other";
  try {
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${safe}; path=/; max-age=1800; samesite=lax`;
  } catch {
    /* non-browser / privacy mode */
  }
}

/** The source a recent click already stashed, or null. */
export function readSignupSource(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SIGNUP_SOURCE_COOKIE}=([^;]*)`));
    return parseSignupSource(m ? decodeURIComponent(m[1]) : null);
  } catch {
    return null;
  }
}
