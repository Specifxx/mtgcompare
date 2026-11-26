"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { openBilling, trackPremium, readStored, refreshPremium, startCheckout, untilLine, writeStored } from "@/lib/premium-member";
import { usePremium } from "./usePremium";
import { PassOffers } from "./PassOffers";

type Plan = "monthly" | "annual";
const PLANS: Record<Plan, { price: string; per: string; note: string }> = {
  monthly: { price: "US$4.99", per: "/month", note: "Billed monthly after your 14 free days" },
  annual: { price: "US$39.99", per: "/year", note: "US$3.33 a month, billed yearly after 14 free days (save 33%)" },
};

const FEATURES = [
  "A year of collection value history, and your collection as a spreadsheet",
  "Up to 200 price alerts (free: 25) and one-tap back-in-stock alerts",
  "Your watch list with today's lowest price",
  "No banner ads, on every page and on your phone",
  "One account across all our price comparison sites",
];

/**
 * The /premium plan card: pick monthly or yearly, start the 14-day trial (Stripe Checkout, opened from here for the signed-in account),
 * or, for a member, their status and "Manage billing" (Stripe's portal). Signed out, "Start free trial" signs in on /account first and
 * comes back. Everything happens on mtgcompare.app and Stripe; the visitor never visits RiftCompare (owner, 2026-11-10).
 */
export function PremiumPanel() {
  const v = usePremium();
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const p = q.get("plan");
    if (p === "monthly" || p === "annual") setPlan(p);
    if (q.get("welcome") === "1") {
      setWelcome(true);
      history.replaceState(null, "", location.pathname);
      // Stripe's webhook lands within seconds; ask again so the page shows the new membership.
      const again = (n: number) =>
        refreshPremium(true).then((info) => {
          if (info?.premium) location.reload();
          else if (n > 0) setTimeout(() => again(n - 1), 3000);
        });
      again(5);
    }
  }, []);

  useEffect(() => {
    if (v.status !== "loading") trackPremium("premium_view", { state: v.status });
    // once per page view, when the membership state is known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.status === "loading"]);

  async function trial() {
    const cur = readStored();
    trackPremium("premium_trial_click", { plan, signed_in: !!cur });
    if (!cur) {
      location.href = `/account?next=${encodeURIComponent(`/premium?plan=${plan}`)}`;
      return;
    }
    setBusy(true);
    setNote("");
    const r = await startCheckout(cur.t, plan);
    if ("url" in r) {
      trackPremium("premium_checkout_open", { plan });
      location.href = r.url;
      return;
    }
    setBusy(false);
    if (r.signIn) location.href = `/account?next=${encodeURIComponent(`/premium?plan=${plan}`)}`;
    else setNote(r.message);
  }

  async function billing() {
    const cur = readStored();
    if (!cur) return;
    setBusy(true);
    const r = await openBilling(cur.t);
    if ("url" in r) location.href = r.url;
    else {
      setBusy(false);
      setNote(r.message);
    }
  }

  if (v.status === "member") {
    return (
      <div className="card overflow-hidden">
        <div className="bg-brand-soft px-6 py-4">
          <p className="font-display text-lg font-bold">{welcome ? "Welcome to Premium!" : "You're a Premium member"}</p>
          <p className="text-sm text-muted">
            {v.info.who ? `Signed in as ${v.info.who}` : "Signed in"}
            {untilLine(v.info.until) ? ` · current period ends ${untilLine(v.info.until)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 p-6">
          <Link href="/watches" className="btn-primary">My watches</Link>
          <button type="button" className="btn-ghost" disabled={busy} onClick={billing}>Manage billing</button>
          <button type="button" className="btn-ghost" onClick={() => { writeStored(null); location.reload(); }}>Sign out</button>
        </div>
        {note && <p className="px-6 pb-4 text-sm text-red-600" aria-live="polite">{note}</p>}
      </div>
    );
  }

  const p = PLANS[plan];
  return (
    <div className="card overflow-hidden">
      <div className="p-6 sm:p-8">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-line bg-bg p-1 text-sm font-semibold">
          {(["monthly", "annual"] as Plan[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={plan === k}
              onClick={() => setPlan(k)}
              className={`rounded-full px-4 py-1.5 transition-colors ${plan === k ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
            >
              {k === "monthly" ? "Monthly" : "Yearly · save 33%"}
            </button>
          ))}
        </div>
        <p className="mt-5 flex items-baseline gap-1">
          <span className="font-display text-4xl font-bold">{p.price}</span>
          <span className="text-muted">{p.per}</span>
        </p>
        <p className="mt-1 text-sm text-muted">{p.note}. Cancel any time.</p>
        <ul className="mt-5 grid gap-2 text-sm">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className="font-bold text-brand-strong">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <button type="button" onClick={trial} disabled={busy || v.status === "loading"} className="btn-primary mt-6 w-full justify-center py-3 text-base">
          {busy ? "Opening secure checkout…" : "Start 14-day free trial"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Card needed for the trial · secure checkout by Stripe · no charge for 14 days</p>
        {note && <p className="mt-3 text-sm text-red-600" aria-live="polite">{note}</p>}
      </div>
      {v.status === "free" && <PassOffers />}
      <div className="border-t border-line bg-bg px-6 py-3 text-sm">
        {v.status === "free" ? (
          <span className="text-muted">
            Signed in{v.info.who ? ` as ${v.info.who}` : ""}.{" "}
            <button type="button" className="underline" onClick={() => { writeStored(null); location.reload(); }}>Sign out</button>
          </span>
        ) : (
          <span className="text-muted">
            Already a member? <Link className="font-semibold text-ink underline" href="/account">Sign in</Link>
          </span>
        )}
      </div>
    </div>
  );
}
