"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { WatchlistDrawer } from "./WatchlistDrawer";

// Shared open/close state for the watchlist side drawer — RiftCompare's
// WatchlistDrawerProvider, ported in wave 2 (2026-10-03).
//
// WHY A DRAWER, NOT A ROUTE (RiftCompare, 2026-09-22, owner: "the watchlist
// button should open a side tab not go to a separate page"). A full navigation
// drops whatever the visitor was browsing (browse filters, a card page's
// scroll position); a drawer keeps the page underneath intact.
//
// /watching ITSELF STAYS as the deep-link target (bookmarks, the login
// redirect's `?next=/watching`). The drawer's <Watchlist> is the same
// component that page renders. Mounted once in the root layout; it reads no
// session server-side (who the visitor is comes from /api/me, client-side).
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function useWatchlistDrawer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWatchlistDrawer must be used within <WatchlistDrawerProvider>");
  return c;
}

/** The drawer's state, or null outside the provider (a control that can live without it). */
export function useWatchlistDrawerMaybe() {
  return useContext(Ctx);
}

export function WatchlistDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <WatchlistDrawer />
    </Ctx.Provider>
  );
}
