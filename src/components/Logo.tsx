// The OP Compare mark: a straw hat (full colour — the blog byline, the share
// images and the icons; the chrome uses BrandLogo's one-colour mask) — gold crown, Straw Hat red band — drawn as
// one inline SVG so it stays crisp from the 16px favicon to the hero. The same
// geometry is written to src/app/icon.svg and the PNG icons by
// scripts/gen-icons.ts; change both together.
//
// It is a generic straw hat, deliberately not the Straw Hat Pirates' Jolly
// Roger or any other mark from the series (see /about's disclaimer).
export const HAT_PATHS = {
  brim: { cx: 32, cy: 41, rx: 29, ry: 11 },
  crown: "M15 40 C15 12.5 49 12.5 49 40 Z",
  band: "M15.3 33 C24 37.4 40 37.4 48.7 33 L49 40 C40 44.2 24 44.2 15 40 Z",
  shine: "M23 26 C28 22.6 36 22.6 41 26",
  brimLine: "M9 45.5 C19 50 45 50 55 45.5",
};

export function HatMark({ size = 36, className = "", title = "OP Compare" }: { size?: number; className?: string; title?: string }) {
  const id = "ophat";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-crown`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe28c" />
          <stop offset="1" stopColor="#e3a531" />
        </linearGradient>
        <linearGradient id={`${id}-brim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8d262" />
          <stop offset="1" stopColor="#c7861f" />
        </linearGradient>
      </defs>
      <ellipse {...HAT_PATHS.brim} fill={`url(#${id}-brim)`} stroke="#7d520e" strokeWidth="1.6" />
      <path d={HAT_PATHS.brimLine} stroke="#7d520e" strokeWidth="1" fill="none" opacity="0.45" />
      <path d={HAT_PATHS.crown} fill={`url(#${id}-crown)`} stroke="#7d520e" strokeWidth="1.6" />
      <path d={HAT_PATHS.band} fill="#d92b33" stroke="#6e1016" strokeWidth="1.2" />
      <path d={HAT_PATHS.shine} stroke="#fff6cf" strokeWidth="1.6" fill="none" opacity="0.75" strokeLinecap="round" />
    </svg>
  );
}
