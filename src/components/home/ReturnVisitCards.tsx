"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { NavIcon } from "@/components/NavIcon";
import { CardsIcon } from "@/components/icons/HomeIcons";

// RiftCompare's ReturnVisitCards: three card-surface tiles that give a visitor
// a reason to come back. RiftCompare's pack simulator and Riftle tiles are
// games, which MTG Compare drops (owner: "drop the games"), so the three are
// the watchlist, Box EV and the deck pricer.
export function ReturnVisitCards({ newestSetCode }: { newestSetCode?: string }) {
  return (
    <>
      <Link
        href="/watching"
        onClick={() => trackEvent("watchlist_cta_click", { source: "home" })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <NavIcon name="heart" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Watching a card?</h2>
          <p className="mt-0.5 text-sm text-slate-400">Heart it to keep it on your watchlist, its price one tap away — free.</p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Start →</span>
      </Link>
      <Link
        href="/tools/box-ev"
        onClick={() => trackEvent("boxev_cta_click", { source: "home" })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
          <NavIcon name="gift" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Is a booster box worth it?</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Box EV weighs {newestSetCode ? `a ${newestSetCode}` : "a booster"} box&apos;s price against what you&apos;d expect to pull, at live card prices.
          </p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Check →</span>
      </Link>
      <Link
        href="/deck"
        onClick={() => trackEvent("deck_cta_click", { source: "home" })}
        className="card-surface group flex items-center gap-4 p-5 transition-colors hover:border-brand-500/60 hover:bg-ink-800"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <CardsIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-white">Price your deck</h2>
          <p className="mt-0.5 text-sm text-slate-400">Paste a decklist and see what it costs at the cheapest store for every card.</p>
        </div>
        <span className="btn-primary shrink-0 text-sm">Price it →</span>
      </Link>
    </>
  );
}
