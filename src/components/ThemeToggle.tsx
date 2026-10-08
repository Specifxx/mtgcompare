"use client";

import { useCallback, useEffect, useState } from "react";
import {
  THEME_COLOR,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  readThemeCookie,
  resolveThemeMode,
  type ThemeMode,
} from "@/lib/theme-shared";

// The light/dark switch. Two renderings of one control: `icon` is the sun/moon
// button in the header (sm and up — the phone header has no room for another
// 44px target), `row` is the labelled full-width button in the phone menu.
// Both read and write the same <html data-theme> attribute and `theme` cookie,
// and stay in sync through one window event, so flipping either updates the
// other instantly.
//
// State starts as "dark" (the server-rendered default) and re-syncs from the DOM on mount rather than reading
// the cookie during render: the server renders no cookie, and a first client
// render that disagreed with the server's would be a hydration mismatch. The
// attribute itself is stamped before paint by THEME_BOOT_SCRIPT (layout.tsx),
// so the page is never the wrong colour — only this button's icon is one
// effect-tick behind, which no one can see.

const EVENT = "mc:theme";

function readTheme(): ThemeMode {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  // Browser chrome (address bar on phones) follows the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[mode]);
}

export function ThemeToggle({ variant = "icon", className = "" }: { variant?: "icon" | "row"; className?: string }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    // The cookie is the source of truth. applyTheme runs UNCONDITIONALLY, not only
    // when attribute and cookie disagree: the boot script stamps data-theme but
    // never touches <meta name="theme-color">, so a visitor who chose the non-default
    // theme kept the default browser chrome. Idempotent (a setAttribute plus a meta write).
    const next = resolveThemeMode(readThemeCookie(document.cookie));
    applyTheme(next);
    setMode(next);
    const onChange = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener(EVENT, onChange);
    // Next 14 removes and re-inserts <meta name="theme-color"> (the layout's static,
    // viewport.themeColor (the default theme's)) on every client navigation, so a one-off write is
    // undone by the first link click (measured 2026-09-23: /sets → /sets/origins
    // put it back to #0c0b14). Re-stamp it whenever <head> changes.
    // childList only, so our own setAttribute cannot re-trigger the observer.
    const syncMeta = () => {
      const want = THEME_COLOR[readTheme()];
      const m = document.querySelector('meta[name="theme-color"]');
      if (m && m.getAttribute("content") !== want) m.setAttribute("content", want);
    };
    const mo = new MutationObserver(syncMeta);
    mo.observe(document.head, { childList: true, subtree: true });
    return () => {
      window.removeEventListener(EVENT, onChange);
      mo.disconnect();
    };
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeMode = readTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: next }));
  }, []);

  const label = mode === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const icon =
    mode === "dark" ? (
      // Sun — offered while dark.
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ) : (
      // Moon — offered while light.
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    );

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-ink-800 hover:text-white ${className}`}
      >
        {icon}
        <span className="flex-1 text-left">Theme</span>
        <span className="text-xs font-medium text-slate-500">{mode === "dark" ? "Dark" : "Light"} · tap to switch</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`tap-icon rounded-lg text-slate-300 transition-colors hover:bg-ink-800 hover:text-white ${className}`}
    >
      {icon}
    </button>
  );
}
