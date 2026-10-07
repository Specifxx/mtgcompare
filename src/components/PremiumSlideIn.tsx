"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { accountAgeMs, capsAllow, premiumSlideInEligible } from "@/lib/nudge-gate";
import { armNudge, readStoredNum, useSessionViews } from "@/lib/nudge-runtime";
import { firePlanClick } from "@/lib/nudge-surface";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "@/lib/nudge-timing";
import { TIER_NAMES, planPrice, type Tier } from "@/lib/plans";
import { useMe } from "@/lib/use-me";
import { Icon } from "./Icon";
import { usePlanDialog } from "./PlanProvider";
import { usePlanProof } from "./PremiumProofLine";
import { TierComparisonTable } from "./TierComparisonTable";

// A LOW-INTRUSION corner card for SIGNED-IN accounts with no paid tier
// (RiftCompare's PremiumSlideIn, a straight port of its rules):
//   • only while checkout is open (Stripe configured) — there is nothing to
//     sell otherwise;
//   • from the 3rd page view of the session, on an account at least 48 hours
//     old, never on /login /premium /tools /watchlist /account /admin
//     (lib/nudge-gate.ts);
//   • 12 seconds after it became eligible, at a quiet moment: never over an
//     open dialog, mid-scroll or while typing (lib/nudge-runtime.ts);
//   • once per session; a dismissal snoozes it 7 days, a click 14 days, and
//     two dismissals end it for good (lib/nudge-timing.ts).
// The button goes straight to /premium (no dialog in between).
const SESSION_SEEN = "oc_prem_slidein_session"; // sessionStorage
const DISMISS_COUNT = "oc_prem_slidein_dismisses"; // localStorage: lifetime dismissals
const SNOOZE_UNTIL = "oc_prem_slidein_until"; // localStorage: epoch ms
const PV_KEY = "oc_prem_slidein_pv"; // sessionStorage: signed-in page views

// One honest line per kind of page, naming the paid feature that fits it.
const CONTEXT_PITCH: { prefixes: string[]; tier: Tier; heading: string; line: string }[] = [
  {
    prefixes: ["/card/"],
    tier: "plus",
    heading: "Deal Finder shows every card under TCGplayer market",
    line: "Every One Piece card whose cheapest listing at a real store in your market sits under TCGplayer's market price, at every price level. Your free account shows the top three; Plus shows them all, with no ads.",
  },
  {
    prefixes: ["/movers", "/market", "/price-guide"],
    tier: "plus",
    heading: "Know whether today's price is a good one",
    line: "Movers say a price changed. Plus's Deal Finder lists every card selling under TCGplayer market in your market right now, with no ads on any page.",
  },
  {
    prefixes: ["/sealed", "/sets"],
    tier: "premium",
    heading: "Premium plans which stores to buy your list from",
    line: "Paste a deck or send your watchlist and Best Basket finds the cheapest delivered way to buy it: which store for each card, postage included.",
  },
];

function contextPitchFor(pathname: string | null) {
  if (!pathname) return null;
  return CONTEXT_PITCH.find((c) => c.prefixes.some((p) => pathname.startsWith(p))) ?? null;
}

export function PremiumSlideIn() {
  const { me, loaded } = useMe();
  const dialog = usePlanDialog();
  const router = useRouter();
  const pathname = usePathname();
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false);
  const [details, setDetails] = useState(false);
  const proof = usePlanProof(shown && details);

  const signedInFree = loaded && !!me.user && !me.tier;
  const views = useSessionViews(PV_KEY, pathname, signedInFree);
  const eligible = signedInFree && Boolean(dialog?.checkoutOpen) && premiumSlideInEligible({ views, accountAgeMs: accountAgeMs(me.createdAt), pathname });

  useEffect(() => {
    if (!eligible || shown) return;
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
    const allowed = capsAllow({
      dismissals: readStoredNum(ls, DISMISS_COUNT),
      snoozeUntil: readStoredNum(ls, SNOOZE_UNTIL),
      seenThisSession: seen,
      now: Date.now(),
      maxDismissals: MAX_NUDGE_DISMISSALS,
    });
    if (!allowed) return;
    return armNudge({
      delayMs: NUDGE_DELAY_MS,
      onFire: () => {
        try {
          ss?.setItem(SESSION_SEEN, "1");
        } catch {
          /* ignore */
        }
        setShown(true);
      },
    });
  }, [eligible, shown, pathname]);

  // Entrance: mount, then slide in on the next frame.
  useEffect(() => {
    if (!shown) return setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);

  const dismiss = useCallback(() => {
    setShown(false);
    try {
      localStorage.setItem(DISMISS_COUNT, String(readStoredNum(localStorage, DISMISS_COUNT) + 1));
      localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_DISMISS_MS));
    } catch {
      /* ignore */
    }
  }, []);

  const accept = useCallback(() => {
    firePlanClick("slidein", contextPitchFor(pathname)?.tier ?? "plus");
    try {
      // Engaging is not refusing: a longer snooze, no strike.
      localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_CLICK_MS));
    } catch {
      /* ignore */
    }
    setShown(false);
    router.push("/premium");
  }, [router, pathname]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.ocDialog !== "1") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!shown) return null;
  const pitch = contextPitchFor(pathname);
  const tier: Tier = pitch?.tier ?? "plus";
  const heading = pitch?.heading ?? "Never overpay for a One Piece card";
  const line = pitch?.line ?? "You've been comparing prices. Plus shows every Deal Finder deal with no ads; Premium also plans which stores to buy your list from.";

  return (
    <div
      role="region"
      aria-label="OP Compare Plus and Premium offer"
      data-nudge="slidein"
      className={`fixed z-[70] w-[calc(100%-2rem)] transition-[opacity,transform] duration-slow ease-out ${details ? "max-w-[23rem]" : "max-w-[20rem]"} ${entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0"}`}
      style={{ left: "calc(var(--sidenav-w) + 1rem)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="relative max-h-[min(80dvh,calc(100dvh-6rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-gold/50 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-ink-900 py-1 pl-4 pr-1">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">{TIER_NAMES[tier]}</span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-100">{heading}</span>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="tap-icon shrink-0 self-start rounded-lg text-slate-400 hover:bg-ink-800 hover:text-white">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pb-1.5 pt-0.5">
          <p className="text-xs text-slate-400">
            <span className="font-bold text-white">{tier === "plus" ? "From " : ""}{planPrice(tier, "month")}/mo</span> · cancel anytime
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={accept} className="btn-primary min-h-11 flex-1 px-3 text-xs">
              See Plus &amp; Premium →
            </button>
            <button type="button" onClick={dismiss} className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-ink-800 hover:text-slate-300">
              Not now
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            aria-expanded={details}
            aria-controls="plan-slidein-details"
            className="mt-0.5 flex min-h-11 w-full items-center justify-between rounded-lg px-1 text-xs font-semibold text-slate-300 hover:text-white"
          >
            See what&apos;s included
            <Icon name="chevron" className={`h-3.5 w-3.5 text-slate-500 transition-transform ${details ? "rotate-180" : ""}`} />
          </button>
        </div>
        {details ? (
          <div id="plan-slidein-details" className="border-t border-ink-800">
            <div className="px-4 pt-3">
              <p className="text-xs leading-relaxed text-slate-400">{line}</p>
              {proof != null && proof >= 5 ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  <span className="font-bold text-white">{proof.toLocaleString("en-US")} cards below TCGplayer market</span> on Deal Finder right now.
                </p>
              ) : null}
            </div>
            <div className="mt-2 px-2 pb-2">
              <TierComparisonTable compact />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
