"use client";

import Link from "@/components/Link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CART_OPEN_EVENT, cartCount, onCartChange, readCart } from "@/lib/cart-list";
import { BOTTOM_NAV, type BottomNavMode } from "@/lib/site";
import { isRegion, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { CartIcon } from "./cart/CartIcon";
import { Icon } from "./Icon";
import { isActivePath } from "./NavLink";

// The phone bottom nav (owner, 2026-11-18, after Catchback's; ported from TCG Prices, tcgcompare). READ DECISIONS.md "The mobile bottom tab bar is deleted" (Rift, 2026-09-18)
// FIRST: an earlier bar rode up the screen because it tried to compute where the browser's address bar was (calc(100lvh - 100dvh), then a
// visualViewport "lift"), and floated when the visitor pinch-zoomed. THIS bar does no position arithmetic at all:
//
//   • `fixed inset-x-0 bottom-0`, the same placement the phone dock (AdDock.tsx) has run in production since 2026-11-06, with
//     `env(safe-area-inset-bottom)` padding. It moves on `transform` only (CLS 0), never `bottom`, never a measured number.
//   • Browser only (nothing in the server HTML: SEO and the first paint are untouched) and phones only (below 768px).
//   • OFF unless the visitor opts in with `?bn=1` (kept in localStorage; `?bn=0` clears it) or the site's mode is "on". The owner tries
//     it on his own phone first (DECISIONS.md, 2026-11-18). `SITE.bottomNav` is the rollback: "off" ignores everything, including ?bn=1.
//   • Hides on scroll down, shows on scroll up and at the top; hides while pinch-zoomed (the layout/visual viewport split that floated
//     the old bar), while a text field has focus (the keyboard), while any dialog, the menu or the cart drawer is open, and on a page
//     with the phone buy bar, and whenever an Add to cart button is in the strip it would cover (so it never sits on one).
//   • It and the ad dock alternate: the dock shows on scroll down (the nav is away), the nav on scroll up (the dock yields to
//     `html[data-bottomnav]`). A phone screen still holds one bar at a time. It sits OUTSIDE the quick view (mounted in the root layout,
//     hidden while the quick view's aria-modal dialog is open), so the quick-view A/B test sees it the same in every arm.

export type { BottomNavMode };

export interface BottomNavState {
  narrow: boolean;
  scrollY: number;
  /** The scroll direction as last settled: "up", "down", or "" before the visitor has moved. */
  dir: "up" | "down" | "";
  zoomed: boolean;
  typing: boolean;
  modal: boolean;
  buybar: boolean;
  /** An Add to cart button is inside the strip the bar would cover. */
  covers: boolean;
  enabled: boolean;
}

/** The scroll distance below which the bar always shows (the top of a page). */
export const NAV_TOP = 80;
/** The least a scroll must move, in px, to flip the direction (finger jitter and iOS rubber-banding never flip it). Down is slower to
 *  decide than up: showing the bar on the first real upward flick is what makes it feel immediate. */
export const NAV_DELTA = 10;
export const NAV_DELTA_UP = 4;
/** The bar's height above the safe area. */
export const NAV_H = 56;
const OPT_KEY = "bn";

/** Whether the bar shows. Pure, for the tests. */
export function bottomNavShows(s: BottomNavState): boolean {
  if (!s.enabled || !s.narrow || s.zoomed || s.typing || s.modal || s.buybar || s.covers) return false;
  if (s.scrollY < NAV_TOP) return true;
  return s.dir === "up";
}

/** The next scroll direction given the last settled one, where the scroll was, and where it is now. Pure, for the tests. */
export function nextDir(dir: "up" | "down" | "", anchor: number, y: number): { dir: "up" | "down" | ""; anchor: number } {
  // The anchor is the scroll position the direction was last decided at: it follows the page while the direction holds and stays
  // put until the page has moved NAV_DELTA the other way.
  if (y > anchor + NAV_DELTA) return { dir: "down", anchor: y };
  if (y < anchor - NAV_DELTA_UP) return { dir: "up", anchor: y };
  if (dir === "down" && y > anchor) return { dir, anchor: y };
  if (dir === "up" && y < anchor) return { dir, anchor: y };
  return { dir, anchor };
}

/** Whether the visitor has the bar: the site's mode, then `?bn=` (1 keeps it, 0 clears it), then what they kept. */
export function bottomNavEnabled(mode: BottomNavMode, search: string, stored: string | null): { enabled: boolean; store: "1" | "0" | null } {
  if (mode === "off") return { enabled: false, store: null };
  const q = new URLSearchParams(search).get("bn");
  if (q === "1") return { enabled: true, store: "1" };
  if (q === "0") return { enabled: false, store: "0" };
  if (mode === "on") return { enabled: stored !== "0", store: null };
  return { enabled: stored === "1", store: null };
}

interface Tab {
  key: string;
  label: string;
  href?: string;
  also?: string[];
  icon: ReactNode;
}

const SVG = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// MTG Compare's tabs (owner, 2026-11-18: "better nav bar options"). Search is NOT a tab here: the sticky header keeps the search box on
// every phone screen, so a Search tab would only repeat it. Sets takes its place (the most used way in after Deals). Every path is
// under the visitor's region: the page's own, else the one they picked (RegionSuggest.tsx keeps it in "mtg-region"), else the US.
// A function, so no JSX runs when the module loads (the tests import this file before React exists globally).
export const tabs = (region: Region, regionPage: boolean): Tab[] => [
  { key: "home", label: "Home", href: regionPage ? `/${region}` : "/", icon: <svg {...SVG}><path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5" /></svg> },
  { key: "deals", label: "Deals", href: `/${region}/deals`, also: ["black-friday", "cyber-monday", "price-moves", "back-in-stock", "this-week"].map((p) => `/${region}/${p}`), icon: <Icon name="tag" size={22} /> },
  { key: "sets", label: "Sets", href: `/${region}/sets`, also: [`/${region}/releases`, `/${region}/preorders`], icon: <svg {...SVG}><path d="m12 3 9 4.5-9 4.5-9-4.5z" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></svg> },
  { key: "cart", label: "Shortlist", icon: <CartIcon size={22} /> },
  // My collection (owner, 2026-11-19: "replace the menu with My Collection"). The header keeps its menu button on phones.
  { key: "collection", label: "Collection", href: "/collection", icon: <svg {...SVG}><rect x="7" y="3" width="13" height="17" rx="2" /><path d="M4 7v12a2 2 0 0 0 2 2h10" /></svg> },
];

/** The region the tabs link into: the page's own (its first path segment), else the visitor's pick, else the default. */
export function navRegion(pathname: string, picked: string | null): { region: Region; regionPage: boolean } {
  const seg = pathname.split("/")[1] ?? "";
  if (isRegion(seg)) return { region: seg, regionPage: true };
  return { region: isRegion(picked) ? picked : X_DEFAULT_REGION, regionPage: false };
}

function narrowNow(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

export function BottomNav({ mode = BOTTOM_NAV }: { mode?: BottomNavMode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // The opt-in, read once in the browser (never in the server HTML).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(OPT_KEY);
    } catch {
      /* storage blocked: the query alone decides, for this page */
    }
    const r = bottomNavEnabled(mode, location.search, stored);
    if (r.store !== null) {
      try {
        localStorage.setItem(OPT_KEY, r.store);
      } catch {
        /* nothing to keep it in */
      }
    }
    setEnabled(r.enabled);
    try {
      setPicked(localStorage.getItem("mtg-region"));
    } catch {
      /* no pick: the default region */
    }
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => setCount(cartCount(readCart()));
    sync();
    return onCartChange(sync);
  }, [enabled]);

  // The controller. SMOOTHNESS (owner, 2026-11-18: "a bit of lag"): the scroll path reads scrollY and nothing else (no layout reads, no
  // React state, no re-render): the show/hide is two attribute writes, and CSS moves the bar on `transform` alone. Everything that
  // needs the DOM (an open dialog, a cart button in the bar's strip) is cached and refreshed by observers, never in the scroll handler.
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current as (HTMLElement & { inert?: boolean }) | null;
    if (!el) return;
    const root = document.documentElement;
    const stripPx = NAV_H + 12;
    let dir: "up" | "down" | "" = "";
    let anchor = window.scrollY;
    let typing = false;
    let modal = false;
    let buybar = false;
    let covers = 0;
    let last: boolean | null = null;

    const apply = (show: boolean) => {
      if (show === last) return;
      last = show;
      el.dataset.bottomnavBar = show ? "shown" : "hidden";
      el.inert = !show;
      if (show) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
      root.toggleAttribute("data-bottomnav", show);
      root.style.scrollPaddingBottom = show ? `calc(${NAV_H}px + var(--bn-gap, env(safe-area-inset-bottom)) + 8px)` : "";
    };
    const decide = () => {
      const y = Math.max(0, window.scrollY); // iOS rubber-banding reports negative values past the top
      const n = nextDir(dir, anchor, y);
      dir = n.dir;
      anchor = n.anchor;
      const vv = window.visualViewport;
      apply(
        bottomNavShows({
          enabled: true,
          narrow: narrowNow(),
          scrollY: y,
          dir,
          // Pinch-zoomed: the visual viewport is smaller than the layout one and a fixed bar is drawn at the zoomed scale.
          zoomed: !!vv && vv.scale > 1.02,
          typing,
          modal,
          buybar,
          covers: covers > 0,
        }),
      );
    };

    // Cached facts, refreshed when the DOM changes (not per scroll frame).
    const refresh = () => {
      modal =
        // The cart drawer is always in the DOM, aria-modal but inert and aria-hidden while closed: only an open one counts.
        [...document.querySelectorAll("dialog[open], [aria-modal='true']")].some((d) => !d.closest("[inert], [aria-hidden='true']")) ||
        document.body.style.overflow === "hidden" ||
        root.style.overflow === "hidden" ||
        root.matches(".capacitor-native");
      // MTG's product page always holds the buy bar's element; only a SHOWN one takes the foot of the screen.
      buybar = !!document.querySelector("[data-buybar='shown']");
      decide();
    };

    // An Add to cart button inside the strip along the foot of the screen: the bar stays away. An IntersectionObserver reports it
    // (no layout reads in the scroll path); its root is the viewport shrunk from the top to just that strip.
    let io: IntersectionObserver | null = null;
    const inStrip = new Set<Element>();
    const watch = () => {
      io?.disconnect();
      inStrip.clear();
      covers = 0;
      if (typeof IntersectionObserver === "undefined") return;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) (e.isIntersecting ? inStrip.add(e.target) : inStrip.delete(e.target));
          covers = inStrip.size;
          decide();
        },
        { rootMargin: `-${Math.max(0, window.innerHeight - stripPx)}px 0px 0px 0px` },
      );
      document.querySelectorAll(".ce-cart-add, .ce-cart-inline").forEach((b) => io!.observe(b));
    };

    let frame = 0;
    const later = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), refresh(), watch()));
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      typing = !!t?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']");
      decide();
    };
    const onBlur = () => {
      typing = false;
      decide();
    };
    const onResize = () => {
      watch();
      decide();
    };

    el.dataset.bottomnavBar = "hidden";
    refresh();
    watch();
    window.addEventListener("scroll", decide, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", decide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    // Its own attribute writes (inert, aria-hidden) are not news.
    const mo = new MutationObserver((recs) => {
      if (recs.some((r) => !el.contains(r.target))) later();
    });
    // Two targets (observe() on the same node twice REPLACES its options): the page for what opens and closes, the body for its overflow.
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "aria-hidden", "inert", "data-buybar"] });
    mo.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", decide);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", decide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      mo.disconnect();
      io?.disconnect();
      root.removeAttribute("data-bottomnav");
      root.style.scrollPaddingBottom = "";
    };
  }, [enabled, pathname]);

  // Room under the footer (set once: below the fold, so no layout shift).
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.setAttribute("data-bottomnav-on", "");
    document.body.style.paddingBottom = `calc(${NAV_H}px + var(--bn-gap, env(safe-area-inset-bottom)) + 8px)`;
    return () => {
      root.removeAttribute("data-bottomnav-on");
      document.body.style.paddingBottom = "";
    };
  }, [enabled]);

  if (!enabled) return null;

  const nr = navRegion(pathname, picked);
  const click = (key: string) => {
    if (key === "cart") window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT));
    if (key === "menu") document.querySelector<HTMLButtonElement>("button[aria-controls='site-menu']")?.click();
  };

  return (
    <nav ref={ref} aria-label="Quick links" data-bottomnav-bar="hidden" aria-hidden="true" className="bn md:hidden">
      <ul className="bn-row">
        {tabs(nr.region, nr.regionPage).map((t) => {
          // Home is current only on the home page itself (its href, /<region>, prefixes every page of the region).
          const active = !t.href ? false : t.key === "home" ? (pathname.replace(/\/+$/, "") || "/") === t.href : isActivePath(pathname, t.href, t.also);
          return (
            <li key={t.key} className="bn-cell">
              {t.href ? (
                <Link
                  href={t.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  data-bn={t.key}
                  className="bn-tab"
                  // The target starts loading on touch-down, a head start on the tap itself (one page, only when it is touched).
                  onPointerDown={() => router.prefetch(t.href!)}
                >
                  <span className="bn-ico">{t.icon}</span>
                  <span className="bn-label">{t.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  data-bn={t.key}
                  aria-haspopup="dialog"
                  aria-label={t.key === "cart" && count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : t.label}
                  onClick={() => click(t.key)}
                  className="bn-tab"
                >
                  <span className="bn-ico">
                    {t.icon}
                    {t.key === "cart" && count > 0 && (
                      <span aria-hidden="true" className="bn-badge">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                  <span className="bn-label">{t.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
