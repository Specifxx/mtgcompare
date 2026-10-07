"use client";

import { NavIcon } from "./NavIcon";
import { useWatchlist } from "@/lib/use-watchlist";
import { useUnreadCount } from "@/lib/use-unread";
import { useWatchlistDrawer } from "./WatchlistDrawerProvider";

/**
 * The watchlist, as its own header control — RiftCompare's HeaderWatchButton,
 * ported in wave 2 (2026-10-03). The owner's "watch list bar".
 *
 * A BUTTON THAT OPENS A DRAWER, NOT A LINK TO /watching (RiftCompare,
 * 2026-09-22): a full navigation drops whatever the visitor was browsing.
 * /watching is still the deep-link target.
 *
 * THE COUNT IS THE POINT, not decoration: watched cards (signed in), or every
 * card and product saved in this browser (signed out). Same 9+ cap as
 * RiftCompare. A heart, filled when there is something in it — the same glyph
 * as every card's PriceWatchButton.
 *
 * THE DOT (an OP Compare divergence, flagged for the owner): RiftCompare's
 * alerts arrive by email, so its count is the only ambient signal. OP Compare
 * sends no email until a mailer is configured; its alerts are in-app
 * notifications (the /dashboard "Recent alerts" panel), so the heart carries
 * a small brand dot while any is unread. The count rides /api/me (no polling).
 */
export function HeaderWatchButton({ className = "" }: { className?: string }) {
  const { count } = useWatchlist();
  const unread = useUnreadCount();
  const { open, setOpen } = useWatchlistDrawer();

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={`${count > 0 ? `Watchlist, ${count} card${count === 1 ? "" : "s"}` : "Watchlist"}${unread > 0 ? `, ${unread} new alert${unread === 1 ? "" : "s"}` : ""}`}
      className={`tap-icon relative rounded-lg transition-colors hover:bg-ink-800 hover:text-white ${open ? "text-brand-400" : "text-slate-200"} ${className}`}
    >
      {/* Same path PriceWatchButton draws, via the shared icon. `fill`
          carries the "you have some" state exactly as it does there. */}
      <NavIcon name="heart" className="h-5 w-5" fill={count > 0 ? "currentColor" : "none"} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="num absolute right-0.5 top-0.5 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
      {unread > 0 && (
        <span aria-hidden="true" data-unread-dot className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-ink-950" />
      )}
    </button>
  );
}
