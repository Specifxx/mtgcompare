"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// Shows `children` only while on the given route match — used by FooterNav
// (a plain SERVER component; see that file's own doc comment for why this
// toggle lives in a separate client file rather than making FooterNav itself
// "use client") to pick between its two pre-rendered footer layouts without
// either one ever being JS-only navigation.
//
// BOTH layouts are real, server-rendered `<Link href>` anchors, always both
// present in the raw HTML — this component only ever toggles a CSS `hidden`
// class after hydration, exactly the same non-unmounting visibility pattern
// HeaderSearchSlot/HomeHeaderReveal already use elsewhere in this codebase
// for the same reason: a crawler or a visitor with JS disabled sees BOTH
// footer layouts' links (redundant, but never absent — the FOOTER_GROUPS
// links this guards are the only remaining path to over a dozen sections the
// homepage-redesign brief moved out of the homepage body), and only a
// visitor whose browser actually runs this effect ever sees just one.
//
// `match`: "home" shows children only on "/"; "other" shows them everywhere
// else. Always resolved server-side-correctly on the very first paint —
// usePathname() already returns the right value on the initial render, no
// flash of the wrong variant.
// Open everywhere except the homepage, which keeps its site map one click away
// (see FooterNav.tsx). usePathname() is known during SSR, so ISR HTML already
// carries the right `open` state. Phones collapse it after mount so the list
// doesn't add a screen of links below the fold (the old per-group accordions).
export function FooterSiteMapDetails({ children }: { children: ReactNode }) {
  const isHome = usePathname() === "/";
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(max-width: 639px)").matches) ref.current.open = false;
  }, []);
  return (
    <details ref={ref} className="group py-3" open={!isHome}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-300 [&::-webkit-details-marker]:hidden">
        Full site map
        <svg
          className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      {children}
    </details>
  );
}
