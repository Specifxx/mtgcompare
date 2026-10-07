// WHICH SURFACE SENT SOMEONE TO PLUS / PREMIUM — one vocabulary for the
// premium-interest beacon (/api/premium/click → PremiumClick) and the
// /admin/premium report. RiftCompare's lib/premium-surface.ts, One Piece's
// surfaces.
//
// Client-safe: no server imports. The route validates with isPlanClickSurface
// before anything reaches the database, so a crafted body cannot write
// arbitrary strings.
import { isTier, type Tier } from "./plans";
import { rememberPremiumSurface } from "./premium-surface";

// Steps of the purchase itself, and the generic fallback.
const FIXED = new Set(["dialog", "checkout", "premium-page", "slidein", "annual-switch", "checklist"]);

// Scoped surfaces: `nav:header`, `gate:basket`, `tip:sealed` … The suffix
// names the place; the prefix is the kind of surface.
//   nav:   a Pricing link (header, rail, avatar menu, phone menu)
//   gate:  a wall in front of a paid tool (Deal Finder, Best Basket)
//   nudge: an in-page pitch (movers, card page)
//   tip:   a one-line DiscoveryTip where a paid feature lives
//   limit: the free-limit panel, where an add hit the free cap (wave 2)
const SCOPED = /^(nav|gate|nudge|tip|limit):[a-z0-9-]{1,32}$/;

export function isPlanClickSurface(v: unknown): v is string {
  return typeof v === "string" && (FIXED.has(v) || SCOPED.test(v));
}

/** A beacon body as the route accepts it; anything unreadable becomes "dialog" with no tier. */
export function parsePlanClick(body: unknown): { surface: string; tier: Tier | null } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { surface: isPlanClickSurface(b.surface) ? b.surface : "dialog", tier: isTier(b.tier) ? b.tier : null };
}

/**
 * Fire-and-forget premium-interest beacon. sendBeacon (survives navigation),
 * falling back to a keepalive fetch; never throws.
 */
export function firePlanClick(surface: string, tier?: Tier | null): void {
  if (typeof window === "undefined") return;
  // Carried into checkout (lib/premium-surface.ts), stamped on the checkout row.
  rememberPremiumSurface(surface);
  try {
    const body = JSON.stringify({ surface, tier: tier ?? null });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/premium/click", blob)) return;
    void fetch("/api/premium/click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* a beacon never surfaces an error */
  }
}
