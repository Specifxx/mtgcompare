"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

const THRESHOLDS = [25, 50, 75, 90] as const;

// Fires a GA4 `scroll_depth` event the first time a visitor's scroll position
// crosses each of 25/50/75/90% of the page.
//
// WHY THIS EXISTS: GA4's built-in Enhanced Measurement scroll event only
// fires once, at 90% — fine for a short page, useless for judging whether
// anyone ever saw section 4 of a 13-section page. The homepage-rebuild brief
// needs the lower thresholds specifically to prove (or disprove) that the
// sections being trimmed were actually being seen before they're cut.
//
// FIRES-ONCE-PER-THRESHOLD-PER-MOUNT: `fired` is a plain Set closed over by
// this effect, not state — scrolling back up past a threshold and back down
// again must NOT re-fire it (that would inflate the "percent who reached X%"
// metric with re-entries instead of unique visitors), and using a Set instead
// of re-rendering also means checking it costs nothing on every scroll tick.
//
// MOUNTED PER-ROUTE, NOT IN THE ROOT LAYOUT: this component is deliberately
// rendered from src/components/ArticleView.tsx — the shared body of
// /blog/[slug] and /guides/[slug], the long-form pages this was built to
// measure — rather than src/app/layout.tsx (site-wide chrome). The root
// layout in this app's App Router tree stays mounted across client-side
// navigations between routes that share it — only the route segment below it
// swaps — so a tracker living there would only ever run its mount effect once
// per full document load, not once per pageview. A visitor who navigates
// article A → article B via client-side <Link>s would then get scroll-depth
// events for only the first of those two visits. Mounting inside ArticleView
// means the tracker's own effect (and its `fired` Set) is torn down and
// recreated every time the article route segment itself remounts, which is
// exactly "once per pageview". The component itself has zero article-
// specific code — any other route can mount it the same way once scroll-
// depth reporting is wanted there too (see DECISIONS.md for this call).
export function ScrollDepthTracker() {
  useEffect(() => {
    const fired = new Set<number>();
    let ticking = false;

    function depthPercent(): number {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      // A page shorter than (or equal to) the viewport has nothing to scroll —
      // treat it as fully seen rather than dividing by zero / NaN.
      if (scrollable <= 0) return 100;
      const scrolled = window.scrollY || doc.scrollTop || 0;
      return Math.min(100, Math.round((scrolled / scrollable) * 100));
    }

    function check() {
      const depth = depthPercent();
      for (const threshold of THRESHOLDS) {
        if (depth >= threshold && !fired.has(threshold)) {
          fired.add(threshold);
          trackEvent("scroll_depth", {
            percent_scrolled: threshold,
            page_path: window.location.pathname,
          });
        }
      }
    }

    function onScroll() {
      // rAF-throttled: `scroll` can fire dozens of times a second, but the
      // threshold check only needs to run once per paint at most.
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        check();
        ticking = false;
      });
    }

    // Check once on mount too — covers a page short enough that 90% (or even
    // 25%) is already satisfied with zero scrolling (e.g. a very tall
    // viewport, or a visitor who scrolled before hydration finished).
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
