"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SEALED_SORTS } from "@/lib/sealed-query";

// The /sealed sort select on the `sort` values.
export function SealedSort() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "featured";
  return (
    <select
      value={current in SEALED_SORTS ? current : "featured"}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        next.delete("page");
        if (e.target.value !== "featured") next.set("sort", e.target.value);
        else next.delete("sort");
        const qs = next.toString();
        router.push(qs ? `/sealed?${qs}` : "/sealed", { scroll: false });
      }}
      className="h-11 cursor-pointer rounded-md border border-ink-700 bg-ink-900 px-3 text-sm font-medium text-slate-100 outline-none focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-500/50"
      aria-label="Sort sealed products"
    >
      {(Object.entries(SEALED_SORTS) as [string, string][]).map(([v, l]) => (
        <option key={v} value={v}>
          Sort: {l}
        </option>
      ))}
    </select>
  );
}
