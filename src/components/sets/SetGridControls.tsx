"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { sortOptions } from "@/lib/browse";

// Sort and page size for a set's card grid, as URL state like the filters.
// `options` is the sort list (browse.ts sortOptions): "Best match" leads it,
// and is the default, when the grid is searched (the filter panel's `q`).
export function SetGridControls({ basePath, sort, per, options = sortOptions("") }: { basePath: string; sort: string; per: number; options?: readonly { value: string; label: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    next.delete("page");
    router.push(`${basePath}?${next.toString()}`, { scroll: false });
  };
  const field = "h-11 rounded-md border border-ink-700 bg-ink-900 px-3 text-sm font-medium text-slate-100 outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/50";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <span className="hidden sm:inline">Sort</span>
        <select aria-label="Sort cards" value={sort} onChange={(e) => push("sort", e.target.value)} className={field}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <span className="hidden sm:inline">Show</span>
        <select aria-label="Cards per page" value={per} onChange={(e) => push("per", e.target.value)} className={field}>
          {[24, 48, 100].map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
