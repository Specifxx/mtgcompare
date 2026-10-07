import Link from "next/link";
import { Icon } from "./Icon";
import PlanButton from "./PlanButton";

// What a visitor without the plan sees in place of a paid tool's rows
// (RiftCompare's LockedPreview and MorePremium). The plan button opens the
// Plus/Premium dialog in place (PlanButton), attributed to `surface`; `tier`
// is the lowest tier that unlocks the wall.
export function LockedPreview({
  title,
  children,
  next,
  surface = "gate:deal-finder",
  tier = "plus",
}: {
  title: string;
  children: React.ReactNode;
  next: string;
  surface?: string;
  tier?: "plus" | "premium";
}) {
  return (
    <div className="relative mt-6 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
      <div className="grid grid-cols-2 gap-3 p-4 opacity-40 blur-[2px] sm:grid-cols-4 lg:grid-cols-6" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[5/7] rounded-lg bg-ink-800" />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink-950/60 p-6 text-center">
        <Icon name="lock" className="h-6 w-6 text-gold" />
        <p className="mt-2 text-xl font-bold text-white">{title}</p>
        <p className="mt-1 max-w-md text-sm text-slate-300">{children}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href={`/login?next=${encodeURIComponent(next)}`} rel="nofollow" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            Create a free account
          </Link>
          <PlanButton surface={surface} tier={tier} className="rounded-lg border border-ink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800">
            See {tier === "plus" ? "Plus" : "Premium"}
          </PlanButton>
        </div>
      </div>
    </div>
  );
}

/**
 * The line under a capped list. `more` (optional) is how many rows the plan
 * would add, said as "N more cards on this list"; it must be a real count from
 * the same query that capped the list, never an estimate.
 */
export function MoreWithPlan({
  children,
  cta = "See Plus",
  more,
  surface = "gate:deal-finder",
  tier = "plus",
}: {
  children: React.ReactNode;
  cta?: string;
  more?: number;
  surface?: string;
  tier?: "plus" | "premium";
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.05] p-5 text-center sm:flex-row sm:text-left">
      <Icon name="crown" className="h-6 w-6 shrink-0 text-gold" />
      <div className="flex-1">
        {more != null && more > 0 ? (
          <p className="text-sm font-bold text-white">
            {more.toLocaleString("en-US")} more {more === 1 ? "card" : "cards"} on this list
          </p>
        ) : null}
        <p className="text-sm text-slate-200">{children}</p>
      </div>
      <PlanButton surface={surface} tier={tier} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
        {cta}
      </PlanButton>
    </div>
  );
}
