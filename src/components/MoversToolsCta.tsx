"use client";

import Link from "next/link";
import { TIER_NAMES } from "@/lib/plans";
import { useMe } from "@/lib/use-me";
import PlanButton from "./PlanButton";

// /movers' tool pointer (RiftCompare's MoversToolsCta). Movers say a price
// changed; Deal Finder says whether today's price is a good one. Members get
// their tool links; everyone else a short pitch and the Plus button.
export function MoversToolsCta() {
  const { me } = useMe();
  if (me.tier) {
    return (
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold text-white">Your deal tools</h2>
        <p className="mt-1 text-sm text-slate-400">You&apos;re on {TIER_NAMES[me.tier]}: every Deal Finder deal is unlocked, and every page is ad-free.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/tools/deal-finder" className="btn-primary text-sm">
            Deal Finder →
          </Link>
          {me.tier === "premium" ? (
            <Link href="/tools/best-basket" className="btn-ghost text-sm">
              Best Basket →
            </Link>
          ) : (
            <PlanButton surface="nudge:movers" tier="premium" className="btn-ghost text-sm">
              Best Basket&apos;s store plan is on Premium →
            </PlanButton>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="card-surface relative overflow-hidden p-5">
      <span className="chip absolute right-4 top-4 bg-gold/15 text-gold">Plus</span>
      <h2 className="pr-14 text-lg font-bold text-white">Know what a card should cost</h2>
      <p className="mt-1 max-w-xl text-sm text-slate-400">
        Movers tell you a price changed. Plus tells you whether today&apos;s price is a good one: the <strong className="text-slate-200">Deal Finder</strong> lists every Magic card selling under TCGplayer&apos;s market price at a real store in your market, at every price level, with no ads on any page.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PlanButton surface="nudge:movers" tier="plus" />
        <Link href="/tools/deal-finder" className="btn-ghost text-sm">
          Preview Deal Finder →
        </Link>
      </div>
    </section>
  );
}
