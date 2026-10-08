"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PricingCards } from "@/components/PricingCards";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { SubscriptionActions } from "@/components/SubscriptionActions";
import { TIER_NAMES, planPrice, type Interval, type Tier } from "@/lib/plans";
import { accessFor, type Feature } from "@/lib/premium-gates";
import { useMe } from "@/lib/use-me";

// The top of /premium: the pricing cards for everyone who is not a member,
// and, once /api/me says the visitor IS Plus or Premium, their subscription
// instead — RiftCompare's member view (the "Your subscription" card with
// SubscriptionActions, then the member quick links), ported in wave 2
// (2026-10-03). The page itself stays static; who the visitor is is learned
// here, client-side, like the header.
interface Sub {
  tier: Tier;
  interval: Interval | null;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  annualAvailable?: boolean;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

export function PremiumPlans({ checkoutOpen }: { checkoutOpen: boolean }) {
  const { me, loaded } = useMe();
  if (!loaded || !me.tier) return <PricingCards checkoutOpen={checkoutOpen} />;
  return <MemberView tier={me.tier} until={me.until} admin={me.admin} checkoutOpen={checkoutOpen} />;
}

function MemberView({ tier, until, admin, checkoutOpen }: { tier: Tier; until: string | null; admin: boolean; checkoutOpen: boolean }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [settled, setSettled] = useState(false);
  const [reload, setReload] = useState(0);
  const [keepParam, setKeepParam] = useState(false);
  useEffect(() => setKeepParam(new URLSearchParams(window.location.search).get("keep") === "1"), []);
  useEffect(() => {
    let live = true;
    fetch("/api/premium/subscription", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { subscription?: Sub | null } | null) => live && setSub(d?.subscription ?? null))
      .catch(() => {})
      .finally(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [reload]);

  const shownTier = sub?.tier ?? tier;
  // A paid tool is a quick link only where this member's tier opens it in FULL (the gate module decides, lib/premium-gates.ts): Plus gets Deal Finder, Premium also Rising Cards and Demand Finder.
  const opens = (feature: Feature) => accessFor(feature, { signedIn: true, tier: shownTier }) === "full";
  const keep =
    sub?.cancelAtPeriodEnd && sub.periodEnd ? { line: `${planPrice(shownTier, sub.interval ?? "month")}/${sub.interval === "year" ? "yr" : "mo"}`, from: day(sub.periodEnd) } : null;

  return (
    <div className="mx-auto max-w-3xl" data-member-view>
      <div className="mx-auto mt-2 max-w-md rounded-xl border border-ink-700 bg-ink-900 px-5 py-4 text-center">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Your subscription</div>
        {!settled ? (
          <div className="mx-auto mt-3 h-4 w-48 animate-pulse rounded bg-ink-800" />
        ) : sub ? (
          <div className="mt-2 space-y-1 text-sm text-slate-300">
            <p className="font-semibold text-white">
              {TIER_NAMES[shownTier]} · {sub.status === "trialing" ? "Trial" : sub.interval === "year" ? "Annual plan" : "Monthly plan"}
            </p>
            <p>
              {sub.cancelAtPeriodEnd && sub.periodEnd ? (
                <>Access ends {day(sub.periodEnd)} — won&apos;t renew</>
              ) : sub.status === "past_due" ? (
                <>Your last payment didn&apos;t go through. Update your card in billing to keep {TIER_NAMES[shownTier]}.</>
              ) : sub.periodEnd ? (
                <>Renews {day(sub.periodEnd)}</>
              ) : null}
            </p>
            <SubscriptionActions
              tier={shownTier}
              interval={sub.interval}
              annualAvailable={!!sub.annualAvailable}
              canManageBilling={checkoutOpen}
              trialing={sub.status === "trialing"}
              keep={keep}
              highlightKeep={keepParam}
              onChanged={() => setReload((n) => n + 1)}
            />
          </div>
        ) : admin ? (
          <p className="mt-2 text-sm text-slate-300">Admin access — every Premium feature, no subscription required.</p>
        ) : until ? (
          <p className="mt-2 text-sm text-slate-300">
            {TIER_NAMES[tier]} until {day(until)}
          </p>
        ) : null}
      </div>

      {/* Member quick links — only what this member can open. Best Basket's
          plan, Rising Cards and Demand Finder are dropped for a Plus member
          rather than bouncing them into a wall; the upgrade path is the card above. */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
        <Link href="/dashboard" className="btn-primary">
          ◆ Your dashboard
        </Link>
        {opens("deal-finder") && (
          <Link href="/tools/deal-finder" className="btn-ghost">
            Deal Finder
          </Link>
        )}
        {opens("rising") && (
          <Link href="/tools/rising" className="btn-ghost">
            Rising Cards
          </Link>
        )}
        <Link href="/watching" className="btn-ghost">
          Watchlist &amp; target alerts
        </Link>
        {shownTier !== "plus" && (
          <Link href="/tools/best-basket" className="btn-ghost">
            Best Basket
          </Link>
        )}
        {opens("demand") && (
          <Link href="/tools/demand" className="btn-ghost">
            Demand Finder
          </Link>
        )}
        <Link href="/portfolio" className="btn-ghost">
          Portfolio
        </Link>
        <Link href="/portfolio/sets" className="btn-ghost">
          Set checklist
        </Link>
        {checkoutOpen && !sub && settled && !admin ? <ManageSubscriptionButton /> : null}
      </div>
    </div>
  );
}
