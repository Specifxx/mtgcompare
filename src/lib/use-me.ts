"use client";

// The visitor's account state, for the header and the ad-free switch. The
// browser asks /api/me ONLY when the readable mc_auth hint cookie says someone
// signed in on this device, so signed-out visitors (most of them) cost no
// request. One fetch per page load, shared by every caller.
import { useEffect, useState } from "react";
import type { Tier } from "./plans";

export interface Me {
  user: { name: string; email: string; avatar: string | null } | null;
  tier: Tier | null;
  adFree: boolean;
  until: string | null;
  admin: boolean; // the caller's own flag, only to show the menu's "Admin" link
  createdAt: string | null; // the account's creation time (ISO), for the slide-in's 48-hour rule
  // Wave 2 (member track; RiftCompare's /api/me fields):
  trialing: boolean; // inside a trial — no plan switch offered (MTG Compare sells none; false)
  interval: "month" | "year" | null; // a Plus member's own billing interval, for the upgrade quote
  unreadCount: number; // unread in-app notifications (the alerts' delivery while email is off)
  preferredCountry: string | null; // the market the welcome checklist saved
  userId: string | null; // opaque, for the referral link
  billing: boolean; // the account has a Stripe customer (Manage subscription)
  emailOn: boolean; // site-wide: may alert copy promise an email? (getEmailStatus; off until a mailer exists)
}

export const SIGNED_OUT: Me = {
  user: null,
  tier: null,
  adFree: false,
  until: null,
  admin: false,
  createdAt: null,
  trialing: false,
  interval: null,
  unreadCount: 0,
  preferredCountry: null,
  userId: null,
  billing: false,
  emailOn: false,
};
const AD_FREE_COOKIE = "mc_adfree";

let pending: Promise<Me> | null = null;

function hasCookie(name: string): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith(`${name}=`) && c !== `${name}=`);
}

export function fetchMe(): Promise<Me> {
  if (!hasCookie("mc_auth")) return Promise.resolve(SIGNED_OUT);
  pending ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<Me>>).then((m): Me => ({ ...SIGNED_OUT, ...m, admin: m.admin === true })) : SIGNED_OUT))
    .catch(() => SIGNED_OUT);
  return pending;
}

export function invalidateMe() {
  pending = null;
  window.dispatchEvent(new Event("mc:me"));
}

// Refresh on window focus (wave 2): the unread count and a plan change made in
// another tab (or Stripe's checkout) show up when the visitor comes back,
// without polling. At most once a minute, and only for a signed-in visitor.
let lastFocusRefresh = 0;
let focusListening = false;
function listenFocus() {
  if (focusListening || typeof window === "undefined") return;
  focusListening = true;
  window.addEventListener("focus", () => {
    if (!hasCookie("mc_auth") || Date.now() - lastFocusRefresh < 60_000) return;
    lastFocusRefresh = Date.now();
    invalidateMe();
  });
}

/** Keep the ad-free first-paint hint (read by AD_FREE_BOOT_SCRIPT) in step with the account. */
function syncAdFree(adFree: boolean) {
  try {
    if (adFree) document.cookie = `${AD_FREE_COOKIE}=1; path=/; max-age=${31 * 86400}; samesite=lax`;
    else if (hasCookie(AD_FREE_COOKIE)) document.cookie = `${AD_FREE_COOKIE}=; path=/; max-age=0`;
    document.documentElement.toggleAttribute("data-adfree", adFree);
  } catch {
    /* cookies blocked */
  }
}

export function useMe(): { me: Me; loaded: boolean } {
  const [state, setState] = useState<{ me: Me; loaded: boolean }>({ me: SIGNED_OUT, loaded: false });
  useEffect(() => {
    let live = true;
    const load = () =>
      fetchMe().then((me) => {
        if (!live) return;
        syncAdFree(me.adFree);
        setState({ me, loaded: true });
      });
    load();
    lastFocusRefresh ||= Date.now();
    listenFocus();
    window.addEventListener("mc:me", load);
    return () => {
      live = false;
      window.removeEventListener("mc:me", load);
    };
  }, []);
  return state;
}
