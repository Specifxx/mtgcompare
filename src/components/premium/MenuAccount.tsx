"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { usePremium } from "./usePremium";

// The top of the phone menu (owner, 2026-11-19: sign-in and Premium visible on every site): the account (Sign in, or Account), Premium
// with its trial for anyone who is not a member, and the theme switch (the header gives its place to Sign in on phones).
export function MenuAccount({ onNavigate }: { onNavigate: () => void }) {
  const v = usePremium();
  const signedIn = v.status === "member" || v.status === "free";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line py-3">
      <a href="/account" onClick={onNavigate} className="btn-ghost min-h-11">
        {signedIn ? "My account" : "Sign in / Sign up"}
      </a>
      {v.status !== "member" ? (
        <a href="/premium" onClick={onNavigate} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-4 text-sm font-bold text-[#3b2400]">
          <span aria-hidden>★</span> Premium · 14 days free
        </a>
      ) : (
        <a href="/collection" onClick={onNavigate} className="btn-ghost min-h-11">
          My collection
        </a>
      )}
      <ThemeToggle className="ml-auto" />
    </div>
  );
}
