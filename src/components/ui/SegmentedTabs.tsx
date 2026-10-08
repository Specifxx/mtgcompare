"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedTab {
  key: string;
  label: string;
  /** Shown as a small count pill beside the label. Omit for no pill. */
  count?: number;
  content: ReactNode;
}

/**
 * The site's one tab implementation, lifted out of EbayTabs.tsx (the first
 * place the real WAI-ARIA tabs pattern was built — tablist/tab/tabpanel,
 * roving tabindex, Left/Right/Home/End) so PopularCardsCarousel's separate
 * `aria-pressed` button row can adopt it too. `aria-pressed` describes a
 * TOGGLE, not a tab set — screen readers got no sense of "3 tabs, showing 1
 * of 3", and arrow keys did nothing.
 *
 * Adds one thing EbayTabs didn't have: an animated pill that slides between
 * tabs on click/arrow-key instead of the active state just snapping.
 *
 * Works both controlled (pass `active` + `onActiveChange`, for a caller that
 * already keeps the current tab in its own state — PopularCardsCarousel) and
 * uncontrolled (omit both, for a caller that doesn't need to know — EbayTabs).
 */
export function SegmentedTabs({
  tabs,
  label,
  active: activeProp,
  onActiveChange,
  renderAllPanels = false,
  className,
}: {
  tabs: SegmentedTab[];
  /** Accessible name for the tablist, e.g. "eBay listings for Akali". */
  label: string;
  active?: string;
  onActiveChange?: (key: string) => void;
  /**
   * Keep every panel in the DOM (toggling `hidden`, not mounting only the
   * active one). PopularCardsCarousel needs this: its panels feed the page's
   * ItemList JSON-LD and must stay crawlable regardless of which tab is
   * visually active — the same reason its old always-rendered sections were
   * merged into tabs in the first place, not replaced by a single active one.
   */
  renderAllPanels?: boolean;
  className?: string;
}) {
  const baseId = useId();
  const [internalActive, setInternalActive] = useState(tabs[0]?.key ?? "");
  const active = activeProp ?? internalActive;
  const setActive = onActiveChange ?? setInternalActive;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === active));

  // Measure the active tab's own box relative to the tablist, so the pill can
  // sit exactly on it.
  //
  // BOTH AXES AND BOTH DIMENSIONS, which is the fix for a real phone bug
  // (2026-09-16). This tablist is `flex-wrap`, and at 393px the three-tab set
  // on the homepage wraps: "All-time" and "Biggest movers" on the first row,
  // "Recently updated" on the second. The indicator used to be `inset-y-0`
  // with an x-only translate, so it stretched to the FULL height of a
  // now-two-row tablist and `rounded-full` turned that ~130x96 box into a
  // giant green blob sitting over the first pill and bleeding into the second
  // row. A tab on the second row had no y offset to move to either, so the
  // pill would have marked the wrong tab entirely.
  //
  // One function, used by the layout effect and the ResizeObserver alike:
  // these were two copies of the same arithmetic, and only one of them would
  // have been fixed by someone patching the bug they happened to be looking at.
  const measure = () => {
    const el = refs.current[activeIndex];
    const list = listRef.current;
    if (!el || !list) return;
    const elRect = el.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    setIndicator({
      x: elRect.left - listRect.left,
      y: elRect.top - listRect.top,
      w: elRect.width,
      h: elRect.height,
    });
  };

  // Re-measured on every active change, and whenever the tablist resizes (a
  // count pill changing width, or the viewport narrowing enough to re-wrap).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measure() reads only refs
  useLayoutEffect(measure, [activeIndex, tabs.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure() reads only refs
  }, [activeIndex]);

  // A tab disappearing (its content expired between renders) must not leave
  // an uncontrolled caller pointing at nothing. A controlled caller owns this
  // itself.
  useEffect(() => {
    if (activeProp !== undefined) return;
    if (!tabs.some((t) => t.key === internalActive)) setInternalActive(tabs[0]?.key ?? "");
  }, [tabs, internalActive, activeProp]);

  if (tabs.length === 0) return null;
  const current = tabs[Math.min(activeIndex, tabs.length - 1)];

  // A single tab is not a choice — render the panel without the chrome
  // rather than showing a tablist of one, which reads as a broken control.
  const showTabs = tabs.length > 1;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div className={className}>
      {showTabs && (
        <div ref={listRef} role="tablist" aria-label={label} className="relative mb-3 flex flex-wrap gap-2">
          {indicator && (
            <span
              aria-hidden
              // left-0 top-0 + an explicit height, never inset-y-0: see the
              // measure() note above for the wrapped-tablist bug that caused.
              className="pointer-events-none absolute left-0 top-0 rounded-full bg-brand-500 motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-out"
              style={{
                width: indicator.w,
                height: indicator.h,
                transform: `translate(${indicator.x}px, ${indicator.y}px)`,
              }}
            />
          )}
          {tabs.map((t, i) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${t.key}`}
                // Roving tabindex: Tab reaches the tablist once, arrows move within it.
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(t.key)}
                onKeyDown={(e) => onKeyDown(e, i)}
                // The active tab sits on the indicator, which is always the fixed
                // bg-brand-500 fill (it does not theme), so its ink is fixed too:
                // a dark ink on the fill would invert with the theme (text-ink-950 turned
                // light in the light theme, 2.91:1 on the old green, 2026-09-23), and the fill
                // is on a sibling span, so globals.css's "dark ink on bright fills" selector
                // never matched it.
                // MTG Compare: the fill is the amethyst brand-500, which takes WHITE ink
                // (5.3:1, brand spec 6.3), so the fixed ink is #ffffff.
                className={`relative inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-wide transition-colors duration-fast ${
                  isActive ? "text-[#ffffff]" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={`num rounded-full px-1.5 text-[10px] font-bold ${
                      isActive ? "bg-[#ffffff]/20 text-[#ffffff]" : "bg-ink-800 text-slate-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {renderAllPanels
        ? tabs.map((t) => (
            <div
              key={t.key}
              role={showTabs ? "tabpanel" : undefined}
              id={`${baseId}-panel-${t.key}`}
              aria-labelledby={showTabs ? `${baseId}-tab-${t.key}` : undefined}
              hidden={t.key !== active}
              tabIndex={showTabs && t.key === active ? 0 : undefined}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {t.content}
            </div>
          ))
        : (
          <div
            role={showTabs ? "tabpanel" : undefined}
            id={`${baseId}-panel-${current.key}`}
            aria-labelledby={showTabs ? `${baseId}-tab-${current.key}` : undefined}
            // Focusable so a keyboard user can reach panel content that has no
            // focusable children of its own (WAI-ARIA authoring practice).
            tabIndex={showTabs ? 0 : undefined}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {current.content}
          </div>
        )}
    </div>
  );
}
