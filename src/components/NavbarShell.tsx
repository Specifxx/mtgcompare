"use client";

import { useEffect, useRef, type ReactNode } from "react";

// RiftCompare's NavbarShell, verbatim: the header floats over the page at the
// top (bg-ink-950/30, a light blur) and turns into a frosted, shadowed bar once
// the page scrolls past 8px. The swap is a rAF-throttled classList change, not
// React state, so scrolling never re-renders the (server-rendered) header
// contents — only this <header>'s own classes change.
const SCROLLED = ["border-ink-800/80", "bg-ink-950/70", "shadow-header", "backdrop-blur-xl"];
const AT_TOP = ["border-transparent", "bg-ink-950/30", "backdrop-blur-sm"];

export function NavbarShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let scrolled: boolean | null = null;
    function apply() {
      raf = 0;
      const next = window.scrollY > 8;
      if (next === scrolled) return; // the common case: nothing crossed the threshold
      scrolled = next;
      el!.classList.remove(...(next ? AT_TOP : SCROLLED));
      el!.classList.add(...(next ? SCROLLED : AT_TOP));
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(apply);
    }
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <header
      ref={ref}
      className={`sticky top-0 z-header border-b pl-[var(--sidenav-w)] transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${AT_TOP.join(
        " "
      )}`}
    >
      {children}
    </header>
  );
}
