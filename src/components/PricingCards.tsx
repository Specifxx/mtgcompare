"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { stripeUrlIn } from "@/lib/checkout-params";
import { INTERVALS, PLAN_FEATURES, PLAN_PITCH, TIER_NAMES, annualSavingPct, perMonth, planPrice, type Interval, type Tier } from "@/lib/plans";
import { LAUNCH_PROMO_ENABLED, PROMO_SOURCE, type PromoStatus } from "@/lib/launch-promo-shared";
import type { OAuthProvider } from "@/lib/oauth";
import { firePlanClick } from "@/lib/nudge-surface";
import { goParamToStart, intervalPlan, premiumStartHref } from "@/lib/premium-start";
import { recallPremiumSurface } from "@/lib/premium-surface";
import { trackEvent } from "@/lib/analytics";
import { useMe } from "@/lib/use-me";
import { AuthForm } from "./AuthForm";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { StripeErrorNotice } from "./StripeErrorNotice";

export { ManageSubscriptionButton };

/**
 * Start Stripe Checkout for a signed-in visitor: on success the browser is
 * already on its way to Stripe and this resolves null; otherwise it resolves
 * the error to show. Shared by these cards and the Plan dialog, so there is
 * one checkout path. The surface that sent the visitor rides along
 * (lib/premium-surface.ts) and the route records the start.
 */
export async function startCheckout(tier: Tier, iv: Interval, surface: string, back?: string | null): Promise<string | null> {
  if (surface !== "checkout") firePlanClick(surface, tier);
  trackEvent("premium_checkout_started", { plan: intervalPlan(iv), tier, source: surface });
  try {
    const r = await fetch("/api/premium/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, interval: iv, surface: recallPremiumSurface(), back: back ?? null }),
    });
    const j = (await r.json()) as { url?: string; error?: string };
    if (j.url) {
      window.location.href = j.url;
      return null;
    }
    return j.error ?? "Checkout could not start. Please try again.";
  } catch {
    return "Checkout could not start. Please try again.";
  }
}

// The /premium pricing cards — RiftCompare's PremiumPricingCards, ported in
// wave 2 (2026-10-03): ONE billing-cycle toggle above two cards (Monthly the
// default; "Annual" carries the saving), two columns at EVERY width so both
// buy buttons sit in a phone's first screen, each card a name, the real price,
// one tagline, four bullets and the button. Prices are lib/plans.ts's.
//
// Buttons: signed out → /premium/start (the sign-in step inside checkout,
// lib/premium-start.ts); signed in → straight to Stripe; a member → their
// plan (changes happen in place on the member card). The old wave-1
// `/premium?go=plus-year` links now forward to the start step.
//
// Checkout not open (`checkoutOpen` false: no Stripe key, or the TEST key the
// site runs on until the owner takes payments; decided on the server, lib/
// stripe.ts): each button is a DISABLED "Get Plus/Premium" with "Checkout opens
// soon" under it, nothing links to /premium/start, and a signed-out visitor is
// offered the launch promotion (LaunchOffer) — the one way to Premium meanwhile,
// since the popup never shows on /premium.
const CTA_BTN = "btn-primary w-full py-3.5 text-center text-base leading-tight";
export const CHECKOUT_SOON = "Checkout opens soon";

export function PricingCards({ checkoutOpen, providers = [] }: { checkoutOpen: boolean; providers?: OAuthProvider[] }) {
  const [cycle, setCycle] = useState<Interval>("month");
  const save = annualSavingPct("premium");

  // Old links: /premium?go=plus-year → the start step.
  useEffect(() => {
    const to = goParamToStart(new URLSearchParams(window.location.search).get("go"));
    if (to && checkoutOpen) window.location.replace(to);
  }, [checkoutOpen]);

  return (
    <div>
      <div role="tablist" aria-label="Billing cycle" className="mx-auto flex max-w-sm items-stretch gap-1 rounded-xl border border-ink-700 bg-ink-900/70 p-1">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            type="button"
            role="tab"
            aria-selected={cycle === iv}
            onClick={() => setCycle(iv)}
            className={`flex min-h-11 flex-1 flex-wrap items-center justify-center gap-x-1.5 rounded-lg px-3 text-center text-sm font-bold transition ${
              cycle === iv ? "bg-ink-800 text-white shadow-sm" : "text-slate-400 hover:bg-ink-800/60"
            }`}
          >
            <span className="whitespace-nowrap">{iv === "month" ? "Monthly" : "Annual"}</span>
            {iv === "year" && save > 0 && <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-400">Save {save}%</span>}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-3 grid max-w-3xl grid-cols-2 gap-2.5 sm:gap-4">
        <PaidTierCard tier="plus" tagline={PLAN_PITCH.plus} features={PLAN_FEATURES.plus} cycle={cycle} checkoutOpen={checkoutOpen} />
        <PaidTierCard tier="premium" tagline={PLAN_PITCH.premium} features={PLAN_FEATURES.premium} highlight cycle={cycle} checkoutOpen={checkoutOpen} />
      </div>
      {checkoutOpen ? (
        <>
          <p className="mt-3 text-center text-xs font-semibold text-slate-300">Cancel anytime · secure checkout by Stripe</p>
          <p className="mt-1 text-center text-[11px] text-slate-500">Prices in US dollars. Cancel from the membership page; you keep access to the end of the period you paid for.</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-center text-xs font-semibold text-slate-300" data-checkout-soon>
            {CHECKOUT_SOON}. Nothing can be charged until it does.
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-500">Prices in US dollars. Everything free stays free meanwhile.</p>
          <LaunchOffer providers={providers} />
        </>
      )}
    </div>
  );
}

/**
 * The launch promotion (lib/launch-promo.ts: the first PROMO_SLOTS NEW accounts
 * get PROMO_DAYS of Premium, granted when the account is created) for a
 * signed-out visitor while checkout is closed. It reads the same live counter as
 * the popup (/api/promo) and shows nothing until it answers, once the slots are
 * gone, or when the counter cannot be read: it never promises a slot that may
 * not exist. Signing up returns here, to the member card.
 */
function LaunchOffer({ providers }: { providers: OAuthProvider[] }) {
  const { me, loaded } = useMe();
  const [status, setStatus] = useState<PromoStatus | null>(null);
  const signedOut = loaded && !me.user;
  useEffect(() => {
    if (!signedOut || !LAUNCH_PROMO_ENABLED) return;
    let alive = true;
    fetch("/api/promo")
      .then((r) => (r.ok ? (r.json() as Promise<PromoStatus>) : null))
      .then((s) => {
        if (alive && s && typeof s.left === "number") setStatus(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedOut]);
  if (!signedOut || !status || status.left <= 0 || providers.length === 0) return null;
  return (
    <div className="mx-auto mt-4 max-w-md rounded-xl border border-gold/40 bg-gold/5 px-4 py-4 text-center" data-launch-offer>
      <span className="inline-block rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">Launch offer</span>
      <p className="mt-2 text-sm font-semibold text-white">
        The first {status.slots} new accounts get {status.days} days of Premium free.
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        <span className="num font-bold text-white">{status.left}</span> of {status.slots} left · no card, nothing to cancel
      </p>
      <div className="mt-3">
        <AuthForm providers={providers} compact bare next="/premium" source={PROMO_SOURCE} onProviderClick={() => trackEvent("launch_promo_click", { left: status.left })} />
      </div>
    </div>
  );
}

function PaidTierCard({ tier, tagline, features, highlight = false, cycle, checkoutOpen }: { tier: Tier; tagline: string; features: string[]; highlight?: boolean; cycle: Interval; checkoutOpen: boolean }) {
  const annual = cycle === "year";
  const headline = annual ? perMonth(tier) : planPrice(tier, "month");
  return (
    <div className={`card-surface relative flex flex-col overflow-hidden rounded-2xl ${highlight ? "border-2 border-gold/60 shadow-[0_8px_24px_rgba(0,0,0,0.35)]" : "border border-ink-700"}`}>
      {highlight && (
        <span className="absolute right-0 top-0 hidden rounded-bl-lg bg-gold px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-950 sm:block">Recommended</span>
      )}
      <div className={`border-b border-ink-800 px-2.5 py-2.5 text-center sm:px-5 sm:py-4 ${highlight ? "bg-gold/10" : "bg-ink-900"}`}>
        <div className={`text-base font-extrabold ${highlight ? "text-gold" : "text-white"}`}>{TIER_NAMES[tier]}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="num text-2xl font-extrabold text-white sm:text-3xl">{headline}</span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{tagline}</p>
        {annual && <p className="mt-0.5 text-[11px] font-semibold text-brand-400">Billed as {planPrice(tier, "year")}/year</p>}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2.5 px-2.5 py-2.5 sm:px-5 sm:py-4">
        <ul className="space-y-1.5 text-left text-[12px] leading-snug text-slate-300 sm:text-[13px]">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 [font-feature-settings:'lnum'_1]">
              <span className={`font-bold ${highlight ? "text-gold" : "text-brand-400"}`}>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <PlanCta tier={tier} interval={cycle} checkoutOpen={checkoutOpen} />
      </div>
    </div>
  );
}

function PlanCta({ tier, interval, checkoutOpen }: { tier: Tier; interval: Interval; checkoutOpen: boolean }) {
  const { me, loaded } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribe = async () => {
    setBusy(true);
    setError(null);
    const err = await startCheckout(tier, interval, "premium-page");
    if (err) {
      setError(err);
      setBusy(false);
    }
  };
  if (me.tier) {
    return (
      <Link href="/premium#top-pricing" className="btn-ghost w-full text-center text-sm">
        {me.tier === tier ? "Your plan" : "Change it on your plan"}
      </Link>
    );
  }
  if (!checkoutOpen) {
    // Server-decided (lib/stripe.ts checkoutOpen): the button is shown and disabled, never a link to a checkout that cannot take a payment.
    return (
      <div className="w-full">
        <button type="button" disabled aria-describedby={`checkout-soon-${tier}`} className={CTA_BTN}>
          Get {TIER_NAMES[tier]}
        </button>
        <p id={`checkout-soon-${tier}`} className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
          {CHECKOUT_SOON}
        </p>
      </div>
    );
  }
  if (!loaded || !me.user) {
    const startHref = premiumStartHref({ tier, plan: intervalPlan(interval), src: "premium-page" });
    return (
      <div className="w-full">
        <Link
          href={startHref}
          rel="nofollow"
          onClick={() => {
            firePlanClick("premium-page", tier);
            trackEvent("premium_signin_step", { tier, plan: intervalPlan(interval), source: "premium-page" });
          }}
          className={CTA_BTN}
        >
          Get {TIER_NAMES[tier]}&nbsp;→
        </Link>
      </div>
    );
  }
  return (
    <div className="w-full">
      <button type="button" onClick={subscribe} disabled={busy} className={CTA_BTN}>
        {busy ? "Opening checkout…" : `Get ${TIER_NAMES[tier]} →`}
      </button>
      {error &&
        (stripeUrlIn(error) ? (
          <StripeErrorNotice message={error} />
        ) : (
          <p role="alert" className="mt-2 text-xs text-rose-400">
            {error}
          </p>
        ))}
    </div>
  );
}

export function SignOutButton({ className = "rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-ink-800", label = "Sign out" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
        location.assign("/");
      }}
      className={className}
    >
      {busy ? "Signing out…" : label}
    </button>
  );
}
