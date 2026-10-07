"use client";

import { useEffect, useState } from "react";
import { invalidateMe } from "@/lib/use-me";

// Entitlement is granted by the Stripe WEBHOOK, not by the browser coming back
// from checkout — so for a second or two after paying, the account is still on
// the free tier. This polls /api/me until the webhook lands, then renders the
// real "you're in" state (RiftCompare's PremiumActivationPoller, ported in wave
// 2; replaces wave 1's WelcomePoller). Deliberately NOT a synchronous Stripe
// reconcile: the webhook retries for days and the daily reconcile is behind it,
// so nothing is lost if this poll gives up first.
const POLL_MS = 1500;
const GIVE_UP_MS = 20_000;

export function PremiumActivationPoller({ children }: { children: React.ReactNode }) {
  const received = "Payment received ✓";
  const [state, setState] = useState<"waiting" | "ready" | "slow">("waiting");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const d = r.ok ? ((await r.json()) as { tier?: string | null }) : null;
        if (cancelled) return;
        if (d?.tier) {
          // Drop the cached session so the header, the ad slots and every other
          // useMe() consumer pick up the new tier on this same page view.
          invalidateMe();
          setState("ready");
          return;
        }
      } catch {
        /* transient — the retry below covers it */
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= GIVE_UP_MS) {
        setState("slow");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (state === "ready") return <>{children}</>;

  if (state === "slow") {
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-sm font-semibold text-white">{received}</p>
        <p className="mt-2 text-sm text-slate-300">
          Your access is being switched on. It usually takes a few seconds — refresh this page, or open{" "}
          <a href="/premium" className="text-brand-400 hover:underline">
            your membership page
          </a>
          . If it still isn&apos;t on shortly,{" "}
          <a href="/contact" className="text-brand-400 hover:underline">
            tell us
          </a>{" "}
          and we&apos;ll sort it — your payment is safe either way.
        </p>
      </div>
    );
  }

  return (
    <div className="card-surface p-6 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-white">{received}</p>
      <p className="mt-1 text-sm text-slate-400">Switching your account over…</p>
    </div>
  );
}
