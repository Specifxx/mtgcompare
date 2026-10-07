"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

// RiftCompare's PageSizeSelect: "Show [48]". OP Compare's browse calls the
// param `per` (24 / 48 / 100, default 48), so the param, sizes and default are
// props here rather than RiftCompare's lib/cards constants.
export function PageSizeSelect({
  size,
  basePath = "/browse",
  sizes = [24, 48, 100],
  defaultSize = 48,
  param = "per",
}: {
  size: number;
  basePath?: string;
  sizes?: readonly number[];
  defaultSize?: number;
  param?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (Number(e.target.value) === defaultSize) next.delete(param);
    else next.set(param, e.target.value);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span className="hidden sm:inline">Show</span>
      <select value={size} onChange={onChange} className="input w-auto py-1.5" aria-label="Cards per page">
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
