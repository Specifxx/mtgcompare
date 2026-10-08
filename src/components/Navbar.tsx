import Link from "next/link";
import { Suspense } from "react";
import { NavbarShell } from "./NavbarShell";
import { CardSearch } from "./CardSearch";
import { HeaderSearchSlot } from "./HeaderSearchSlot";
import { CountrySwitcher } from "./CountrySwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { NavUser } from "./NavUser";
import { HeaderPricingLink } from "./HeaderPricingLink";
import { DISCORD_URL } from "@/lib/site";
import { BrandLogo } from "./BrandLogo";
import { HeaderMenuButton } from "./HeaderMenuButton";
import { HeaderWatchButton } from "./HeaderWatchButton";

// The top bar — RiftCompare's Navbar, a SERVER component with client islands.
// NavbarShell owns the scroll state; everything in here renders once.
//
// Left: the logo (below lg, where the rail is hidden), "Database", Pricing
// (400px up to lg) and, from xl, the card search inline. Right: Sealed and Blog
// (lg), Tools (xl), Pricing (lg), Discord (lg, only when DISCORD_URL is set),
// the theme (lg), the market (360px up), the account corner, the watchlist (sm
// up) and the menu button (below lg). Below xl the search takes a second row.
export function Navbar() {
  return (
    <NavbarShell>
      <div className="mx-auto w-full px-2 sm:px-6">
       <div className="flex h-16 w-full items-center justify-between gap-1 sm:gap-4">
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-3">
          <Link href="/" className="tap-link min-w-11 shrink-0 gap-2 lg:hidden" aria-label="MTG Compare home">
            <BrandLogo />
            <span className="hidden text-lg font-extrabold tracking-tight text-white lg:block">
              MTG<span className="text-brand-400">Compare</span>
            </span>
          </Link>
          <Link
            href="/browse"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-1 text-xs font-semibold text-slate-100 hover:bg-ink-800 hover:text-white sm:px-2.5 sm:text-sm"
          >
            Database
          </Link>
          <HeaderPricingLink
            surface="nav:navbar"
            className="hidden min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold text-slate-100 hover:bg-ink-800 hover:text-white min-[400px]:inline-flex sm:min-w-0 sm:px-2.5 sm:text-sm lg:hidden"
          >
            Pricing
          </HeaderPricingLink>
          <div className="hidden min-w-0 flex-1 xl:block xl:w-[36rem]">
            <HeaderSearchSlot>
              <Suspense fallback={<div className="input w-full max-w-xl" />}>
                <CardSearch />
              </Suspense>
            </HeaderSearchSlot>
          </div>
        </div>
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Link href="/sealed" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5">
            Sealed
          </Link>
          <Link href="/blog" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5">
            Blog
          </Link>
          <Link href="/tools" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white xl:block xl:px-2.5 [@media(pointer:coarse)]:py-3.5">
            Tools
          </Link>
          <HeaderPricingLink className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5" surface="nav:navbar">
            Pricing
          </HeaderPricingLink>
          {DISCORD_URL ? (
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Discord"
              title="Join our Discord"
              className="tap-icon hidden rounded-lg text-slate-300 transition-colors hover:bg-ink-800 hover:text-[#5865F2] lg:grid"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          ) : null}
          <ThemeToggle className="hidden lg:grid" />
          <CountrySwitcher className="hidden min-[360px]:block sm:ml-1" />
          <NavUser />
          <HeaderWatchButton className="hidden sm:inline-flex" />
          <HeaderMenuButton className="lg:hidden" />
        </nav>
       </div>
        <div className="pb-3 xl:hidden">
          <HeaderSearchSlot mobile>
            <Suspense fallback={<div className="input" />}>
              <CardSearch />
            </Suspense>
          </HeaderSearchSlot>
        </div>
      </div>
    </NavbarShell>
  );
}
