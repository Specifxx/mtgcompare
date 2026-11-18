"use client";

import { usePremium } from "./usePremium";

// The header's account entry (2026-11-18, accounts on MTG Compare): "Sign in" when this browser has no account token, "My watches" when it
// does. Browser-only: the server HTML is the same for everyone (the CDN keeps one copy of every page), so it starts as "Sign in".
export function AccountHeaderLink({ className = "" }: { className?: string }) {
  const v = usePremium();
  const signedIn = v.status === "member" || v.status === "free";
  return (
    <a
      href={signedIn ? "/watches" : "/account"}
      aria-label={signedIn ? "My watches" : "Sign in"}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30 sm:px-3.5 ${className}`}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7"><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.8-3.1 3.2-4.8 6.2-4.8s5.4 1.7 6.2 4.8" strokeLinecap="round" /></svg>
      <span className="hidden xl:inline">{signedIn ? "My watches" : "Sign in"}</span>
    </a>
  );
}
