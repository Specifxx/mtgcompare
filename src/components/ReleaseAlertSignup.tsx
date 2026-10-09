"use client";

import { useEffect, useState } from "react";
import { useCountry } from "./CountryProvider";
import type { ReleaseAlertSource } from "@/lib/release-alerts";

// The one-field "email me when {set} lands" signup (lib/release-alerts.ts) —
// RiftCompare's ReleaseAlertSignup, ported in wave 2 (2026-10-03). Same consent
// line as the price-alert modal ("... Unsubscribe anytime."), and the same
// remembered address (mc:alert_email) so a visitor who already set an alert
// types nothing twice. Mounted only inside <EmailOnly>: while email is off no
// email field renders.
const SAVED_EMAIL_KEY = "mc:alert_email";

export function ReleaseAlertSignup({
  setSlug,
  setName,
  source,
  cardId,
  cardName,
  heading,
  className = "",
}: {
  setSlug: string;
  setName: string;
  source: ReleaseAlertSource;
  /** A card page's own card: the singles email waits for THIS card's first price. */
  cardId?: number;
  cardName?: string;
  heading?: string;
  className?: string;
}) {
  const { country } = useCountry();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" } | { kind: "error"; msg: string }>({ kind: "idle" });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      /* storage blocked — the field simply starts empty */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/alerts/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, setSlug, cardId, market: country, source, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "error", msg: data?.error ?? "Something went wrong — please try again." });
      try {
        localStorage.setItem(SAVED_EMAIL_KEY, email.trim().toLowerCase());
      } catch {
        /* ignore */
      }
      setState({ kind: "ok" });
    } catch {
      setState({ kind: "error", msg: "Network error — please try again." });
    }
  }

  const what = cardName ? `when a store lists ${cardName}` : `when ${setName} singles get store prices`;

  return (
    <div data-release-alert={source} className={`card-surface p-4 sm:p-5 ${className}`}>
      <h2 className="text-base font-bold text-white">{heading ?? `Get told when ${setName} lands`}</h2>
      {state.kind === "ok" ? (
        <p role="status" className="mt-2 text-sm text-brand-300">
          You&apos;re on the list. We&apos;ll email you {what}, and once if sold-out pre-orders restock.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-2">
          <p className="text-sm leading-relaxed text-slate-300">
            We&apos;ll email you {what}, and once if sold-out pre-orders restock — two emails at most. Unsubscribe anytime.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              autoComplete="email"
              aria-label="Email address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input min-w-0 flex-1"
            />
            <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            <button type="submit" disabled={state.kind === "busy"} className="btn-primary shrink-0">
              {state.kind === "busy" ? "Signing up…" : "Email me"}
            </button>
          </div>
          {state.kind === "error" && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {state.msg}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function ReleaseAlertStop({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function stop() {
    setState("busy");
    const res = await fetch(`/api/alerts/release/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }
  return (
    <div className="card-surface p-6 text-center">
      <h1 className="text-xl font-bold text-white">Stop release alerts</h1>
      {state === "done" ? (
        <p className="mt-3 text-sm text-slate-300">Done — you won&apos;t get any more release alerts at this address.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-300">This stops every set release alert for your address. Price alerts are separate.</p>
          <button onClick={stop} disabled={!token || state === "busy"} className="btn-primary mt-5">
            {state === "busy" ? "Stopping…" : "Stop release alerts"}
          </button>
          {state === "error" && <p className="mt-3 text-sm text-red-400">Couldn&apos;t do that — the link may be incomplete.</p>}
        </>
      )}
    </div>
  );
}
