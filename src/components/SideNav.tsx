"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { NAV_GROUPS } from "./nav-groups";
import { searchNav } from "./nav-search";
import { BrandLogo } from "./BrandLogo";
import { useCountry } from "./CountryProvider";
import { useMe } from "@/lib/use-me";
import { COUNTRIES } from "@/lib/country";
import { PremiumNavLink } from "./PremiumNavLink";
import { TierBadge } from "./TierBadge";

// The persistent desktop navigation rail: the full left edge of the page from
// `lg` up, carrying the brand, one search affordance, every link in
// NAV_GROUPS, and a pinned Premium/account block at the foot.
//
// IT IS A NAVIGATION SYSTEM AND NOTHING ELSE. An earlier revision opened with
// a flat list of eight "primary destinations" (Home, Cards, Prices, …) above
// the grouped index, mirroring the reference design this layout came from.
// That was wrong for this site and was removed the same day it shipped:
// "when I click prices, it should just expand to all of the different
// features — I'm not going to a single page when I click prices." Every one
// of those eight was also a link INSIDE a group below it, so the rail showed
// the same destination twice and made a section header look like a page. A
// group header is a disclosure now, never a link; the leaves are the links.
//
// ALWAYS EXPANDED. The two-mode rail (a 4rem icon strip with hover flyouts,
// toggled by a chevron and remembered in a cookie) is gone: "the collapsible
// option is actually, there's no point — have the default as uncollapsed."
// Removing it rather than re-defaulting it took a whole mechanism with it —
// the cookie, the pre-paint boot script that stamped `data-sidenav`, the
// `[` keybinding, the flyout positioning and the CSS that switched between
// the two — which is why the rail is now a plain list with no mode to keep
// the server and the client agreeing about.
//
// `position: fixed`, not a flex/grid layout participant — a fixed-width rail
// slotted INTO the page's box model would shift `<main>`'s horizontal centre
// off the true viewport, which CinematicHero's full-bleed hero background
// depends on. Everything that needs to make room for it (main, the footer ad
// zone, the footer, the header, CinematicHero's breakout maths) reads the
// same `--sidenav-w` custom property from globals.css instead of duplicating
// a hardcoded width.

// Only the DEVIATIONS from "every group open" are remembered — so a group
// added to NAV_GROUPS tomorrow starts open for everyone, exactly as it would
// if this component had no memory at all.
const STORAGE_KEY = "mc:sidenav:collapsed-groups";

// WHICH GROUP IS OPEN ON A FIRST VISIT (2026-09-21, owner: "lets have the
// default on the left prices is expanded whilst everything else is rolled
// up"). Every group used to start open, which made the rail ~60 links long
// and mostly a scrollbar — you scrolled past Games and Guides to reach Your
// Collection on every page.
//
// Matched by TITLE against NAV_GROUPS, and deliberately not by index: a group
// added or reordered tomorrow must not silently become "the open one".
//
// GUIDES & NEWS OPENS TOO (2026-09-28, owner: "we need the blog and guides to
// be prominent so that we get approved for adsense with their lazy
// crawlers"). A collapsed group renders no links at all (`{open && …}` below),
// so with Prices alone open no page's HTML carried a rail link to /guides or
// /blog — a crawler reading the rail saw a heading and nothing under it. It is
// also the second group now (nav-groups.ts). A returning visitor's own
// collapsed set still wins once it loads.
const DEFAULT_OPEN_GROUPS: readonly string[] = ["Prices", "Guides & News"];

// The default collapsed set, derived rather than written out, so it cannot
// drift from NAV_GROUPS. Computed once at module load — it is a pure function
// of a static array, and it must be IDENTICAL on the server and on the
// client's first render or React reports a hydration mismatch.
const DEFAULT_COLLAPSED: string[] = NAV_GROUPS.map((g) => g.title).filter((t) => !DEFAULT_OPEN_GROUPS.includes(t));

function matchesLink(pathname: string | null, link: { href: string; external?: boolean }): boolean {
  // The current route IS this link, or is nested under it (e.g. /card/abc
  // under /browse) — but never "/" itself, which would otherwise match every
  // route via startsWith("/").
  return (
    link.href !== "/" &&
    !link.external &&
    (pathname === link.href || !!pathname?.startsWith(`${link.href}/`))
  );
}

// MTG Compare: only the MOST SPECIFIC match is active. /cards/all, /market/records,
// /portfolio/sets and /stores/suggest each sit under another rail link, and
// RiftCompare's plain prefix test lit both up at once.
const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);
export function isActiveLink(pathname: string | null, link: { href: string; external?: boolean }): boolean {
  if (!matchesLink(pathname, link)) return false;
  return !ALL_LINKS.some((o) => o.href.length > link.href.length && matchesLink(pathname, o));
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const { country } = useCountry();
  const { me } = useMe();
  const premium = !!me.tier;

  // The one group (if any) containing the current page — used both to mark its
  // link active and to keep that group visible regardless of what the visitor
  // collapsed on an earlier visit.
  const activeGroupTitle = useMemo(
    () => NAV_GROUPS.find((g) => g.links.some((l) => isActiveLink(pathname, l)))?.title ?? null,
    [pathname],
  );

  // Starts at the default above — the same value on the server and on the
  // client's first render (localStorage isn't readable server-side, so
  // starting from stored state here would guarantee a hydration mismatch).
  // A returning visitor's own choices load in the effect below.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED));

  // What the visitor typed into the feature search above. Empty = show the
  // normal grouped tree; anything else = show flat, ranked matches instead.
  const [featureQuery, setFeatureQuery] = useState("");
  const featureResults = useMemo(
    () => (featureQuery.trim() ? searchNav(featureQuery).slice(0, 24) : null),
    [featureQuery],
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const titles = raw ? JSON.parse(raw) : null;
      if (Array.isArray(titles)) setCollapsed(new Set(titles));
    } catch {
      /* corrupt/unavailable storage — every group stays open, the same default
         a first-time visitor gets */
    }
    setHydrated(true);
  }, []);

  // Force the active group open on every navigation, even one the visitor
  // collapsed in a previous session: landing on a page inside a section you
  // can't currently see reads as broken, not tidy.
  useEffect(() => {
    if (!hydrated || !activeGroupTitle || !collapsed.has(activeGroupTitle)) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(activeGroupTitle);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* quota/private mode — the in-memory state still updates for this visit */
      }
      return next;
    });
    // Only re-run when the active group changes, not on every `collapsed`
    // update (toggleGroup persists its own changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupTitle, hydrated]);

  // Keep the current page's link inside the rail's own viewport (2026-09-23).
  // The 48px touch rows made the tree ~1.5x taller, so on a touch tablet the
  // active link (e.g. Deck Builder at y=708 in a scroller ending at 697) landed
  // below the fold of the rail with nothing to reveal it. scrollTop on the
  // rail's scroller, not scrollIntoView, which can also scroll the document.
  // Keyed on the active group's OPEN state rather than all of `collapsed`, so
  // collapsing some other group never yanks the rail back.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeOpen = activeGroupTitle ? !collapsed.has(activeGroupTitle) : false;
  useEffect(() => {
    if (!hydrated) return;
    const s = scrollerRef.current;
    const a = s?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!s || !a) return;
    const top = a.offsetTop;
    const bottom = top + a.offsetHeight;
    if (top < s.scrollTop || bottom > s.scrollTop + s.clientHeight) s.scrollTop = Math.max(0, top - s.clientHeight / 3);
  }, [pathname, hydrated, activeOpen]);

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* quota/private mode — collapsing still works for this visit */
      }
      return next;
    });
  }

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-0 z-rail hidden h-screen w-[var(--sidenav-w)] flex-col border-r border-ink-800 bg-ink-900 lg:flex"
    >
      {/* ── Brand ─────────────────────────────────────────────────────────
          The rail owns the brand from lg up, because it runs the full page
          height and reaches the top-left corner the header's own mark used to
          occupy. Navbar.tsx hides its copy at exactly this breakpoint rather
          than drawing a second one beside it.
          h-[calc(4rem+1px)], not h-16 (2026-09-23): the header is 65px (its
          h-16 row plus a 1px border-b outside it) while this block is
          border-box, so at h-16 the rail's divider sat at y=63 against the
          header rule at y=64 — a visible 1px step at x=272 once scrolled. The
          header is taller from 1024 to 1279 (its search row is underneath
          there), so the alignment matters from 1280; below that it's harmless. */}
      <Link
        href="/"
        aria-label="MTG Compare home"
        className="flex h-[calc(4rem+1px)] shrink-0 items-center gap-2.5 border-b border-ink-800 px-3 transition-colors hover:bg-ink-800/60"
      >
        <BrandLogo />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight text-white">
            MTG<span className="text-brand-400">Compare</span>
          </span>
          {/* The visitor's own market — the context every price on the site is
              quoted in, and the single piece of state worth showing permanently. */}
          <span className="block truncate text-[11px] text-slate-500">{COUNTRIES[country].label}</span>
        </span>
      </Link>

      {/* ── Search the FEATURES ────────────────────────────────────────
          Not card search (2026-09-21, owner: "lets make the search bar on the
          left a search for features"). Card search is the header's job and
          says so in its own placeholder; this one answers "where is the thing
          that does X" over the same NAV_GROUPS index the ⌘K launcher and the
          phone overlay search, via the shared `searchNav()` — so a word that
          finds a page in one of them finds it in all three.

          It filters the list BELOW it in place rather than opening a panel:
          the rail is a navigation tree, and narrowing the tree you are
          already looking at is both simpler and less to explain than a
          dropdown over the top of it. */}
      {/* TOUCH TARGETS (2026-09-23). Measured on a 1024x768 touch tablet, 28 of
          the rail's 29 targets were under 44px (links 32, group toggles 29,
          this input 38, Get Premium 38): globals.css's coarse 48px floor does
          not reach these classes. Every `[@media(pointer:coarse)]:py-*` below
          is touch-only, so the desktop density is unchanged. py-3.5, not py-3,
          on the input and Get Premium: py-3 measures only 46 there (20 line +
          24 padding + 2 border).
          `[&::-webkit-search-cancel-button]:appearance-none` on THIS input
          only: it is type="search", so WebKit and Chromium drew their native ×
          beside the Clear button below. The site's other type=search inputs
          rely on the native one and keep it.
          HEIGHT BELOW xl (2026-09-23): from 1024 to 1279 the header keeps its
          card search on a second row (121px with a mouse, 125px on touch), so
          this block is sized to end exactly on the header's bottom rule — 56px
          and 60px below the 65px brand block — instead of leaving a 7-15px step
          in the divider once the page scrolls. From xl the header is 65px again
          and the block is back to its natural py-3. */}
      <div className="flex h-14 shrink-0 flex-col justify-center border-b border-ink-800 px-3 [@media(pointer:coarse)]:h-[3.75rem] xl:block xl:h-auto xl:py-3">
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-2.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={featureQuery}
            onChange={(e) => setFeatureQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFeatureQuery("");
            }}
            placeholder="Search features"
            aria-label="Search features"
            autoComplete="off"
            className="w-full rounded-lg border border-ink-700 bg-ink-950/60 py-2 pl-9 pr-8 text-sm text-slate-200 placeholder:text-slate-500 transition-colors hover:border-ink-600 focus:border-brand-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 [&::-webkit-search-cancel-button]:appearance-none [@media(pointer:coarse)]:py-3.5"
          />
          {featureQuery && (
            <button
              type="button"
              onClick={() => setFeatureQuery("")}
              aria-label="Clear"
              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-500 transition-colors hover:bg-ink-800 hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── The index ─────────────────────────────────────────────────────
          Every NAV_GROUPS link, each group a disclosure. This is the whole
          navigation system: the same index the ⌘K launcher searches, the
          footer site-map renders and /llms.txt publishes, so a link added in
          one place appears in all four. */}
      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {featureResults ? (
          // SEARCHING: a flat, ranked list, each row naming the group it came
          // from — that context is the difference between "Movers" meaning
          // anything and meaning "the one in Prices". No disclosures here:
          // when you have typed a query, hiding matches behind a collapsed
          // section is the opposite of what you asked for.
          featureResults.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">
              No features match “{featureQuery.trim()}”.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {featureResults.map((link) => {
                const active = isActiveLink(pathname, link);
                const className = `block rounded-md border-l-2 py-1.5 pl-3 pr-2 transition-colors ${
                  active
                    ? "border-brand-400 bg-brand-500/10 text-brand-300"
                    : "border-transparent text-slate-300 hover:border-ink-700 hover:bg-ink-800 hover:text-white"
                }`;
                const body = (
                  <>
                    <span className="block truncate text-sm font-semibold">{link.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{link.group}</span>
                  </>
                );
                return (
                  <li key={`${link.group}-${link.href}`}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                        {body}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className={className}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setFeatureQuery("")}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : (
        NAV_GROUPS.map((group) => {
          const open = !collapsed.has(group.title);
          const panelId = `sidenav-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
          const groupActive = group.title === activeGroupTitle;
          return (
            <div key={group.title} className="py-0.5">
              {/* A DISCLOSURE, never a link — see this file's header. The
                  group's own icon is tinted when the current page is inside
                  it, so the section you're in is findable at a glance even
                  when its links are scrolled out of view. */}
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                aria-controls={panelId}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-ink-800/60 [@media(pointer:coarse)]:py-4 ${
                  groupActive ? "text-brand-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {group.icon ? <NavIcon name={group.icon} className="h-4 w-4 shrink-0" /> : null}
                <span className="flex-1 truncate text-left">{group.title}</span>
                <Chevron open={open} />
              </button>
              {open && (
                <ul id={panelId} className="space-y-0.5 pb-1.5">
                  {group.links.map((link) => {
                    const active = isActiveLink(pathname, link);
                    const className = `block truncate rounded-md border-l-2 py-1.5 [@media(pointer:coarse)]:py-3.5 pl-3 pr-2 text-sm transition-colors ${
                      active
                        ? "border-brand-400 bg-brand-500/10 font-semibold text-brand-300"
                        : "border-transparent text-slate-300 hover:border-ink-700 hover:bg-ink-800 hover:text-white"
                    }`;
                    return (
                      <li key={link.href}>
                        {link.external ? (
                          <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
                            {link.label}
                          </a>
                        ) : (
                          <Link href={link.href} className={className} aria-current={active ? "page" : undefined}>
                            {link.label}
                            {link.plan ? <TierBadge tier={link.plan} className="ml-1.5 align-middle" /> : null}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
        )}
      </div>

      {/* ── Pinned Premium ───────────────────────────────────────────────
          Outside the scroller, so it stays reachable without scrolling past
          the ~60-link index above it. Gold is this site's Premium identity
          colour and is used for nothing else in the rail.
          
          PREMIUM ONLY — no session row. An earlier revision had "Sign in"
          here too, which duplicated the header's own account control: the
          owner's split is explicit ("I still want ... the accounts" in the
          header; "have premium on the sidebar as well ... at the bottom"),
          and a second sign-in link is exactly the double-up this pass was
          asked to remove elsewhere in the rail.

          The WHOLE block is conditional, not just the link (2026-09-23): the
          bordered, padded wrapper used to render unconditionally, so Premium
          members got an empty 21px strip at the rail's foot. */}
      {!premium && (
        <div className="shrink-0 border-t border-ink-800 px-3 py-2.5">
          {/* Plain since 2026-09-28 (was a gold, bordered "Get Premium"): the
              rail links to the plans; the upgrade is offered where a free
              account hits a limit (lib/free-limits.ts). */}
          <PremiumNavLink
            href="/premium"
            surface="nav:sidebar"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-ink-800 hover:text-white [@media(pointer:coarse)]:py-3.5"
          >
            <NavIcon name="trophy" className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">Pricing</span>
          </PremiumNavLink>
        </div>
      )}
    </nav>
  );
}
