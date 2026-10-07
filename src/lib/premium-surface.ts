// WHICH SURFACE SENT SOMEONE TO CHECKOUT — RiftCompare's remember/recall half
// of lib/premium-surface.ts, ported in wave 2 (2026-10-03). The vocabulary
// itself is lib/nudge-surface.ts (isPlanClickSurface); this file carries the
// last surface a visitor clicked through the purchase: the click remembers it
// (sessionStorage, so it survives the OAuth round trip of /premium/start), the
// checkout request sends it as `surface`, and the checkout route stamps it on
// the PremiumClick{source:"checkout"} row and the Stripe metadata — so a
// subscription can be traced to the wall, nudge or limit that started it.
//
// Client-safe: no server imports. The route validates the surface again
// before anything reaches the database.
import { isPlanClickSurface } from "./nudge-surface";

// Steps of the purchase itself (or the generic fallback): never a surface, so
// they must not overwrite the one that sent the visitor there. Someone who
// clicks the slide-in, lands on /premium and presses its buy button was sent
// by the slide-in.
const NOT_A_SURFACE = new Set(["checkout", "premium-page", "dialog"]);

export function isPremiumSurface(v: unknown): v is string {
  return isPlanClickSurface(v) && !NOT_A_SURFACE.has(v);
}

const SURFACE_KEY = "oc_premium_surface";

/** Remember the surface for the rest of this tab's session. */
export function rememberPremiumSurface(surface: string): void {
  if (!isPremiumSurface(surface)) return;
  try {
    window.sessionStorage.setItem(SURFACE_KEY, surface);
  } catch {
    /* private mode / storage disabled — attribution is best-effort */
  }
}

/** The last surface this tab clicked, or null. Validated on the way out too. */
export function recallPremiumSurface(): string | null {
  try {
    const v = window.sessionStorage.getItem(SURFACE_KEY);
    return isPremiumSurface(v) ? v : null;
  } catch {
    return null;
  }
}
