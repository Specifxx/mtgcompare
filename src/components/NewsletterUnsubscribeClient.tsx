"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = { phase: "loading" } | { phase: "ready"; email: string } | { phase: "done"; removed: number } | { phase: "invalid" };

// Token-addressed unsubscribe page reached from the footer of every newsletter
// email — RiftCompare's NewsletterUnsubscribeClient, ported in wave 2.
// Confirms via POST so inbox link-prefetchers can't unsubscribe people.
export function NewsletterUnsubscribeClient({ token, emailOn = false }: { token: string; emailOn?: boolean }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ phase: "invalid" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data: { active: boolean; email?: string } = await res.json();
        if (cancelled) return;
        if (!data.active || !data.email) setState({ phase: "done", removed: 0 });
        else setState({ phase: "ready", email: data.email });
      } catch {
        if (!cancelled) setState({ phase: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirm() {
    setWorking(true);
    try {
      const res = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      setState({ phase: "done", removed: data.removed ?? 0 });
    } catch {
      setState({ phase: "invalid" });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card p-6">
      {state.phase === "loading" && <p className="text-sm text-slate-400">Loading…</p>}

      {state.phase === "invalid" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">Link not valid</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            This unsubscribe link looks broken or has already been used.{emailOn ? " If you keep getting emails, reply to one and we'll sort it out." : ""}
          </p>
          <Link href="/" className="btn-ghost mt-4">
            Back to MTG Compare
          </Link>
        </>
      )}

      {state.phase === "ready" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">Unsubscribe from the weekly summary</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Stop the weekly Index summary for <strong className="text-white">{state.email}</strong>? Any watchlist price-drop alerts you have are separate and won&apos;t be affected.
          </p>
          <button onClick={confirm} disabled={working} className="btn-primary mt-4 w-full">
            {working ? "Unsubscribing…" : "Unsubscribe"}
          </button>
          <Link href="/" className="mt-2 block text-center text-xs text-slate-500 hover:text-slate-300">
            Keep my subscription
          </Link>
        </>
      )}

      {state.phase === "done" && (
        <>
          <h1 className="font-display text-xl font-bold text-white">You&apos;re unsubscribed</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {state.removed > 0
              ? "You won't get any more weekly summaries. You can rejoin any time from the footer of the site."
              : "You're already off the list — this link has no active subscription."}
          </p>
          <Link href="/" className="btn-ghost mt-4">
            Back to MTG Compare
          </Link>
        </>
      )}
    </div>
  );
}
