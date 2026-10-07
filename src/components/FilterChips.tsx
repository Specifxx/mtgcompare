"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { activeChips, canonical, clearFilters, removeChip } from "@/lib/filter-chips";

// The applied filters as removable chips above the results (RiftCompare's
// ActiveFilters, "Skinport-style"): what is filtered is obvious and each one
// is one tap to undo. Reads the URL, so it always agrees with the panel.
export function FilterChips({ basePath = "/browse", sets, symbol, adjective }: { basePath?: string; sets: Record<string, string>; symbol: string; adjective: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const chips = activeChips(params, { set: (s) => sets[s] ?? sets[s.toLowerCase()], symbol, adjective });
  if (!chips.length) return null;
  const go = (next: URLSearchParams) => {
    const qs = canonical(next).toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false }));
  };
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`} aria-label="Active filters">
      {chips.map((c) => (
        <button
          key={`${c.key}:${c.value}`}
          type="button"
          onClick={() => go(removeChip(new URLSearchParams(params.toString()), c))}
          aria-label={`Remove filter: ${c.label}`}
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 text-xs font-semibold text-brand-400 hover:bg-brand-500/20"
        >
          <span className="truncate">{c.label}</span>
          <span aria-hidden="true" className="text-brand-400/70">
            ✕
          </span>
        </button>
      ))}
      <button type="button" onClick={() => go(clearFilters(params))} className="min-h-8 px-1 text-xs font-medium text-slate-500 hover:text-white">
        Clear all
      </button>
    </div>
  );
}
