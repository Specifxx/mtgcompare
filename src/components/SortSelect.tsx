"use client";

import { useRouter, useSearchParams } from "next/navigation";

// RiftCompare's SortSelect: writes ?sort= (dropping it for the default, and
// resetting ?page=) and navigates; every other param in the URL is kept.
export function SortSelect({
  basePath = "/browse",
  defaultSort,
  options,
  label = "Sort listings",
}: {
  basePath?: string;
  defaultSort: string;
  options: readonly { value: string; label: string }[];
  label?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? defaultSort;
  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        if (e.target.value === defaultSort) next.delete("sort");
        else next.set("sort", e.target.value);
        next.delete("page");
        const qs = next.toString();
        router.push(qs ? `${basePath}?${qs}` : basePath);
      }}
      className="input w-auto cursor-pointer"
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
