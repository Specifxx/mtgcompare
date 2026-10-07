"use client";

import { useEffect, useState } from "react";

/** Whole time units remaining until `targetIso`, floored at 0 in every field. */
function timeLeft(targetIso: string) {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    done: diff <= 0,
  };
}

const UNITS: { key: "days" | "hours" | "minutes" | "seconds"; label: string }[] = [
  { key: "days", label: "days" },
  { key: "hours", label: "hrs" },
  { key: "minutes", label: "min" },
  { key: "seconds", label: "sec" },
];

/**
 * Live Days/Hours/Minutes/Seconds countdown — the segmented-block style every
 * movie/game release countdown site (the brief's reference: avengerscountdown.com)
 * uses, in OP Compare's own voice: `.num`, the tabular JetBrains Mono class
 * already carrying every price and stat on the site, not a font invented for
 * this one page.
 *
 * SERVER-ACCURATE ON FIRST PAINT, THEN TICKS — this is a client component, but
 * `timeLeft()` still runs once during SSR using the server's clock, so the raw
 * HTML a crawler fetches shows real, current numbers (matching the release page's
 * own "the countdown is server-computed" principle — see release-dates/page.tsx),
 * not a client-only "0" that only becomes correct after hydration. useEffect then
 * ticks it forward once a second, purely client-side.
 *
 * suppressHydrationWarning on the digits: server render time and client hydrate
 * time are never exactly the same millisecond, so the two can legitimately
 * disagree by a second — the same accepted tradeoff every ticking-clock React
 * example makes, not a bug to chase.
 */
export function ReleaseCountdownTimer({ targetIso, onRelease }: { targetIso: string; onRelease?: () => void }) {
  const [left, setLeft] = useState(() => timeLeft(targetIso));

  useEffect(() => {
    if (left.done) return;
    const id = setInterval(() => {
      setLeft((prev) => {
        const next = timeLeft(targetIso);
        if (next.done && !prev.done) onRelease?.();
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);

  if (left.done) return null;

  return (
    <div className="mx-auto mt-5 grid max-w-md grid-cols-4 gap-2 sm:gap-3" role="timer" aria-live="off">
      {UNITS.map((u) => (
        <div
          key={u.key}
          className="card-surface flex flex-col items-center justify-center border-brand-500/25 bg-ink-900 py-3 sm:py-4"
        >
          <span className="num text-3xl font-extrabold leading-none text-brand-300 sm:text-4xl" suppressHydrationWarning>
            {String(left[u.key]).padStart(2, "0")}
          </span>
          <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{u.label}</span>
        </div>
      ))}
    </div>
  );
}
