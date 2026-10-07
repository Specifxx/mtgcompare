"use client";

import { useEffect, useState } from "react";
import { LOCAL_WATCHLIST_EVENT, LOCAL_WATCHLIST_KEY, LOCAL_WATCHLIST_MAX } from "@/lib/use-watchlist";

// The heart that saves into THIS BROWSER (localStorage `op:watchlist`), no
// account needed. Since wave 2 (2026-10-03) cards use PriceWatchButton (the
// account watchlist when signed in, this same list when signed out); this
// component remains for SEALED products on a free or signed-out visit —
// sealed watches are Plus (SealedWatchButton), and a free visitor's sealed
// hearts are never dropped. Signing in merges the CARD items into the account
// (lib/use-watchlist.ts); sealed items stay here.
export const WATCH_KEY = LOCAL_WATCHLIST_KEY;
export interface WatchItem {
  slug: string;
  kind: "card" | "sealed";
  name: string;
  added: string;
  id?: number;
}

export function readWatchlist(): WatchItem[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]");
    return Array.isArray(v) ? (v as WatchItem[]) : [];
  } catch {
    return [];
  }
}

function writeWatchlist(items: WatchItem[]) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(items.slice(0, LOCAL_WATCHLIST_MAX)));
    window.dispatchEvent(new Event(LOCAL_WATCHLIST_EVENT));
  } catch {
    /* private mode */
  }
}

const Heart = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M12 20.5 4.2 12.9a4.8 4.8 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.8 4.8 0 0 1 0 6.8Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function WatchButton({ slug, kind, name, variant = "icon" }: { slug: string; kind: "card" | "sealed"; name: string; variant?: "icon" | "button" }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readWatchlist().some((w) => w.slug === slug && w.kind === kind));
    sync();
    window.addEventListener(LOCAL_WATCHLIST_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOCAL_WATCHLIST_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [slug, kind]);
  const flip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const list = readWatchlist();
    writeWatchlist(on ? list.filter((w) => !(w.slug === slug && w.kind === kind)) : [{ slug, kind, name, added: new Date().toISOString() }, ...list]);
  };
  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={flip}
        aria-pressed={on}
        className={`${on ? "btn border border-gold/50 bg-gold/15 text-gold hover:bg-gold/25" : "btn-ghost"} whitespace-nowrap`}
      >
        <Heart on={on} />
        {on ? "Watching" : "Watch price"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      title={on ? "Saved in this browser — click to stop" : "Save to your watchlist (in this browser)"}
      className={`tap-icon rounded-full border transition-colors ${
        on ? "border-gold/60 bg-ink-950/80 text-gold" : "border-ink-600 bg-ink-950/80 text-slate-300 hover:border-gold/50 hover:text-gold"
      }`}
    >
      <Heart on={on} />
    </button>
  );
}
