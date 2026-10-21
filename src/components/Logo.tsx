// The MTG Compare mark: two overlapping rhombi (a comparison), the left in amethyst, the right in brass, the overlap in ivory.
// An original abstract mark, deliberately not a Magic: The Gathering symbol (no mana symbol, no Planeswalker symbol, no card
// frame) and not the Wizards of the Coast logo. The same geometry is src/app/icon.svg and public/logo.svg.
const LEFT = "M18.12 9.09Q21 5 23.88 9.09L37.12 27.91Q40 32 37.12 36.09L23.88 54.91Q21 59 18.12 54.91L4.88 36.09Q2 32 4.88 27.91Z";
const RIGHT = "M40.12 9.09Q43 5 45.88 9.09L59.12 27.91Q62 32 59.12 36.09L45.88 54.91Q43 59 40.12 54.91L26.88 36.09Q24 32 26.88 27.91Z";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mcm-v" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#b98af2" />
          <stop offset="1" stopColor="#7028bb" />
        </linearGradient>
        <linearGradient id="mcm-b" x1="0.4" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecd187" />
          <stop offset="1" stopColor="#b58a30" />
        </linearGradient>
        <clipPath id="mcm-l">
          <path d={LEFT} />
        </clipPath>
      </defs>
      <path d={LEFT} fill="url(#mcm-v)" />
      <path d={RIGHT} fill="url(#mcm-b)" />
      <path d={RIGHT} fill="#fbf7ea" clipPath="url(#mcm-l)" />
    </svg>
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
