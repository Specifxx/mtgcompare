"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

// RiftCompare's Pagination: a one-page window around the current page plus the
// first and last ("1 … 4 5 6 … 20"), "‹ Prev" / "Next ›", and an optimistic
// current page — the clicked number fills at once and the list dims to 60%
// while the next page loads in a transition. Real <a href>s throughout, so a
// crawler or a modifier click gets a plain link.
//
// Differences from RiftCompare's: the active page is white on the brand fill, page 1
// carries no ?page=1 (its canonical URL), multi-valued params (browse's set
// and color filters) are kept, and the click event goes to GA only.
function windowed(page: number, total: number): (number | "…")[] {
  const pages = new Set<number>([1, total]);
  for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

const cell =
  "grid h-11 min-w-[2.75rem] place-items-center rounded-lg px-2.5 text-sm font-medium transition-colors select-none sm:h-9 sm:min-w-[2.25rem]";

export type PageParams = Record<string, string | string[] | undefined>;

/** The URL of page `p`: every param but `page` kept, `page` only from 2 up. */
export function pageHref(basePath: string, params: PageParams, p: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page") continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) sp.append(k, String(x));
  }
  if (p > 1) sp.set("page", String(p));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  page,
  totalPages,
  params,
  basePath = "/browse",
}: {
  page: number;
  totalPages: number;
  params: PageParams;
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<number | null>(null);
  useEffect(() => setOptimistic(null), [page]);

  if (totalPages <= 1) return null;
  const current = optimistic ?? page;
  const href = (p: number) => pageHref(basePath, params, p);

  function go(p: number, e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (p === current) return;
    trackEvent("pagination_click", { basePath, page: p });
    setOptimistic(p); // instant visual feedback
    if (typeof window !== "undefined") window.scrollTo(0, 0); // jump to the top of the results
    startTransition(() => router.push(href(p), { scroll: false })); // data loads in the background
  }

  const items = windowed(current, totalPages);
  const PrevNext = (label: string, target: number, enabled: boolean, rel: "prev" | "next") =>
    enabled ? (
      <a href={href(target)} rel={rel} onClick={(e) => go(target, e)} className={`${cell} border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white`}>{label}</a>
    ) : (
      <span className={`${cell} border border-ink-800 text-slate-600`}>{label}</span>
    );

  return (
    <nav
      className={`mt-8 flex flex-wrap items-center justify-center gap-1.5 transition-opacity ${isPending ? "opacity-60" : ""}`}
      aria-label="Pagination"
      aria-busy={isPending}
    >
      {PrevNext("‹ Prev", current - 1, current > 1, "prev")}
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-600">…</span>
        ) : (
          <a
            key={it}
            href={href(it)}
            onClick={(e) => go(it, e)}
            aria-current={it === current ? "page" : undefined}
            className={`${cell} ${
              it === current
                ? "bg-brand-500 text-white shadow-glow"
                : "border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white"
            }`}
          >
            {it}
          </a>
        )
      )}
      {PrevNext("Next ›", current + 1, current < totalPages, "next")}
    </nav>
  );
}
