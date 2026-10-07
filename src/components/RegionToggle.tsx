"use client";

import { COUNTRY_LIST } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Compact segmented market switcher for inline use on tool pages (arbitrage, value
// finder, etc.). Switching sets the country cookie and refreshes, so the server page
// re-runs its queries for the chosen market. Optional label; hidden when INTL is off.
//
// THE SEGMENTED ROW MUST BE ABLE TO WRAP, and this is not cosmetic — it was
// zooming the entire site out on phones (2026-09-22, reported as "the website
// is way too small for phone now and zoomed out").
//
// The row was `inline-flex` with no wrapping, so its min-content width was the
// SUM of all six market buttons: 441px measured at a 390px viewport. A flex
// item cannot shrink below min-content, and the parent's `flex-wrap` cannot
// help because it wraps the row as ONE unit — there was nothing to wrap. So
// /tools/deal-finder and /tools/value-finder laid out 457px wide on a 390px
// phone, and Chrome for Android responds to content wider than the viewport by
// WIDENING the layout viewport to fit and scaling the page down. It then
// remembers that zoom per site, so every other page looks shrunken afterwards
// too — which is why this read as "the whole site" rather than "two tool pages".
//
// Wrapping rather than `overflow-x-auto` on purpose: every market stays visible
// and tappable instead of some being hidden behind a scroll gesture, and the
// control stays correct however many markets COUNTRY_LIST grows to (it has
// already grown once — EU was the sixth, and the sixth is what broke it).
export function RegionToggle({ label = "Market", className = "" }: { label?: string; className?: string }) {
  const { country, setCountry, currency } = useCountry();

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900 p-1">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          // aria-labelledby, not aria-label: see the comment on the equivalent
          // buttons in CountryHeroToggle for why a hand-written string kept
          // failing label-content-name-mismatch even when it started with the
          // right word.
          const flagId = `rt-${c.code}-flag`;
          const codeId = `rt-${c.code}-code`;
          const currencyId = `rt-${c.code}-currency`;
          const descId = `rt-${c.code}-desc`;
          // min-h-11 below sm (48px on a coarse pointer, via globals.css): the
          // buttons measured 28px tall on a phone. From sm up they keep the
          // compact 28px with a MOUSE only: the reset is
          // `sm:[@media(pointer:fine)]:min-h-0`, because a bare `sm:min-h-0` is
          // emitted after the coarse-pointer 48px rule and cancelled it on touch
          // tablets and landscape phones (measured 28px there, 2026-09-23).
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-labelledby={active ? `${flagId} ${codeId} ${currencyId} ${descId}` : `${flagId} ${codeId} ${descId}`}
              className={`flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors sm:[@media(pointer:fine)]:min-h-0 ${
                active ? "bg-brand-500 text-white" : "text-slate-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <span id={flagId} className="text-base leading-none">{c.flag}</span>
              <span id={codeId}>{c.code}</span>
              {/* No colour of its own: it inherits the active button's
                  text-ink-950, which the light theme keeps dark on the brand
                  fill. `text-white/80` measured 2.54:1 there; this is ~6.2:1
                  in both themes (2026-09-23). */}
              {active && (
                <span id={currencyId} className="text-[10px] font-medium">
                  {currency}
                </span>
              )}
              <span id={descId} className="sr-only">
                — {c.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
