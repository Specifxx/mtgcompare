"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { trackSignupComplete } from "@/lib/growth-events";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { isCountry } from "@/lib/country";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { markSignupSession } from "@/lib/signup-session";
import { Toast } from "./ui/Toast";

// Fires the sign_up analytics event for a BRAND-NEW account, says the account
// is ready, and completes a watch stashed before OAuth — RiftCompare's
// SignupWelcome, ported in wave 2 (2026-10-03).
//
// The OAuth callback appends ?welcome=<provider> for new accounts only; this
// component, mounted once in the root layout, turns that into one
// sign_up event, stamps `op_welcome_at` (WelcomeChecklist's 7-day window),
// marks the signup session and strips the param with router.replace — so a
// refresh or share can never re-fire it. Reads searchParams client-side only
// and renders nothing but a toast, so it leaks no per-user state into any
// cached page. Self-wrapped in <Suspense> (useSearchParams needs a boundary).
function SignupWelcomeInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const fired = useRef(false);
  const { me, loaded } = useMe();
  const { watch } = useWatchlist();
  const claimed = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ href: string; label: string } | null>(null);
  const lastToastRef = useRef<string | null>(null);
  if (toast) lastToastRef.current = toast;

  useEffect(() => {
    const welcome = searchParams?.get("welcome");
    if (!welcome || fired.current) return;
    fired.current = true;
    trackEvent("sign_up", { method: welcome });
    markSignupSession();
    // The launch promotion (lib/launch-promo.ts): the callback adds ?promo=1 when
    // this new account took one of the free Premium months. Say so everywhere,
    // /dashboard included.
    const promo = searchParams?.get("promo") === "1";
    if (promo) {
      const msg = "Your free account is ready, and your 30 days of Premium have started.";
      setToast(msg);
      setToastAction({ href: "/premium", label: "See what's included →" });
      setTimeout(() => setToast((t) => (t === msg ? null : t)), 10000);
      trackEvent("launch_promo_granted", { method: welcome });
    } else if (pathname !== "/dashboard") {
      // On /dashboard the page itself says it; anywhere else, one quiet toast.
      setToast("Your free account is ready.");
      setToastAction({ href: "/dashboard", label: "Get set up →" });
      setTimeout(() => setToast((t) => (t === "Your free account is ready." ? null : t)), 8000);
    }
    trackSignupComplete(welcome);
    try {
      localStorage.setItem("op_welcome_at", String(Date.now()));
    } catch {
      /* private mode — the checklist just never shows for this visitor */
    }
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("welcome");
    rest.delete("promo");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? "/"), { scroll: false });
  }, [searchParams, pathname, router]);

  // Complete a watch that was mid-flight when a signed-out visitor chose
  // "Continue with Google/Discord" on the price-drop alert CTA — the stash
  // survives the OAuth round trip in localStorage. New and returning sign-ins
  // alike, so it keys off the signed-in state, not the welcome param.
  useEffect(() => {
    if (!loaded || !me.user || claimed.current) return;
    let pending: { cardId?: number; slug?: string; name?: string; market?: string } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_WATCH_KEY);
      if (raw) pending = JSON.parse(raw);
      localStorage.removeItem(PENDING_WATCH_KEY);
    } catch {
      /* private mode / corrupt stash — nothing to complete */
    }
    if (typeof pending?.cardId !== "number" || !pending.slug || !isCountry(pending.market)) return;
    claimed.current = true;
    const onLimit = (l: { limit: number }) => {
      setToastAction(null);
      setToast(`That card wasn't added — your watchlist is at the free limit of ${l.limit} cards.`);
      setTimeout(() => setToast(null), 6000);
    };
    void watch({ id: pending.cardId, slug: pending.slug, name: pending.name ?? "" }, pending.market, { onLimit }).then((ok) => {
      if (ok) {
        setToastAction(null);
        setToast("Watching that card ✓ — it's on your watchlist");
        setTimeout(() => setToast(null), 5000);
      }
    });
  }, [loaded, me.user, watch]);

  return (
    <Toast
      open={!!toast}
      message={lastToastRef.current}
      action={
        toastAction ? (
          <Link href={toastAction.href} onClick={() => setToast(null)} className="shrink-0 whitespace-nowrap text-sm font-semibold text-brand-400 underline-offset-2 hover:underline">
            {toastAction.label}
          </Link>
        ) : undefined
      }
    />
  );
}

export function SignupWelcome() {
  return (
    <Suspense fallback={null}>
      <SignupWelcomeInner />
    </Suspense>
  );
}
