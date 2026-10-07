"use client";

import { useEffect } from "react";
import CardQuickLink from "./CardQuickLink";
import { pushRecentCard, useRecentCards, type RecentCard } from "@/lib/recently-viewed";

// "Recently viewed" (RiftCompare's RecentlyViewedRail + the recording half of
// its CardViewBeacon), from this browser's localStorage only. Renders nothing
// on the server and nothing on a first visit, so it never shifts the page for
// a visitor without history.
//
// On the card page it is ONE element: <RecentlyViewed record={…} /> records the
// card being viewed and shows the others. Elsewhere (search dropdown, the
// watchlist) it only shows.
export function RecentlyViewed({
  record,
  exclude,
  className,
  title = "Recently viewed",
  max = 8,
  onNavigate,
}: {
  record?: RecentCard;
  exclude?: string;
  className?: string;
  title?: string;
  max?: number;
  onNavigate?: () => void;
}) {
  const recordKey = record ? JSON.stringify(record) : null;
  useEffect(() => {
    if (recordKey) pushRecentCard(JSON.parse(recordKey) as RecentCard);
  }, [recordKey]);
  const skip = exclude ?? record?.slug;
  const recent = useRecentCards().filter((c) => c.slug !== skip);
  if (!recent.length) return null;
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {recent.slice(0, max).map((c) => (
          <li key={c.slug} className="min-w-0 max-w-full" onClick={onNavigate}>
            <CardQuickLink
              slug={c.slug}
              title={`${c.name}${c.variant ? ` (${c.variant})` : ""} · ${c.setCode}${c.number ? ` · ${c.number}` : ""}`}
              className="flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 py-1 pl-1 pr-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-brand-500/60 hover:text-white"
            >
              {c.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.img} alt="" width={18} height={25} loading="lazy" decoding="async" className="h-[25px] w-[18px] shrink-0 rounded-sm bg-ink-800 object-cover" />
              ) : (
                <span className="h-[25px] w-[18px] shrink-0 rounded-sm bg-ink-800" />
              )}
              <span data-card-name className="truncate">
                {c.name}
                {c.variant ? <span className="text-slate-500"> · {c.variant.split(" · ")[0]}</span> : null}
              </span>
            </CardQuickLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
