"use client";

import Link from "@/components/Link";
import { REGION_LIST, type Region } from "@/lib/regions";
import { gaEvent } from "@/lib/gtag";
import { Flag } from "./Flag";
import { pickRegion, useSoftRegion } from "./RegionSuggest";

// The hero's region row (owner, 2026-11-02: "the region switcher must be more prevalent … on the main home page hero … and have
// the flags as well"): every region as a flag chip, the header's RegionSwitcher in plain sight. On a region home (`region` set)
// each chip is a plain link to that region's home (every region has one, so they are followed). On the landing page (no region)
// a click picks the region in place, as the header's soft switcher does (RegionSuggest.tsx pickRegion); without script the links
// still go to each region's home. Flag and code (seven full names wrap even on a
// wide screen); the name is the chip's title.
export function RegionChips({ region = null, className = "" }: { region?: Region | null; className?: string }) {
  const soft = useSoftRegion();
  const current = region ?? soft;
  return (
    <nav aria-label="Choose your region" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm font-semibold text-muted">Prices for</span>
      {REGION_LIST.map((r) => {
        const on = r.region === current;
        return (
          <Link
            key={r.region}
            href={`/${r.region}`}
            prefetch={false}
            aria-current={on ? "true" : undefined}
            title={`${r.name} · ${r.currency}`}
            onClick={(e) => {
              if (!on) gaEvent("region_select", { region: r.region, from: current, placement: region ? "hero" : "hero-soft" });
              if (!region && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) {
                e.preventDefault();
                pickRegion(r.region);
              }
            }}
            className={`chip min-h-11 ${on ? "border-brand bg-brand-soft font-semibold text-brand-strong" : ""}`}
          >
            <Flag code={r.short} />
            {r.short}
            <span className="sr-only"> {r.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
