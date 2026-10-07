// The site's motion system, in one dependency-free place. Before this file the
// codebase had ZERO transitionDuration/transitionTimingFunction/zIndex tokens
// in tailwind.config.ts and ZERO `ease-*` className usages anywhere in src/ —
// every transition was an ad-hoc `duration-150`/`duration-300` on the browser's
// default linear-ish curve, so nothing on the site felt deliberate.
//
// This object is the single source for BOTH tailwind.config.ts (which extends
// transitionDuration/transitionTimingFunction/zIndex from it, so `duration-fast`,
// `ease-out` and `z-modal` exist as real utilities) and runtime JS
// (src/lib/motion.ts re-exports DURATION as DUR). Changing a number here changes
// it everywhere at once — no drift between the CSS utility and the JS timer that
// has to agree with it (see usePresence in motion.ts).
//
// Plain object literal, no imports: tailwind.config.ts is loaded by Next's jiti
// loader, which cannot resolve the `@/` path alias, so this file is imported by
// a RELATIVE path from there and must stay free of anything that would need one.
//
// tests/design-system.test.ts pins that tailwind.config.ts's extend blocks equal
// these values.

export const DURATION = {
  // Micro-interactions: overlay exits, hover states, focus rings.
  fast: 120,
  // The default: overlay entrances, nudges, tab indicators.
  base: 200,
  // Slow, deliberate motion: the phone nav menu, image hover zoom.
  slow: 320,
  // Route-change fade (owner decision: "progress bar + 150ms fade").
  page: 150,
  // CountUp's number-ticking duration — not a CSS transition, but kept here so
  // every "how long does this take" answer lives in one file.
  count: 1100,
} as const;

export const EASING = {
  // The one curve used everywhere motion "settles" — a slight overshoot-free
  // ease-out. Chosen to read as quick and confident, not bouncy (owner brief:
  // "refined & fast").
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  // For state that animates both in and out through the same path (tab
  // indicators sliding between positions).
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

// Every z-index literal found in the codebase at the time this scale was
// introduced, named. New overlay work should reach for one of these instead of
// inventing a bare `z-[N]`; TWO literals stay hardcoded outside it on purpose,
// pinned by tests: the corner nudges' `z-[70]` (tests/signup-inline.test.ts)
// and the skip link's `focus:z-[200]` (layout.tsx) — both predate this file and
// changing the source string, not just the token, would break their tests for
// no visual gain. NextTopLoader also sits at 200 so it always wins over every
// overlay's backdrop.
export const Z = {
  // 45, above `header`, since 2026-09-21: the desktop rail used to start
  // BELOW the header (top-16) and so correctly sat under it. It now runs the
  // full page height and owns the brand block in the top-left corner, while
  // the header is inset by --sidenav-w — so the header's own background and
  // border still span that corner and would paint over the rail's brand if
  // the rail stayed under it. Deliberately between `header` and `dropdown`:
  // the rail outranks the page chrome, and every menu/overlay still outranks
  // the rail.
  rail: 45,
  flyout: 30,
  header: 40,
  bottombar: 40,
  dropdown: 50,
  overlay: 60,
  nudge: 70,
  toast: 80,
  sheet: 85,
  menu: 95,
  modal: 120,
  skip: 200,
} as const;
