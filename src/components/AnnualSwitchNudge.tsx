"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANNUAL_MIN_VIEWS, annualOfferEligible, capsAllow, pathSkipped } from "@/lib/nudge-gate";
import { armNudge, readStoredNum, useSessionViews } from "@/lib/nudge-runtime";
import { firePlanClick } from "@/lib/nudge-surface";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS } from "@/lib/nudge-timing";
import { TIER_NAMES, annualSavingPct, planPrice, type Tier } from "@/lib/plans";
import { invalidateMe, useMe } from "@/lib/use-me";
import { Icon } from "./Icon";
import { usePlanDialog } from "./PlanProvider";

// The monthly member's "switch to yearly" offer (RiftCompare's
// AnnualSwitchNudge): one click, prorated, through /api/premium/switch-to-annual.
// Only for a paying member on a MONTHLY plan at least two months old, with the
// yearly Price set up (/api/premium/subscription says so), from the 2nd page
// view of a session, 12 s after that at a quiet moment, once per session, and
// the same caps as the slide-in except a 30-day snooze: it saves the member
// money, it is not a hard sell. Entitlement is not touched here: the webhook
// stamps the new period when Stripe confirms the switch.
const SESSION_SEEN = "mc_annual_nudge_session";
const PV_KEY = "mc_annual_nudge_pv";
const DISMISS_COUNT = "mc_annual_nudge_dismisses";
const SNOOZE_UNTIL = "mc_annual_nudge_until";
const SNOOZE_AFTER_DISMISS_MS = 30 * 864e5;
const ANNUAL_SKIP_PATHS = ["/premium", "/account", "/profile", "/login", "/admin"] as const;

export function AnnualSwitchNudge() {
  const { me, loaded } = useMe();
  const dialog = usePlanDialog();
  const pathname = usePathname();
  const member = loaded && !!me.tier && !me.admin && Boolean(dialog?.checkoutOpen);
  const views = useSessionViews(PV_KEY, pathname, member);
  // Not over /premium and /account, which carry the same switch in the page,
  // nor on sign-in or admin pages.
  const skipped = pathSkipped(pathname, ANNUAL_SKIP_PATHS);
  // The effect depends on this BOOLEAN, not on `views`: it runs once when the
  // 2nd view arrives, and a later navigation does not cancel its pending timer
  // (the one-fetch guard below would then never re-arm it).
  const pastFirstPage = views >= ANNUAL_MIN_VIEWS;
  const [phase, setPhase] = useState<"hidden" | "offer" | "working" | "done" | "error">("hidden");
  const [tier, setTier] = useState<Tier>("plus");
  const [error, setError] = useState<string | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!member || skipped || !pastFirstPage || checked.current) return;
    let ls: Storage | null = null;
    let ss: Storage | null = null;
    try {
      ls = window.localStorage;
      ss = window.sessionStorage;
    } catch {
      /* storage blocked */
    }
    let seen = false;
    try {
      seen = ss?.getItem(SESSION_SEEN) === "1";
    } catch {
      /* ignore */
    }
    if (!capsAllow({ dismissals: readStoredNum(ls, DISMISS_COUNT), snoozeUntil: readStoredNum(ls, SNOOZE_UNTIL), seenThisSession: seen, now: Date.now(), maxDismissals: MAX_NUDGE_DISMISSALS })) return;
    checked.current = true; // one subscription read per page load, at most
    let cancelled = false;
    let stop: (() => void) | undefined;
    fetch("/api/premium/subscription", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { subscription?: { tier: Tier; interval: string | null; monthsActive: number; annualAvailable: boolean; cancelAtPeriodEnd: boolean; status: string } | null } | null) => {
        const sub = d?.subscription;
        if (cancelled || !sub || !annualOfferEligible(sub)) return;
        stop = armNudge({
          delayMs: NUDGE_DELAY_MS,
          onFire: () => {
            try {
              ss?.setItem(SESSION_SEEN, "1");
            } catch {
              /* ignore */
            }
            setTier(sub.tier === "premium" ? "premium" : "plus");
            setPhase("offer");
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [member, skipped, pastFirstPage]);

  const hide = useCallback(() => setPhase("hidden"), []);
  const dismiss = useCallback(() => {
    hide();
    try {
      localStorage.setItem(DISMISS_COUNT, String(readStoredNum(localStorage, DISMISS_COUNT) + 1));
      localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_DISMISS_MS));
    } catch {
      /* ignore */
    }
  }, [hide]);

  const doSwitch = useCallback(async () => {
    setPhase("working");
    firePlanClick("annual-switch", tier);
    try {
      const r = await fetch("/api/premium/switch-to-annual", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(j.error ?? null);
        setPhase("error");
        return;
      }
      try {
        localStorage.setItem(DISMISS_COUNT, String(MAX_NUDGE_DISMISSALS)); // done: never again
      } catch {
        /* ignore */
      }
      invalidateMe();
      setPhase("done");
      setTimeout(hide, 3500);
    } catch {
      setPhase("error");
    }
  }, [hide, tier]);

  useEffect(() => {
    if (phase !== "offer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.mcDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, dismiss]);

  if (phase === "hidden") return null;
  const name = TIER_NAMES[tier];
  return (
    <div
      role="region"
      aria-label={`Switch to yearly ${name}`}
      data-nudge="annual"
      className="fixed z-[70] w-[calc(100%-2rem)] max-w-sm"
      style={{ left: "calc(var(--sidenav-w) + 1rem)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="overflow-hidden rounded-xl border border-gold/40 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-950/60 py-1 pl-4 pr-1">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">{name}</span>
          <span className="min-w-0 flex-1 text-xs font-semibold text-slate-200">{phase === "done" ? "You're on yearly billing" : "Save on your subscription"}</span>
          {phase === "offer" ? (
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="tap-icon shrink-0 rounded-lg text-slate-400 hover:bg-ink-800 hover:text-white">
              <Icon name="x" className="h-4 w-4" />
            </button>
          ) : (
            <span className="h-9 w-2" />
          )}
        </div>
        <div className="px-4 py-3">
          {phase === "done" ? (
            <p className="text-xs leading-relaxed text-slate-300">Switched. You&apos;re on the yearly plan now, at {planPrice(tier, "year")}/yr. Thanks for supporting MTG Compare.</p>
          ) : phase === "error" ? (
            <>
              <p className="text-xs leading-relaxed text-red-300">{error ?? "Couldn't switch your plan automatically."} You can change it yourself from the billing portal.</p>
              <div className="mt-3 flex items-center gap-2">
                <a href="/premium" className="btn-ghost flex-1 text-xs">
                  Manage billing →
                </a>
                <button type="button" onClick={hide} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-ink-800 hover:text-slate-300">
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-slate-400">
                You&apos;re on the monthly plan. Switch to <span className="font-semibold text-slate-200">yearly</span> and save <span className="font-semibold text-gold">{annualSavingPct(tier)}%</span>: <span className="font-semibold text-slate-200">{planPrice(tier, "year")}/yr</span>. You&apos;re billed for the year now, with credit for the rest of this month.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={doSwitch} disabled={phase === "working"} className="btn-primary min-h-10 flex-1 px-3 text-xs">
                  {phase === "working" ? "Switching…" : "Switch to yearly →"}
                </button>
                <button type="button" onClick={dismiss} disabled={phase === "working"} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-ink-800 hover:text-slate-300 disabled:opacity-60">
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
