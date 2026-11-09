"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Hover intent: open after a short dwell (a cursor crossing the row opens nothing), close after a grace period (a diagonal
 *  move from the label into the panel does not lose it). */
const OPEN_MS = 90;
const CLOSE_MS = 200;
const OPEN_EVENT = "navmenu:open";

/**
 * One header dropdown (the mega menu): the label `link` (a real page, so a click still goes there), a chevron button that
 * toggles the panel, and the panel itself. The panel is ALWAYS in the server's HTML as plain <a> links (crawlable); closed it is
 * only `invisible`, so it is out of the tab order and the accessibility tree until it opens.
 *
 * - Mouse: opens on hover with intent (OPEN_MS) and closes CLOSE_MS after the pointer leaves; the chevron toggles it.
 * - Touch and click: the chevron toggles; a tap outside closes it; the label still navigates.
 * - Keyboard: focus into the item opens it (Tab on into the links), ArrowDown/ArrowUp move through the links, Home/End jump,
 *   Escape closes and returns focus to the label; focus leaving the item closes it.
 * - Opening one closes the others; a navigation closes it.
 *
 * One file shared by the Dex / MTG engine family (DexCompare, MTG, Gundam, Wargame, YGO, Bandai); keep them identical.
 */
export function NavMenu({ label, link, children, align = "left", xl = false }: { label: string; link: ReactNode; children: ReactNode; align?: "left" | "right"; xl?: boolean }) {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressed = useRef(false); // after Escape: focus staying inside must not reopen it
  const pathname = usePathname();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(() => {
    setOpen(true);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
  }, [id]);
  const later = (to: boolean, ms: number) => {
    clear();
    timer.current = setTimeout(() => (to ? show() : setOpen(false)), ms);
  };

  // A navigation, another menu opening, a press outside: close.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const other = (e: Event) => {
      if ((e as CustomEvent).detail !== id) setOpen(false);
    };
    const outside = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, other);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener(OPEN_EVENT, other);
      document.removeEventListener("pointerdown", outside);
      clear();
    };
  }, [id]);

  const items = () => Array.from(root.current?.querySelectorAll<HTMLAnchorElement>(`[data-nav-panel] a[href]`) ?? []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inPanel = (e.target as HTMLElement).closest("[data-nav-panel]");
    if (e.key === "Escape" && open) {
      e.preventDefault();
      suppressed.current = true;
      setOpen(false);
      root.current?.querySelector<HTMLElement>("[data-nav-trigger]")?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      const list = items();
      if (!list.length) return;
      if (!inPanel && e.key !== "ArrowDown") return;
      e.preventDefault();
      suppressed.current = false;
      show();
      const at = list.indexOf(document.activeElement as HTMLAnchorElement);
      const next = !inPanel || e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      // The panel turns visible on the next paint; focus() on a still-hidden link does nothing.
      requestAnimationFrame(() => list[next]?.focus());
    }
  };

  return (
    <div
      ref={root}
      className={xl ? "hidden xl:block group relative" : "group relative"}
      data-open={open ? "true" : "false"}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") later(true, OPEN_MS);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") {
          suppressed.current = false;
          later(false, CLOSE_MS);
        }
      }}
      onFocus={(e) => {
        // The chevron button toggles on click; opening on its focus would make a first click close it again.
        if (!suppressed.current && !(e.target as HTMLElement).closest("[data-nav-trigger]")) show();
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) {
          suppressed.current = false;
          setOpen(false);
        }
      }}
      onKeyDown={onKeyDown}
    >
      {link}
      <button
        type="button"
        data-nav-trigger
        aria-label={`${label} menu`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          clear();
          suppressed.current = open;
          if (open) setOpen(false);
          else show();
        }}
        className="absolute right-1 top-1/2 flex h-6 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" className={`transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id={panelId}
        data-nav-panel
        className={`absolute top-full z-50 pt-2 transition duration-150 motion-reduce:transition-none ${align === "right" ? "right-0" : "left-0"} ${
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Class for a label link that carries a dropdown: room on the right for the chevron button. */
export const MENU_LINK_PAD = "pr-6";
