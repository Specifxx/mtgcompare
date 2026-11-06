"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

// The phone dock (owner, 2026-11-06: "how can we have those [side rail ads] on mobile … in the best way that doesn't interrupt user
// experience"): the side rails' eBay and TCGplayer tiles, one of each, side by side in a slim bar along the foot of a screen too narrow
// for the rails. Chosen after a viewport simulation on a Galaxy Z Fold cover screen (~21:9), iPhone SE, iPhone 16 and 16 Pro Max
// against an in-flow strip and a corner chip (DECISIONS.md, 2026-11-06 "The phone dock"). It follows the phone buy bar's rules:
//
//   • Browser only and narrow screens only (below the rails' MIN_WIDTH). Nothing is in the server HTML, and nothing is asked for until
//     the visitor has scrolled a third of a screen (DockGate): a visit that reads only its first screen costs nothing and sees nothing.
//   • Never on the first screen: it shows only once the visitor has scrolled DOCK_ARM of a screen (not an interstitial, never over
//     the content a searcher lands on).
//   • Never beside another unit: it hides while any other ad unit (`yieldTo`, [data-ad] by default), the footer, the rating card ([data-rate-card]) or anything marked [data-dock-yield] is in
//     view or about to be (120 px), and never shows on a page with the buy bar (`buybar`, the product page) or while a dialog,
//     the menu or the keyboard is open. So a phone screen still holds at most one unit.
//   • Fixed, 64 px plus the safe area (6–10% of a phone screen; Better Ads' "large sticky ad" line is 30%), sliding on transform only:
//     nothing on the page moves (CLS 0). While it shows the page's scroll-padding-bottom is its height, so nothing focused is under it.
//   • Each half swipes through its rail's tiles (up to ten, the next one peeking at the edge); each time the dock comes back it shows
//     the next pair, so a long page shows several products without anything animating on its own.
//   • ✕ hides it for the rest of the visit (sessionStorage). Labelled "Ad" on every tile, links rel sponsored under their own placements.

export interface DockSide {
  key: string;
  items: ReactNode[];
}

/** The share of a screen the visitor must scroll before the dock may show (never on the first screen). */
export const DOCK_ARM = 0.6;
/** Its height above the safe area: the phone buy bar's. */
export const DOCK_H = 64;
const DISMISS_KEY = "ad-dock-off";

export interface DockState {
  narrow: boolean;
  scrolled: number;
  screen: number;
  blockers: number;
  buybar: boolean;
  modal: boolean;
  typing: boolean;
  dismissed: boolean;
}

/** Whether the dock shows. Pure, for the tests. */
export function dockShows(s: DockState): boolean {
  return s.narrow && s.scrolled >= s.screen * DOCK_ARM && s.blockers === 0 && !s.buybar && !s.modal && !s.typing && !s.dismissed;
}

function dismissedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Renders its children (the dock and the data hooks that feed it) only on a screen narrower than `minWidth`, once the visitor has
 * scrolled a third of a screen and has not hidden the dock this visit. Before that: nothing, and no request.
 */
export function DockGate({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (dismissedThisVisit()) return;
    const wide = window.matchMedia(`(min-width: ${minWidth}px)`);
    const check = () => {
      if (!wide.matches && window.scrollY >= window.innerHeight * (DOCK_ARM / 2)) {
        setArmed(true);
        window.removeEventListener("scroll", check);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [minWidth]);
  return armed ? <>{children}</> : null;
}

/** A tile's link class (the site wraps DockTile in its own OutboundLink with it). */
export const DOCK_LINK = "flex h-12 min-w-0 items-center gap-2 rounded-lg pr-1 outline-offset-2";

/** One tile: the picture, the brand with its "Ad" pill, one line of title and the price. */
export function DockTile({ img, alt, brand, title, price, cta, plate = false }: { img: string; alt: string; brand: ReactNode; title: string; price: string; cta: string; plate?: boolean }) {
  return (
    <>
      <span className={`relative block h-11 w-11 shrink-0 overflow-hidden rounded-md ${plate ? "plate" : "bg-raised"}`}>
        <img src={img} alt={alt} width={44} height={44} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full object-contain ${plate ? "p-0.5 mix-blend-multiply" : ""}`} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex h-3.5 items-center gap-1 text-[10px] font-semibold leading-none text-muted">
          {brand}
          <span className="rounded bg-raised px-1 py-px text-[9px] uppercase tracking-wide">Ad</span>
        </span>
        <span className="mt-0.5 truncate text-xs font-semibold leading-4">{title}</span>
        <span className="tabular truncate text-sm font-bold leading-4">{price}</span>
      </span>
      <span className="dock-cta shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-bold">
        {cta} <span aria-hidden="true">↗</span>
      </span>
    </>
  );
}

/**
 * `yieldTo`: the site's ad units and anything else it must never share a screen with, beside the footer and [data-dock-yield];
 * `buybar`: the site's phone buy bar (a page that has one never shows the dock).
 */
export function AdDock({ label, sides, placement, minWidth, yieldTo = "[data-ad]", buybar = "[data-buybar]" }: { label: string; sides: DockSide[]; placement: string; minWidth: number; yieldTo?: string; buybar?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [turn, setTurn] = useState(0);
  const visible = shown && !dismissed;

  // When to show: scrolled past DOCK_ARM of a screen, and nothing that hides it is in (or 120 px from) view.
  useEffect(() => {
    const dock = ref.current;
    if (!dock || typeof IntersectionObserver === "undefined") return;
    const wide = window.matchMedia(`(min-width: ${minWidth}px)`);
    const blockers = new Set<Element>();
    let typing = false;
    const modal = () =>
      !!document.querySelector("dialog[open], [aria-modal='true']") || document.body.style.overflow === "hidden" || document.documentElement.style.overflow === "hidden";
    const update = () =>
      setShown(
        dockShows({
          narrow: !wide.matches,
          scrolled: window.scrollY,
          screen: window.innerHeight,
          blockers: blockers.size,
          buybar: !!document.querySelector(buybar),
          // An ad-free visitor (Plus/Premium where a site has them) and a native app with its own banner: never.
          modal: modal() || document.documentElement.matches("[data-adfree], .capacitor-native"),
          typing,
          dismissed: false,
        }),
      );

    const watched = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.isConnected) blockers.add(e.target);
          else blockers.delete(e.target);
        }
        update();
      },
      { rootMargin: "120px 0px 120px 0px" },
    );
    const scan = () => {
      const now = new Set<Element>([...document.querySelectorAll(`footer, [data-dock-yield], [data-rate-card], ${yieldTo}`)].filter((el) => !dock.contains(el)));
      for (const el of now) if (!watched.has(el)) (watched.add(el), io.observe(el));
      for (const el of [...watched]) {
        if (now.has(el)) continue;
        watched.delete(el);
        io.unobserve(el);
        blockers.delete(el);
      }
      update();
    };
    scan();
    let frame = 0;
    const later = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), scan()));
    };
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ad", "data-dock-yield", "data-buybar", "class", "open", "aria-modal", "style"] });
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      typing = !!t?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']");
      update();
    };
    const onBlur = () => {
      typing = false;
      update();
    };
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    wide.addEventListener?.("change", update);
    return () => {
      io.disconnect();
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      wide.removeEventListener?.("change", update);
    };
  }, [minWidth, yieldTo, buybar]);

  // Each time it comes back, the next pair.
  useEffect(() => {
    if (visible) setTurn((n) => n + 1);
  }, [visible]);

  // While shown, nothing focused scrolls under it; while hidden, it is out of the tab order.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !visible;
    // <html data-ad-dock> while it shows: a site lifts its corner buttons above it (as it does for the buy bar).
    root.toggleAttribute("data-ad-dock", visible);
    if (!visible || !el) return;
    root.style.scrollPaddingBottom = `${el.offsetHeight}px`;
    return () => {
      root.style.scrollPaddingBottom = "";
      root.removeAttribute("data-ad-dock");
    };
  }, [visible]);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked: hidden for this page only */
    }
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      aria-hidden={visible ? undefined : true}
      data-ad={visible ? placement : undefined}
      data-dock={visible ? "shown" : "hidden"}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-lift backdrop-blur ${
        visible ? "translate-y-0 transition-transform duration-200 ease-out motion-reduce:transition-none" : "invisible translate-y-full"
      }`}
    >
      <div className="mx-auto flex h-12 max-w-[640px] items-center gap-2">
        {/* A phone: one tile at a time, the sides taking turns (eBay, TCGplayer, eBay…), with its button. From 640px: both sides at once. */}
        <span className="contents sm:hidden">
          <DockHalf side={{ key: "all", items: interleave(sides) }} turn={turn} divider={false} />
        </span>
        <span className="hidden min-w-0 flex-1 items-center gap-2 sm:flex [&_.dock-cta]:hidden">
          {sides.map((s, n) => (
            <DockHalf key={s.key} side={s} turn={turn} divider={n > 0} />
          ))}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide these ads for this visit"
          className="-mr-2 inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

/** The sides' tiles taking turns: the first of each, then the second of each… Pure, for the tests. */
export function interleave<T>(sides: { items: T[] }[]): T[] {
  const out: T[] = [];
  const most = Math.max(0, ...sides.map((s) => s.items.length));
  for (let i = 0; i < most; i++) for (const s of sides) if (i < s.items.length) out.push(s.items[i]);
  return out;
}

function DockHalf({ side, turn, divider }: { side: DockSide; turn: number; divider: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  // Show the turn's tile (the first time: the first, popular first). Instant, never animated on its own.
  useEffect(() => {
    const ul = list.current;
    const first = ul?.firstElementChild as HTMLElement | null;
    if (!ul || !first || side.items.length === 0) return;
    const step = first.offsetWidth + 8;
    ul.scrollTo({ left: (Math.max(0, turn - 1) % side.items.length) * step, behavior: "instant" as ScrollBehavior });
  }, [turn, side.items.length]);
  return (
    <>
      {divider && <span aria-hidden="true" className="h-9 w-px shrink-0 bg-line" />}
      <ul
        ref={list}
        role="list"
        className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {side.items.map((item, i) => (
          <li key={i} className="w-[calc(100%-14px)] shrink-0 snap-start">
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
