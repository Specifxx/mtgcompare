// The MTG Compare mark: two overlapping rhombi (a comparison), the left in
// amethyst, the right in brass, the overlap in ivory, drawn as one inline SVG so
// it stays crisp from the 16px favicon to the hero. The chrome uses BrandLogo's
// one-colour mask (/logo-mask.svg) instead; this full-colour version is the blog
// byline, the share images and the icons. The SAME geometry is written to
// src/app/icon.svg, public/logo-mark.svg, public/logo-mask.svg and the PNG icons
// by scripts/gen-icons.ts; change MARK_PATHS and run `npm run icons`.
//
// It is an original abstract mark, deliberately not a Magic: The Gathering
// symbol (no mana symbol, no Planeswalker symbol, no card frame, no colour
// wheel) and not the Wizards of the Coast logo (see /about's disclaimer).
export const MARK_PATHS = {
  left: "M18.12 9.09Q21 5 23.88 9.09L37.12 27.91Q40 32 37.12 36.09L23.88 54.91Q21 59 18.12 54.91L4.88 36.09Q2 32 4.88 27.91Z",
  right: "M40.12 9.09Q43 5 45.88 9.09L59.12 27.91Q62 32 59.12 36.09L45.88 54.91Q43 59 40.12 54.91L26.88 36.09Q24 32 26.88 27.91Z",
};

// Gradient stops, shared with gen-icons.ts and the share images' <Mark>.
export const MARK_COLORS = {
  violetTop: "#b98af2",
  violetBottom: "#7028bb",
  brassTop: "#ecd187",
  brassBottom: "#b58a30",
  ivory: "#fbf7ea",
};

export function LogoMark({ size = 36, className = "", title = "MTG Compare", id = "mcm" }: { size?: number; className?: string; title?: string; id?: string }) {
  const C = MARK_COLORS;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-v`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={C.violetTop} />
          <stop offset="1" stopColor={C.violetBottom} />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0.4" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.brassTop} />
          <stop offset="1" stopColor={C.brassBottom} />
        </linearGradient>
        <clipPath id={`${id}-l`}>
          <path d={MARK_PATHS.left} />
        </clipPath>
      </defs>
      <path d={MARK_PATHS.left} fill={`url(#${id}-v)`} />
      <path d={MARK_PATHS.right} fill={`url(#${id}-b)`} />
      <path d={MARK_PATHS.right} fill={C.ivory} clipPath={`url(#${id}-l)`} />
    </svg>
  );
}
