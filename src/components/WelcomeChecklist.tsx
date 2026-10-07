"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMe, invalidateMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { useWatchlist } from "@/lib/use-watchlist";
import { CardSearch, type SearchCard } from "./CardSearch";
import { COUNTRY_LIST, type Country } from "@/lib/country";
import { trackEvent } from "@/lib/analytics";
import PlanButton from "./PlanButton";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { FREE_DEAL_ROWS } from "@/lib/tier-limits";
import { isSignupSession } from "@/lib/signup-session";

const DISMISS_KEY = "op_welcome_dismissed";
// Written by SignupWelcome the moment a ?welcome landing fires.
const WELCOME_KEY = "op_welcome_at";
// The third step's fallback, before the portfolio exists: Deal Finder opened.
const DEALS_KEY = "op_welcome_deals";
const ELIGIBLE_MS = 7 * 24 * 60 * 60 * 1000;

// Inline, three-step onboarding — never a modal (RiftCompare's WelcomeChecklist,
// ported in wave 2, 2026-10-03). Eligible for a signed-in account within 7
// days of its ?welcome landing and not dismissed. Mounted at the top of
// /dashboard (where a sign-in with nowhere to return to lands), and on
// /profile (id="welcome").
//
// Steps: set your market (cookie + User.preferredCountry via
// /api/account/country), watch a card (CardSearch onPick → useWatchlist), add
// a card you own (/api/collection, the collection-alerts track's; until it
// exists the step is "Open Deal Finder's free top 3", so the count is still
// three). After a watch, a non-counted ✦ step offers Plus/Premium — no trial
// copy (OP Compare sells none).
export function WelcomeChecklist() {
  const { me, loaded } = useMe();
  const user = me.user;
  const premium = me.tier != null;
  const { country, setCountry } = useCountry();
  const { watched, watch } = useWatchlist();
  const [eligible, setEligible] = useState(false);
  const [hasCollectionItem, setHasCollectionItem] = useState<boolean | null>(null);
  const [collectionLive, setCollectionLive] = useState(true);
  const [dealsOpened, setDealsOpened] = useState(false);
  const fetchedCollection = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      setDealsOpened(localStorage.getItem(DEALS_KEY) === "1");
      const stamp = Number(localStorage.getItem(WELCOME_KEY));
      if ((Number.isFinite(stamp) && stamp > 0 && Date.now() - stamp < ELIGIBLE_MS) || isSignupSession()) setEligible(true);
    } catch {
      /* private mode — no onboarding, not worth failing over */
    }
  }, []);

  useEffect(() => {
    if (!eligible || !loaded || !user || fetchedCollection.current) return;
    fetchedCollection.current = true;
    fetch("/api/collection")
      .then((r) => {
        if (r.status === 404) {
          setCollectionLive(false);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => setHasCollectionItem(Array.isArray(d?.items) && d.items.length > 0))
      .catch(() => setHasCollectionItem(false));
  }, [eligible, loaded, user]);

  if (!loaded || !user || !eligible) return null;

  const marketDone = me.preferredCountry != null;
  const watchDone = (watched?.size ?? 0) > 0;
  const thirdDone = collectionLive ? hasCollectionItem === true : dealsOpened;
  const doneCount = [marketDone, watchDone, thirdDone].filter(Boolean).length;
  const offerPremium = !premium && watchDone;
  if (doneCount === 3 && !offerPremium) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
    setEligible(false);
  }

  async function chooseMarket(c: Country) {
    setCountry(c);
    await fetch("/api/account/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: c }) }).catch(() => null);
    invalidateMe();
  }

  const setTrackerStep = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-white">See what a set is missing</p>
      <p className="text-xs text-slate-500">
        Tick what&apos;s in your binder and the set checklist shows what&apos;s missing and the cheapest listing for each card, before postage. Free for your
        first {FREE_PORTFOLIO_LIMIT} cards.
      </p>
      <div className="mt-2">
        <Link href="/portfolio/sets" className="btn-ghost text-sm">
          Open the set checklist →
        </Link>
      </div>
    </div>
  );

  const premiumStep = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-white">See what Premium adds</p>
      <p className="text-xs text-slate-500">
        Plus and Premium watch prices for you: your own target price on cards, sealed products back in stock, and (Premium) a whole deck&apos;s
        delivered price. Plus also removes the card limits, so a whole set fits; Premium plans the order, store by store, at the condition you&apos;ll play.
      </p>
      <div className="mt-2">
        <PlanButton surface="checklist" />
      </div>
    </div>
  );

  if (doneCount === 3) {
    return (
      <section id="welcome" className="card-surface mt-5 scroll-mt-header p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-white">You&apos;re set up</h2>
          <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-300">
            3/3 done · Dismiss
          </button>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold" aria-hidden="true">
            ✦
          </span>
          {premiumStep}
        </div>
        {collectionLive && (
          <div className="mt-4 flex items-start gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400" aria-hidden="true">
              +
            </span>
            {setTrackerStep}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id="welcome" className="card-surface mt-5 scroll-mt-header p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-white">Get the most out of your account</h2>
        <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-300">
          {doneCount}/3 done · Dismiss
        </button>
      </div>

      <ul className="mt-3 space-y-4">
        <li className="flex items-start gap-3">
          <StepBadge done={marketDone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Set your market</p>
            <p className="text-xs text-slate-500">See prices and stores for where you actually shop.</p>
            {!marketDone && (
              <select
                defaultValue=""
                aria-label="Your market"
                onChange={(e) => {
                  if (e.target.value) void chooseMarket(e.target.value as Country);
                }}
                className="input mt-2 max-w-[14rem]"
              >
                <option value="" disabled>
                  Choose a market…
                </option>
                {COUNTRY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBadge done={watchDone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Watch a card</p>
            <p className="text-xs text-slate-500">
              Free: up to {FREE_WATCHLIST_LIMIT} cards, {me.emailOn ? "an email" : "flagged on your watchlist"} when one hits a new low. Plus also watches
              sealed products (back in stock); Premium watches a whole deck&apos;s delivered price.
            </p>
            {!watchDone && (
              <div className="mt-2 max-w-sm">
                <CardSearch placeholder="Search a card to watch…" onPick={(c: SearchCard) => void watch({ id: c.id, slug: c.slug, name: c.name }, country)} />
              </div>
            )}
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBadge done={thirdDone} />
          {collectionLive ? (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Add a card you own</p>
              <p className="text-xs text-slate-500">See what your collection is worth, valued live.</p>
              {!thirdDone && (
                <div className="mt-2 max-w-sm">
                  <CardSearch
                    placeholder="Search a card you own…"
                    onPick={(c: SearchCard) => {
                      fetch("/api/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: c.id }) })
                        .then((r) => {
                          if (r.ok) {
                            setHasCollectionItem(true);
                            trackEvent("collection_add", { card_id: c.id });
                          }
                        })
                        .catch(() => {});
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Open Deal Finder&apos;s free top {FREE_DEAL_ROWS}</p>
              <p className="text-xs text-slate-500">The cards selling furthest below TCGplayer&apos;s market price in your market, right now.</p>
              {!thirdDone && (
                <div className="mt-2">
                  <Link
                    href="/tools/deal-finder"
                    onClick={() => {
                      try {
                        localStorage.setItem(DEALS_KEY, "1");
                      } catch {
                        /* best-effort */
                      }
                    }}
                    className="btn-ghost text-sm"
                  >
                    Open Deal Finder →
                  </Link>
                </div>
              )}
            </div>
          )}
        </li>

        {collectionLive && hasCollectionItem && (
          <li className="flex items-start gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400" aria-hidden="true">
              +
            </span>
            {setTrackerStep}
          </li>
        )}

        {offerPremium && (
          <li className="flex items-start gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold" aria-hidden="true">
              ✦
            </span>
            {premiumStep}
          </li>
        )}
      </ul>
    </section>
  );
}

function StepBadge({ done }: { done: boolean }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-brand-500/20 text-brand-400" : "bg-ink-800 text-slate-500"}`}
      aria-hidden="true"
    >
      {done ? "✓" : ""}
    </span>
  );
}
