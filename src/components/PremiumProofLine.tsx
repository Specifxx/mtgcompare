"use client";

import { useEffect, useState } from "react";
import { useCountry } from "./CountryProvider";

// A REAL count, never a made-up urgency line (RiftCompare's PremiumProofLine):
// how many cards are on Deal Finder's board in the visitor's market right now,
// from /api/premium/proof (owned by the Deal Finder work). Renders nothing
// while it loads, if the route is missing (404) or fails, or if the count is
// too small to make a case (< 5). A count, never a summed dollar "saving".
export function usePlanProof(enabled = true): number | null {
  const { country } = useCountry();
  const [deals, setDeals] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/premium/proof?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        const o = d && typeof d === "object" ? (d as { deals?: unknown; dealCount?: unknown }) : null;
        const n = o ? (o.deals ?? o.dealCount) : null;
        if (!cancelled) setDeals(typeof n === "number" && Number.isFinite(n) ? n : null);
      })
      .catch(() => {
        /* best-effort: no proof line is a fine fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [country, enabled]);
  return deals;
}

export function PremiumProofLine({ className = "mt-4 text-center text-sm text-slate-400" }: { className?: string }) {
  const deals = usePlanProof();
  if (deals == null || deals < 5) return null;
  return (
    <p className={className}>
      <span className="font-bold text-white">{deals.toLocaleString("en-US")} cards below TCGplayer market</span> on Deal Finder right now.
    </p>
  );
}
