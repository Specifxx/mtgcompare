"use client";

import Link from "next/link";
import { Dialog } from "./ui/Dialog";
import { NavIcon } from "./NavIcon";
import { Watchlist } from "./Watchlist";
import { useMe } from "@/lib/use-me";
import { useWatchlistDrawer } from "./WatchlistDrawerProvider";

// The drawer body (the owner's "sliders") — RiftCompare's WatchlistDrawer,
// ported in wave 2 (2026-10-03): a right-hand slide-over with one wide row per
// card and the "Notify me at $__" field under each.
//
// MTG Compare differences:
//   • Signed out, RiftCompare shows only a sign-in prompt (its signed-out heart
//     collects an email instead). MTG Compare keeps no-account hearts, so the
//     drawer shows the list saved in this browser, under a "Sign in to sync
//     and get alerts" bar.
//   • The signed-in line promises an email only once a mailer is configured
//     (me.emailOn, the site-wide getEmailStatus flag). Until then alerts are
//     flagged on the watchlist and the dashboard.
export function WatchlistDrawer() {
  const { open, setOpen } = useWatchlistDrawer();
  const { me, loaded } = useMe();
  const user = me.user;
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onClose={close} placement="right" size="md" z="sheet" labelledBy="watchlist-drawer-title">
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-4 sm:px-5">
        <h2 id="watchlist-drawer-title" className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
          <NavIcon name="heart" className="h-5 w-5 shrink-0 text-brand-400" />
          My watchlist
        </h2>
        <button
          onClick={close}
          aria-label="Close watchlist"
          className="tap-icon rounded-lg text-lg text-slate-400 transition hover:bg-ink-800 hover:text-white"
          data-autofocus
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {!loaded ? null : !user ? (
          <>
            <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-2 p-3">
              <p className="text-xs leading-relaxed text-slate-400">
                Saved in this browser. <strong className="text-slate-200">Sign in to sync and get alerts</strong> — your hearts come with you.
              </p>
              <Link href="/login?next=/watching&src=watchlist_drawer" onClick={close} className="btn-primary min-h-11">
                Sign in
              </Link>
            </div>
            <Watchlist layout="list" onNavigate={close} />
          </>
        ) : (
          <>
            {me.emailOn ? (
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                We email <strong className="text-slate-300">{user.email}</strong> when one of these hits a new low, naming the cheapest store — at most
                one email a week. Tap the heart on any card to stop watching it.
              </p>
            ) : (
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Your watchlist, on every device. Set a target price (Plus) and we&apos;ll flag it here when a store reaches it. Tap the heart on any card
                to stop watching it.
              </p>
            )}
            {/* `list`, not the page's grid: this panel is 448px wide. Following
                a row closes the drawer, so the card page is not opened under it. */}
            <Watchlist layout="list" onNavigate={close} />
          </>
        )}
      </div>
    </Dialog>
  );
}
