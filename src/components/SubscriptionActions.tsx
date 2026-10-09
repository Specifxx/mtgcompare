"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { invalidateMe } from "@/lib/use-me";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { TIER_NAMES, annualSavingPct, planPrice, type Tier } from "@/lib/plans";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";
import { PLUS_TARGET_ALERT_LIMIT } from "@/lib/alert-limits";

// Everything a subscriber can DO to their own plan, in one place on /premium:
// keep a plan set to end, move up a tier, move down a tier, move to annual
// billing, or open Stripe's portal to change the card or cancel —
// RiftCompare's SubscriptionActions, ported in wave 2 (2026-10-03).
//
// Each button states what happens to the money BEFORE it's pressed, because
// the actions genuinely differ:
//   • upgrade   → billed the prorated difference now, tools unlock now
//   • downgrade → credited for the unused part, applied to the next invoice
//   • annual    → billed the year now, credited for the rest of this month
//   • keep      → nothing charged before the date shown
// The wording is the display half of the routes' own proration choices
// (lib/plan-change.ts, /api/premium/switch-to-annual, /api/premium/resume);
// changing one without the other would make this card lie. None of the
// routes writes entitlement: the webhook restamps it.
export function SubscriptionActions({
  tier,
  interval,
  annualAvailable,
  targetAnnualAvailable = true,
  canManageBilling,
  trialing = false,
  keep = null,
  highlightKeep = false,
  onChanged,
}: {
  tier: Tier;
  interval: "month" | "year" | null;
  annualAvailable: boolean;
  /** The other tier has its own annual price (the switch routes keep the interval). */
  targetAnnualAvailable?: boolean;
  canManageBilling: boolean;
  /** In a trial: the plan-change routes only handle paid subscriptions. */
  trialing?: boolean;
  /** Set when the subscription is due to END: what keeping it charges, and from when. */
  keep?: { line: string; from: string } | null;
  /** Arrived from a ?keep=1 link. */
  highlightKeep?: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<null | "upgrade" | "downgrade" | "annual" | "resume">(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "upgrade" | "downgrade" | "annual" | "resume", path: string) {
    setBusy(kind);
    setError(null);
    trackEvent("subscription_change_started", { kind, from_tier: tier, source: "premium-page" });
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "resume" ? { from: highlightKeep ? "email" : "card" } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(d.error ?? "Couldn't change your plan — try again");
        setBusy(null);
        return;
      }
      trackEvent("subscription_change_success", { kind, from_tier: tier });
      invalidateMe(); // entitlement/tier changed — next /api/me reflects it
      setBusy(null);
      onChanged?.();
    } catch {
      setError("Network error — try again");
      setBusy(null);
    }
  }

  const canUpgrade = tier === "plus" && !trialing && !keep;
  const canDowngrade = tier === "premium" && !trialing && !keep;
  const canGoAnnual = annualAvailable && interval === "month" && !trialing && !keep;
  const savePct = annualSavingPct(tier);

  return (
    <div className="mt-4 border-t border-ink-800 pt-3" data-subscription-actions>
      <div className="flex flex-col gap-2">
        {keep && (
          <div id="keep" className={`rounded-lg p-2 ${highlightKeep ? "ring-2 ring-brand-500/60" : ""}`} data-keep-offer>
            <button onClick={() => act("resume", "/api/premium/resume")} disabled={busy !== null} className="btn-primary w-full py-2 text-xs">
              {busy === "resume" ? "Keeping…" : `Keep ${TIER_NAMES[tier]} — ${keep.line} from ${keep.from}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">Nothing more is charged before {keep.from}. Or do nothing and it simply ends then.</p>
          </div>
        )}
        {canUpgrade && (
          <div>
            <button onClick={() => act("upgrade", "/api/premium/upgrade")} disabled={busy !== null} className="btn-primary w-full py-2 text-xs">
              {busy === "upgrade" ? "Upgrading…" : `Upgrade to Premium — ${planSwitchPriceLabel("premium", interval, targetAnnualAvailable)}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Billed the difference for the rest of this period; the full Rising Cards and Demand Finder lists, Best Basket and Buy this list unlock straight away.
            </p>
          </div>
        )}

        {canGoAnnual && (
          <div>
            <button onClick={() => act("annual", "/api/premium/switch-to-annual")} disabled={busy !== null} className={`${canUpgrade ? "btn-ghost" : "btn-primary"} w-full py-2 text-xs`}>
              {busy === "annual" ? "Switching…" : `Switch to annual — ${planPrice(tier, "year")}/yr${savePct > 0 ? ` (save ${savePct}%)` : ""}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">Billed for the year now, with credit for the rest of this month.</p>
          </div>
        )}

        {canDowngrade && (
          <div>
            <button onClick={() => act("downgrade", "/api/premium/downgrade")} disabled={busy !== null} className="btn-ghost w-full py-2 text-xs">
              {busy === "downgrade" ? "Switching…" : `Switch down to Plus — ${planSwitchPriceLabel("plus", interval, targetAnnualAvailable)}`}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Takes effect now. The unused part of this period is credited against your next invoice; the full Rising Cards and Demand Finder lists,
              Best Basket and Buy this list lock, and target alerts go back to {PLUS_TARGET_ALERT_LIMIT} cards. Deal Finder stays in full and Plus stays ad-free.
            </p>
          </div>
        )}

        {canManageBilling && (
          <div className="pt-1">
            <ManageSubscriptionButton />
            <p className="mt-1 text-[11px] text-slate-500">Change your card, see invoices, or cancel.</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-400">
          {error}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-600">
        You&apos;re on {TIER_NAMES[tier]}
        {interval ? `, billed ${interval === "year" ? "yearly" : "monthly"}` : ""}.
      </p>
    </div>
  );
}
