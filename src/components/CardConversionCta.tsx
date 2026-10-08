"use client";

import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { Icon } from "./Icon";
import { PriceWatchButton } from "./PriceWatchButton";

// The card page's next step after the price table (RiftCompare's
// CardConversionCta): watch this price, and, for anyone without a plan, a
// pointer to Deal Finder. MTG Compare's watchlist lives in the browser and
// sends no email yet, so the copy promises only what it does: the card joins
// the watchlist page and Best Basket. Hidden for Plus/Premium members
// (who have the tools already, and the heart beside the title); a returning
// member's mc_adfree hint hides it at first paint (data-ad-placement).
export function CardConversionCta({ cardId, slug, name }: { cardId: number; slug: string; name: string }) {
  const { me } = useMe();
  if (me.tier) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4" data-card-cta data-ad-placement="card-cta">
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="flex items-center gap-1.5 text-sm font-bold text-white">
          <Icon name="heart" className="h-4 w-4 text-brand-400" />
          Watch this price
        </p>
        <p className="mt-0.5 text-xs text-slate-400">Keep it on your watchlist to check its price in every store at a glance, free and with no account.</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PriceWatchButton cardId={cardId} slug={slug} name={name} variant="full" />
        <Link href="/tools/deal-finder" className="btn-ghost text-sm">
          See every card below TCGplayer market →
        </Link>
      </div>
    </div>
  );
}
