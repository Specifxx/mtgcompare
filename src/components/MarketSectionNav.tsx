"use client";

import { useEffect, useState } from "react";

type Section = { id: string; label: string };

// A sticky in-page jump nav for the long /market and /market/records pages:
// anchor links plus a live active-section highlight (IntersectionObserver) so
// it's easy to navigate while scrolling. No-JS safe — the links still jump; only
// the highlight needs JS.
//
// Sticky under the 64px navbar from xl only. Below xl the navbar carries its
// full-width card-search row (121px with a mouse, 125px on touch at 1024–1279,
// and the same two-row header on phones and tablets), so there it's a normal
// scroll-along bar (no risky overlap) — and it wraps, rather than hiding its
// last tabs behind a sideways scroll with no visible scrollbar.
//
// Both pages' anchored sections carry `scroll-mt-40 xl:scroll-mt-36` to match
// (2026-09-23): 10rem below xl, where the two-row header ends at ~125px; from
// xl, 9rem, where this ~50px bar sticks under the 65px header and ends at
// ~114px. One notch more than the chrome alone needs, because every section
// sits in a <Reveal>: the FIRST jump to a not-yet-revealed section is aimed
// while it is still at translateY(26px), so it comes to rest 26px higher once
// it animates in. Measured with 9rem/8rem, that left the heading 7px under the
// header (118 vs 125) and 12px under this bar (102 vs 114); now 134 and 118,
// and 160/144 on a repeat jump or with reduced motion.
export function MarketSectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section currently crossing the observation band wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // Bias the band to the upper viewport so the active item flips as a section
      // reaches the top, accounting for the sticky header + this nav.
      //
      // The top edge has to sit BELOW the previous section's bottom after a jump,
      // or an instant jump (reduced motion, or a #hash load) reports both
      // sections at once and "topmost wins" highlights the one above. A jump
      // rests a section at its scroll-mt (160px below xl, 144px from xl) with the
      // previous one ending the 32px page gap above it (128 / 112), so 136px.
      // At 120 — fine with the old 9rem margin — the 10rem one lit "Index" for
      // a jump to Constituents at 390 with reduced motion (measured 2026-09-23).
      { rootMargin: "-136px 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Index sections"
      className="z-30 rounded-lg border border-ink-800 bg-ink-950/80 px-2 backdrop-blur-md xl:sticky xl:top-16"
    >
      <ul className="flex flex-wrap gap-1 py-2 xl:flex-nowrap xl:overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors sm:min-h-0 sm:py-1.5 ${
                  isActive
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-slate-400 hover:bg-ink-800 hover:text-white"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
