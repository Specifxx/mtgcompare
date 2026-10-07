// The ONE definition of "a safe internal path to return to after sign-in",
// ported from RiftCompare. ?next= rides in URLs, so it is attacker-influencable:
// it must be a same-origin absolute path, never protocol-relative ("//evil"),
// never an API route, and never contain a backslash or control character (the
// URL parser reads "\" as "/" and strips tabs, so "/\evil.com" resolves off-site).
const UNSAFE_CHARS = /[\\\x00-\x20\x7f]/;

/** Where a sign-in with no destination lands. */
export const POST_SIGN_IN_FALLBACK = "/dashboard";

export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api")) return null;
  if (UNSAFE_CHARS.test(next)) return null;
  try {
    const probe = new URL(next, "https://same-origin.invalid");
    if (probe.origin !== "https://same-origin.invalid" || probe.pathname.startsWith("/api")) return null;
  } catch {
    return null;
  }
  return next;
}
