"use client";

import { useEffect } from "react";
import { THEME_KEY, themeFrom, type Theme } from "@/lib/theme";

// Light/dark switch. The server draws both icons; CSS shows the one for the theme <html> already carries (globals.css
// .theme-icon-*), so the button is right from first paint with nothing read on the server and no hydration mismatch.
export function ThemeToggle({ className = "" }: { className?: string }) {
  // A page React draws whole in the browser (a 404 under a region, the error page) never runs the boot script in <head>, so <html>
  // carries no theme and a visitor who chose light got the dark default there. Stamp their saved choice once, only when it is missing.
  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute("data-theme")) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      // Storage blocked: the default stands.
    }
    root.setAttribute("data-theme", themeFrom(saved));
  }, []);
  function toggle() {
    const root = document.documentElement;
    const next: Theme = themeFrom(root.getAttribute("data-theme")) === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the switch still holds for this page.
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Light or dark theme"
      className={`chip min-h-10 shrink-0 cursor-pointer px-2.5 lg:min-h-9 ${className}`}
    >
      {/* Moon: shown in light mode (switch to dark). */}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="theme-icon-dark">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      {/* Sun: shown in dark mode (switch to light). */}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="theme-icon-light">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
