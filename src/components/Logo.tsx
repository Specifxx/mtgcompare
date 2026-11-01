// The MTG Compare mark: five orbs in the five colours (white, blue, black, red, green, in colour-pie order) on a brass ring around
// a four-point spark, on a night-purple tile. An original abstract mark, deliberately not a Magic: The Gathering symbol (no mana
// symbol, no Planeswalker symbol, no card frame) and not the Wizards of the Coast logo. The same geometry is src/app/icon.svg,
// public/logo.svg and the PNG icons (apple-icon, icon-192, icon-512).
const ORBS: { cx: number; cy: number; from: string; to: string }[] = [
  { cx: 32, cy: 15.5, from: "#fffaf0", to: "#d6bf86" },
  { cx: 48.64, cy: 27.59, from: "#74c0ff", to: "#1d5fbf" },
  { cx: 42.29, cy: 47.16, from: "#c7b8d6", to: "#3b2f4a" },
  { cx: 21.71, cy: 47.16, from: "#ff7a57", to: "#b8230f" },
  { cx: 15.36, cy: 27.59, from: "#6ee09f", to: "#13803f" },
];
const SPARK = "M32 25.5Q33 31.6 39.5 33Q33 34.4 32 40.5Q31 34.4 24.5 33Q31 31.6 32 25.5Z";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // In a host span so the Christmas Santa hat (globals.css .xmas-logo-hat, hidden outside the season) can sit on the mark.
  return (
    <span className="xmas-hat-host">
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <defs>
          <radialGradient id="mcm-bg" cx="0.5" cy="0.3" r="0.85">
            <stop offset="0" stopColor="#2b1d55" />
            <stop offset="1" stopColor="#0b0914" />
          </radialGradient>
          <linearGradient id="mcm-gd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7e3a3" />
            <stop offset="1" stopColor="#c39434" />
          </linearGradient>
          {ORBS.map((o, i) => (
            <radialGradient key={i} id={`mcm-o${i}`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor={o.from} />
              <stop offset="1" stopColor={o.to} />
            </radialGradient>
          ))}
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#mcm-bg)" />
        <circle cx="32" cy="33" r="17.5" fill="none" stroke="url(#mcm-gd)" strokeWidth="2.6" />
        <path d={SPARK} fill="url(#mcm-gd)" />
        {ORBS.map((o, i) => (
          <circle key={i} cx={o.cx} cy={o.cy} r="7.6" fill={`url(#mcm-o${i})`} stroke="#120c1f" strokeWidth="1.3" />
        ))}
      </svg>
      <span aria-hidden="true" className="xmas-logo-hat" />
    </span>
  );
}

/**
 * The mark and the wordmark. `wordmark` sets when the word shows: the header passes "hidden sm:inline", so a phone's one row keeps
 * its width for the search box (the mark alone is the home link there, named by the link's aria-label).
 */
export function Logo({ wordmark = "" }: { wordmark?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className={`font-display text-[19px] font-extrabold tracking-tight ${wordmark}`}>
        MTG <span className="text-brand">Compare</span>
      </span>
    </span>
  );
}
