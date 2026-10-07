"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { TIER_NAMES, type Tier } from "@/lib/plans";
import type { StartPlan, StartSrc } from "@/lib/premium-start";
import { recallPremiumSurface } from "@/lib/premium-surface";

// The last step of /premium/start for a SIGNED-IN visitor: open Stripe
// (RiftCompare's CheckoutLauncher, ported in wave 2, 2026-10-03).
//
// A client component, not a server-side redirect: creating the Session in the
// page render would be a second checkout implementation beside
// /api/premium/checkout, which also writes the PremiumClick{source:"checkout"}
// row and stamps the surface. premium_checkout_started fires here BEFORE the
// fetch, and SignupWelcome (root layout) gets its chance to fire sign_up off
// ?welcome= for an account created seconds ago on the way in.
export function CheckoutLauncher({ tier, plan, back, src }: { tier: Tier; plan: StartPlan; back: string | null; src: StartSrc }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // ONE checkout session per mount: SignupWelcome strips ?welcome= with
  // router.replace, which re-renders this page with identical props.
  const launched = useRef(false);

  const launch = useCallback(async () => {
    setBusy(true);
    setError(null);
    trackEvent("premium_checkout_started", { plan, tier, source: src, via: "start" });
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, plan, back, surface: recallPremiumSurface() }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !d.url) {
        setError(d.error ?? "Couldn't start checkout");
        setBusy(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }, [tier, plan, back, src]);

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    void launch();
  }, [launch]);

  return (
    <div className="mx-auto w-full max-w-sm py-10 text-center">
      <p className="text-sm font-semibold text-white">{busy ? "Opening secure checkout…" : `Continue to ${TIER_NAMES[tier]} checkout`}</p>
      <p className="mt-1 text-xs text-slate-400">You&apos;ll finish on Stripe&apos;s secure payment page. We never see your card details.</p>

      {/* Always rendered: an auto-redirect a popup blocker, a slow network or a
          back-button return swallowed must not leave a blank screen. */}
      <button onClick={() => void launch()} disabled={busy} className="btn-primary mt-4 w-full py-3 text-center text-base">
        {busy ? "Opening checkout…" : "Continue to checkout →"}
      </button>

      {error && (
        <div role="alert" className="mt-3 text-xs">
          <p className="text-rose-400">{error}</p>
          <p className="mt-1 text-slate-400">
            <button onClick={() => void launch()} className="text-brand-400 hover:underline">
              Try again
            </button>
            {" · or "}
            <Link href="/contact" className="text-brand-400 hover:underline">
              tell us
            </Link>
            {" and we'll sort it out."}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        <Link href={back ?? "/premium"} className="hover:text-white hover:underline">
          ← Back
        </Link>
      </p>
    </div>
  );
}
