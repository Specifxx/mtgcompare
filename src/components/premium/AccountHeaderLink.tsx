"use client";

import { usePremium } from "./usePremium";

// The header's account entry (2026-11-18; owner 2026-11-19: "the login/signup button should be visible for all sites", phones too):
// "Sign in" with its words from 400px wide (the person icon alone on the narrowest phones, so search keeps its room) while this browser has no account token; once signed in, the person icon (with "Account"
// from xl), and a gold dot for a Premium member. It opens /account, the account hub. Browser-only: the server HTML is the same for
// everyone (the CDN keeps one copy of every page), so it starts as "Sign in".
export function AccountHeaderLink({ className = "" }: { className?: string }) {
  const v = usePremium();
  const signedIn = v.status === "member" || v.status === "free";
  return (
    <a
      href="/account"
      aria-label={signedIn ? (v.status === "member" ? "My account (Premium)" : "My account") : "Sign in or create a free account"}
      data-account-link
      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30 sm:px-3.5 ${className}`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7"><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.8-3.1 3.2-4.8 6.2-4.8s5.4 1.7 6.2 4.8" strokeLinecap="round" /></svg>
      {signedIn ? <span className="hidden xl:inline">Account</span> : <span className="hidden whitespace-nowrap min-[400px]:inline">Sign in</span>}
      {v.status === "member" && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-bg" />}
    </a>
  );
}

/** "Premium" in the header for everyone who is not a member yet (owner, 2026-11-19: "premium should also be visible"). From md up; phones
 * get it at the top of the menu and on /account. Plain link, no pop-up. */
export function PremiumHeaderLink({ className = "" }: { className?: string }) {
  const v = usePremium();
  if (v.status === "member") return null;
  return (
    <a
      href="/premium"
      className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3.5 text-sm font-bold text-[#3b2400] shadow-sm transition-opacity hover:opacity-90 ${className}`}
    >
      <span aria-hidden>★</span> Premium
    </a>
  );
}
