"use client";

import { useEffect, useState, type ReactNode } from "react";

// Owner decision: route changes get "a progress bar + 150ms fade" — the
// progress bar is NextTopLoader (layout.tsx); this is the fade half.
//
// template.tsx (unlike layout.tsx) REMOUNTS on every navigation within this
// segment, which is exactly the hook this needs: a fresh mount per route is
// a fresh opportunity to fade content in.
//
// navigatedBefore is module-level, not component state, on purpose — it has
// to survive this component's own remounts (that's the whole point of a
// template) while still resetting on an actual fresh document load. It does,
// for a reason worth being explicit about: the server and the client run
// this module as two ENTIRELY SEPARATE bundles/instances. Server-side, the
// flag is only ever READ, never WRITTEN — the effect that flips it to true
// is a client-only lifecycle hook that cannot run during SSR — so every
// fresh document load (this browser's first visit, or a hard refresh) is
// server-rendered with the flag still false, and THE SERVER HTML NEVER
// CONTAINS A HIDDEN-STATE CLASS. Only once hydrated does the client-side
// module instance flip the flag, so every navigation AFTER that first one
// (handled entirely client-side, no server round trip for this component)
// correctly sees a previous visit and fades in.
//
// This matters for LCP: the homepage's largest content must never be gated
// behind an opacity transition on first paint, only on client navigations
// where the content was already ready before the fade started.
let navigatedBefore = false;

export default function Template({ children }: { children: ReactNode }) {
  // Captured once per mount via the lazy initializer, not re-read on every
  // render — otherwise the effect's own write below would retroactively
  // flip this mid-lifetime.
  const [firstLoad] = useState(() => !navigatedBefore);
  const [entered, setEntered] = useState(firstLoad);

  useEffect(() => {
    navigatedBefore = true;
    if (firstLoad) return; // already rendered fully visible below — nothing to animate
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [firstLoad]);

  return (
    <div
      className={
        firstLoad
          ? undefined
          : `transition-opacity duration-page ${entered ? "opacity-100" : "motion-safe:opacity-0"}`
      }
    >
      {children}
    </div>
  );
}
