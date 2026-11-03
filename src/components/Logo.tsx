// The MTG Compare mark, the "ember fan" (owner, 2026-11-03: "a nicer logo that looks like the official one but is not a copy"): five
// flame-tongue petals fanning up from a glowing hub, in warm red-orange with a lighter core, on the night-purple tile. The feel of the
// game's warm fan-shaped symbol, drawn as our own lotus of flames: straight leaf-shaped tongues that come to a point, a lit sphere at the
// base, no circle around them and no curled tips. Nothing is traced from or shaped like the Planeswalker symbol, a mana symbol or the
// Wizards of the Coast logo. The same geometry is src/app/icon.svg, public/logo.svg, the PNG icons (apple-icon, icon-192, icon-512) and
// src/app/favicon.ico; src/lib/og-card.tsx draws a flat copy for the share cards (satori has no gradients).
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // In a host span so the Christmas Santa hat (globals.css .xmas-logo-hat, hidden outside the season) can sit on the mark.
  return (
    <span className="xmas-hat-host">
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <defs>
          <radialGradient id="mcm-bg" cx="0.5" cy="0.3" r="0.85"><stop offset="0" stopColor="#2b1d55"/><stop offset="1" stopColor="#0b0914"/></radialGradient>
          <linearGradient id="mcm-f0" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#8f160f"/><stop offset="0.6" stopColor="#e03f1c"/><stop offset="1" stopColor="#ff9a3c"/></linearGradient>
          <linearGradient id="mcm-f1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#a81d0f"/><stop offset="0.6" stopColor="#f05322"/><stop offset="1" stopColor="#ffb14a"/></linearGradient>
          <linearGradient id="mcm-f2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#bf2810"/><stop offset="0.55" stopColor="#ff6a24"/><stop offset="1" stopColor="#ffcf5a"/></linearGradient>
          <linearGradient id="mcm-c0" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff8a3a" stopOpacity="0"/><stop offset="1" stopColor="#ffd27a"/></linearGradient>
          <linearGradient id="mcm-c1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff9a3a" stopOpacity="0"/><stop offset="1" stopColor="#ffe08a"/></linearGradient>
          <linearGradient id="mcm-c2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ffb13a" stopOpacity="0"/><stop offset="1" stopColor="#fff0a8"/></linearGradient>
          <radialGradient id="mcm-glow" cx="0.5" cy="0.78" r="0.62"><stop offset="0" stopColor="#ff7a30" stopOpacity="0.5"/><stop offset="1" stopColor="#ff7a30" stopOpacity="0"/></radialGradient>
          <radialGradient id="mcm-hub" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stopColor="#fff6d0"/><stop offset="1" stopColor="#e09a22"/></radialGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#mcm-bg)"/>
        <rect width="64" height="64" rx="14" fill="url(#mcm-glow)"/>
        <g transform="translate(32 53)">
      <g transform="rotate(-52)">
          <path d="M-6 0 C-7 -13.1 -3.30 -22.6 -1.6 -29 C3.30 -22.6 7 -13.1 6 0 Z" fill="url(#mcm-f0)" stroke="#1a1030" strokeWidth="1.1" strokeLinejoin="round"/>
          <path d="M-2.52 -3 C-3.00 -11.6 -1.80 -17.4 -0.64 -20.9 C1.80 -17.4 3.00 -11.6 2.52 -3 Z" fill="url(#mcm-c0)" opacity="0.85"/>
        </g>
      <g transform="rotate(52)">
          <path d="M-6 0 C-7 -13.1 -3.30 -22.6 1.6 -29 C3.30 -22.6 7 -13.1 6 0 Z" fill="url(#mcm-f0)" stroke="#1a1030" strokeWidth="1.1" strokeLinejoin="round"/>
          <path d="M-2.52 -3 C-3.00 -11.6 -1.80 -17.4 0.64 -20.9 C1.80 -17.4 3.00 -11.6 2.52 -3 Z" fill="url(#mcm-c0)" opacity="0.85"/>
        </g>
      <g transform="rotate(-26)">
          <path d="M-6.5 0 C-7.5 -15.8 -3.58 -27.3 -1.6 -35 C3.58 -27.3 7.5 -15.8 6.5 0 Z" fill="url(#mcm-f1)" stroke="#1a1030" strokeWidth="1.1" strokeLinejoin="round"/>
          <path d="M-2.73 -3 C-3.25 -14.0 -1.95 -21.0 -0.64 -25.2 C1.95 -21.0 3.25 -14.0 2.73 -3 Z" fill="url(#mcm-c1)" opacity="0.85"/>
        </g>
      <g transform="rotate(26)">
          <path d="M-6.5 0 C-7.5 -15.8 -3.58 -27.3 1.6 -35 C3.58 -27.3 7.5 -15.8 6.5 0 Z" fill="url(#mcm-f1)" stroke="#1a1030" strokeWidth="1.1" strokeLinejoin="round"/>
          <path d="M-2.73 -3 C-3.25 -14.0 -1.95 -21.0 0.64 -25.2 C1.95 -21.0 3.25 -14.0 2.73 -3 Z" fill="url(#mcm-c1)" opacity="0.85"/>
        </g>
      <g transform="rotate(0)">
          <path d="M-7 0 C-8 -17.6 -3.85 -30.4 0 -39 C3.85 -30.4 8 -17.6 7 0 Z" fill="url(#mcm-f2)" stroke="#1a1030" strokeWidth="1.1" strokeLinejoin="round"/>
          <path d="M-2.94 -3 C-3.50 -15.6 -2.10 -23.4 0.00 -28.1 C2.10 -23.4 3.50 -15.6 2.94 -3 Z" fill="url(#mcm-c2)" opacity="0.85"/>
        </g>
          <circle r="5" fill="url(#mcm-hub)" stroke="#1a1030" strokeWidth="1.1"/>
        </g>
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
