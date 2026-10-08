"use client";

import Link from "next/link";
import { PremiumNavLink } from "./PremiumNavLink";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { invalidateMe, useMe, type Me } from "@/lib/use-me";
import { invalidateWatchlist } from "@/lib/use-watchlist";
import { useDismiss } from "@/lib/use-dismiss";
import { trackEvent } from "@/lib/analytics";

// Auth routes we never want to "return to" after sign-in (would loop).
const AUTH_PATHS = ["/login"];

// RiftCompare's UserMenu: "Log in" + a btn-primary "Sign up free" when signed
// out; an avatar with a w-60 menu when signed in. MTG Compare signs in with
// Google or Discord only, so there is no unverified-email dot or "Resend" row.
// The Admin row (admins only) lives here and nowhere else in the public UI
// (CLAUDE.md, "Admin access").
export function UserMenu({ user }: { user: Me["user"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { me } = useMe();
  const premium = !!me.tier;
  const tier = me.tier;
  const pathname = usePathname();
  // Carry the current page as ?next= so signing in returns the user here.
  // Skip auth pages to avoid a redirect loop.
  const loginHref =
    pathname && pathname !== "/" && !AUTH_PATHS.some((p) => pathname.startsWith(p))
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  useDismiss(ref, open, () => setOpen(false));

  if (!user) {
    return (
      <>
        <Link
          href={loginHref}
          rel="nofollow"
          className="tap-link whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold text-slate-200 hover:bg-ink-800 hover:text-white sm:px-2"
        >
          Log in
        </Link>
        <Link
          href={loginHref}
          rel="nofollow"
          onClick={() => trackEvent("signup_cta_click", { placement: "header" })}
          className="btn-primary whitespace-nowrap px-2.5 py-1.5 text-xs"
        >
          <span>
            Sign up<span className="hidden min-[420px]:inline">&nbsp;free</span>
          </span>
        </Link>
      </>
    );
  }

  const initials = user.name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "U";

  async function signOut() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    invalidateMe();
    invalidateWatchlist();
    window.location.assign("/");
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="tap-icon relative">
        <span className="relative grid h-8 w-8 place-items-center sm:h-9 sm:w-9">
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-xs font-bold text-white hover:border-brand-500">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" aria-hidden="true" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              initials
            )}
          </span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="border-b border-ink-700 px-4 py-3">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
          <div className="py-1">
            <MenuLink href="/dashboard" onClick={() => setOpen(false)}>
              ◆ {premium ? (tier === "plus" ? "Plus" : "Premium") : "Your"} dashboard
            </MenuLink>
            {!premium && (
              <PremiumNavLink
                surface="nav:menu"
                onClick={() => setOpen(false)}
                className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-ink-800 hover:text-white"
              >
                Pricing
              </PremiumNavLink>
            )}
            <MenuLink href="/profile" onClick={() => setOpen(false)}>Profile</MenuLink>
            <MenuLink href="/portfolio" onClick={() => setOpen(false)}>My binder</MenuLink>
            <MenuLink href="/watching" onClick={() => setOpen(false)}>My watchlist</MenuLink>
            <MenuLink href="/feedback" onClick={() => setOpen(false)}>
              Feedback
            </MenuLink>
            {me.admin ? (
              <MenuLink href="/admin" onClick={() => setOpen(false)}>
                Admin
              </MenuLink>
            ) : null}
          </div>
          <div className="border-t border-ink-700 py-1">
            <button onClick={signOut} className="block w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-ink-800 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
      {children}
    </Link>
  );
}
