"use client";

import { useState } from "react";
import { stripeUrlIn } from "@/lib/checkout-params";
import { StripeErrorNotice } from "./StripeErrorNotice";

// Opens the Stripe Billing customer portal (update card, invoices, cancel) —
// RiftCompare's ManageSubscriptionButton, ported in wave 2 (2026-10-03). On an
// error (the portal not configured, no customer) it says so in place rather
// than dead-ending.
export function ManageSubscriptionButton({ label = "Manage subscription", className = "btn-ghost disabled:opacity-50" }: { label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/portal", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !d.url) {
        setError(d.error ?? "Couldn't open billing");
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button type="button" onClick={open} disabled={busy} className={className}>
        {busy ? "Opening…" : label}
      </button>
      {error &&
        (stripeUrlIn(error) ? (
          <StripeErrorNotice message={error} />
        ) : (
          <span role="alert" className="text-xs text-rose-400">
            {error}
          </span>
        ))}
    </span>
  );
}
