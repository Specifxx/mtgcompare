"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/use-me";
import PlanButton from "./PlanButton";

// One dismissible, in-flow line on a page where a paid feature lives
// (RiftCompare's DiscoveryTip): signed-in non-members only, never a popup or an
// overlay. The button opens the Plan dialog on the lowest tier that has the
// feature; the line hides for members at or above that tier. A dismissal is
// remembered in this browser (localStorage "mc_tip:<id>").
export function DiscoveryTip({
  id,
  surface,
  tier = "plus",
  children,
  cta = "See what it adds",
  className = "",
}: {
  id: string;
  /** A `tip:*` surface (lib/nudge-surface.ts). */
  surface: string;
  tier?: "plus" | "premium";
  children: React.ReactNode;
  cta?: string;
  className?: string;
}) {
  const { me, loaded } = useMe();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read: no flash
  const key = `mc_tip:${id}`;
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);
  if (!loaded || !me.user || dismissed) return null;
  const has = tier === "plus" ? me.tier != null : me.tier === "premium";
  if (has) return null;
  return (
    <p data-discovery-tip={surface} role="note" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs leading-relaxed text-slate-300 ${className}`}>
      <span className="min-w-0 flex-1">{children}</span>
      <PlanButton surface={surface} tier={tier} className="text-xs font-semibold text-brand-400 hover:underline">
        {cta}
      </PlanButton>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* not remembered: harmless */
          }
          setDismissed(true);
        }}
        className="text-[11px] text-slate-500 hover:text-slate-300"
        aria-label="Dismiss this tip"
      >
        Dismiss
      </button>
    </p>
  );
}
