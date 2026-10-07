"use client";

import PlanButton from "./PlanButton";
import { freeLimitHeadline } from "@/lib/free-limits";
import { TIER_NAMES, planPrice } from "@/lib/plans";

// THE PORTFOLIO'S UPGRADE PROMPT AT THE LIMIT — the collection-alerts track's
// stand-in for the member track's FreeLimitPanel (RiftCompare's), with the same
// copy and the same props for kind "portfolio". The integrator swaps every use
// for `<FreeLimitPanel kind="portfolio" … />` once both tracks are on main
// (wave2-plan, track 4 item 1). Rendered only as the answer to an add the free
// account could not make, right where it was tried — never on load.
export function PortfolioLimitNotice({
  // FreeLimitPanel's prop, accepted so a swap is a rename only; always "portfolio" here.
  kind: _kind = "portfolio",
  count,
  onClose,
  className = "",
  context,
}: {
  kind?: "portfolio";
  count: number;
  onClose?: () => void;
  className?: string;
  context?: "set";
}) {
  void _kind;
  const tier = TIER_NAMES.plus;
  const price = `${planPrice("plus", "month")}/mo`;
  const pitch =
    context === "set"
      ? `${tier} tracks unlimited cards, so a whole set fits — ${price}. Nobody loses cards they already have: everything already in your binder stays.`
      : `${tier} tracks unlimited cards in your portfolio — ${price}. Everything already in it stays and keeps its value.`;
  return (
    <div role="status" data-free-limit="portfolio" className={`rounded-xl border border-ink-600 bg-ink-900 p-3 text-left ${className}`}>
      <p className="text-sm font-semibold text-white">{freeLimitHeadline("portfolio", count)}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{pitch}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {/* FreeLimitPanel's surface is limit:portfolio, which the member track adds to
            lib/nudge-surface.ts; until then the beacon accepts this one. */}
        <PlanButton tier="plus" surface="nudge:portfolio-limit" />
        {onClose && (
          <button type="button" onClick={onClose} className="tap-link text-xs text-slate-400 hover:text-white">
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
