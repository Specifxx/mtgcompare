"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { capsAllow } from "@/lib/nudge-gate";
import { useBuyPathClear } from "@/lib/buy-intent";
import { armNudge, readStoredNum, useSessionViews } from "@/lib/nudge-runtime";
import { PROMO_DAYS, PROMO_DELAY_MS, PROMO_MAX_DISMISSALS, PROMO_SLOTS, PROMO_SNOOZE_MS, PROMO_SOURCE, promoPopupEligible, type PromoStatus } from "@/lib/launch-promo-shared";
import type { OAuthProvider } from "@/lib/oauth";
import { useMe } from "@/lib/use-me";
import { AuthForm } from "./AuthForm";
import { Icon } from "./Icon";
import { Dialog } from "./ui/Dialog";

// The launch offer, for SIGNED-OUT visitors only: "the first 50 accounts get a
// month of Premium free", with a live counter of how many are left.
//   • from the 2nd page view of a visit, 8 s after it became eligible, at a
//     quiet moment (never over another dialog or while typing — armNudge);
//   • once per visit; a dismissal rests it 3 days; three dismissals end it;
//   • it disappears for good once the 50 are claimed (the counter says 0 left);
//   • never on /login, /premium, account pages and the other skip paths;
//   • never over a buy path: on a page with a buy link it waits until the
//     visitor has clicked out to a store this session (lib/buy-intent.ts), the
//     one moment an ask cannot cost a buy_click.
// The grant itself happens server-side when a NEW account is created
// (lib/launch-promo.ts); this popup only invites and shows the counter.
const SESSION_SEEN = "mc_promo_session"; // sessionStorage
const DISMISS_COUNT = "mc_promo_dismisses"; // localStorage
const SNOOZE_UNTIL = "mc_promo_until"; // localStorage, epoch ms
const PV_KEY = "mc_promo_pv"; // sessionStorage: page views this visit

export function LaunchPromoPopup({ providers }: { providers: OAuthProvider[] }) {
  const { me, loaded } = useMe();
  const pathname = usePathname();
  const [status, setStatus] = useState<PromoStatus | null>(null);
  const [open, setOpen] = useState(false);

  const signedOut = loaded && !me.user;
  const views = useSessionViews(PV_KEY, pathname, signedOut);
  const buyPathClear = useBuyPathClear();
  const eligible = buyPathClear && promoPopupEligible({ loaded, signedIn: !!me.user, left: status ? status.left : null, views, pathname });

  const caps = useCallback(() => {
    let ls: Storage | null = null;
    let ss: Storage | null = null;
    try {
      ls = window.localStorage;
      ss = window.sessionStorage;
    } catch {
      /* storage blocked: the caps fail open to a single show */
    }
    let seen = false;
    try {
      seen = ss?.getItem(SESSION_SEEN) === "1";
    } catch {
      /* ignore */
    }
    return {
      ok: capsAllow({ dismissals: readStoredNum(ls, DISMISS_COUNT), snoozeUntil: readStoredNum(ls, SNOOZE_UNTIL), seenThisSession: seen, now: Date.now(), maxDismissals: PROMO_MAX_DISMISSALS }),
      ss,
    };
  }, []);

  // Ask for the counter only once the popup could actually show.
  useEffect(() => {
    if (!eligible || status || !caps().ok) return;
    let alive = true;
    fetch("/api/promo")
      .then((r) => (r.ok ? (r.json() as Promise<PromoStatus>) : null))
      .then((s) => {
        if (alive) setStatus(s && typeof s.left === "number" ? s : { slots: PROMO_SLOTS, claimed: PROMO_SLOTS, left: 0, days: PROMO_DAYS });
      })
      .catch(() => {
        if (alive) setStatus({ slots: PROMO_SLOTS, claimed: PROMO_SLOTS, left: 0, days: PROMO_DAYS });
      });
    return () => {
      alive = false;
    };
  }, [eligible, status, caps]);

  useEffect(() => {
    if (!eligible || !status || status.left <= 0 || open) return;
    const { ok, ss } = caps();
    if (!ok) return;
    return armNudge({
      delayMs: PROMO_DELAY_MS,
      onFire: () => {
        try {
          ss?.setItem(SESSION_SEEN, "1");
        } catch {
          /* ignore */
        }
        trackEvent("launch_promo_view", { left: status.left });
        setOpen(true);
      },
    });
  }, [eligible, status, open, pathname, caps]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_COUNT, String(readStoredNum(localStorage, DISMISS_COUNT) + 1));
      localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + PROMO_SNOOZE_MS));
    } catch {
      /* ignore */
    }
  }, []);

  if (!status) return null;
  const { slots, claimed, left } = status;
  const pct = Math.min(100, Math.max(0, Math.round((claimed / slots) * 100)));
  const next = pathname && pathname.startsWith("/") ? pathname : "/";

  return (
    <Dialog open={open} onClose={dismiss} label={`Free month of Premium for the first ${slots} members`} size="md">
      <div className="card-surface relative overflow-hidden p-5 sm:p-6" data-nudge="launch-promo">
        <button type="button" onClick={dismiss} aria-label="Close" className="tap-icon absolute right-2 top-2 rounded-lg text-slate-400 hover:bg-ink-800 hover:text-white">
          <Icon name="x" className="h-4 w-4" />
        </button>
        <span className="inline-block rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">Launch offer</span>
        <h2 className="mt-2 pr-8 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          The first {slots} members get {PROMO_DAYS} days of Premium free
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Create a free account and your month starts straight away: every Deal Finder deal, the full Rising Cards and Demand Finder lists, Best Basket, no ads. No card, and nothing to cancel. It just ends.
        </p>

        <div className="mt-4" aria-live="polite">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-200">
              <span className="num text-base font-extrabold text-white">{left}</span> of {slots} free months left
            </span>
            <span className="num text-slate-500">{claimed} claimed</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuemin={0} aria-valuemax={slots} aria-valuenow={claimed} aria-label="Free months claimed">
            <div className="h-full rounded-full bg-gold transition-[width] duration-slow" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-4">
          <AuthForm providers={providers} compact bare next={next} source={PROMO_SOURCE} onProviderClick={() => trackEvent("launch_promo_click", { left })} />
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-500">For new accounts only. Plus and Premium subscriptions are still opening soon.</p>
        <button type="button" onClick={dismiss} className="mx-auto mt-1 block min-h-11 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-ink-800 hover:text-slate-300">
          Not now
        </button>
      </div>
    </Dialog>
  );
}
