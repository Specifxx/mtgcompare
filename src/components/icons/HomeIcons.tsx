// Small line-icon set replacing ad-hoc emoji in homepage chrome (hero CTA, the
// Marketplace nav pill, How-it-works steps, the Riftle teaser). Kept as plain
// inline SVGs — no icon-font/dependency, and they inherit `currentColor` so
// they pick up the surrounding text color for free (brand-400 in an icon
// chip, ink-950 on a filled button, etc). 1.5px stroke, 24x24 viewBox,
// rounded joins — one consistent visual weight across every usage.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function ScaleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18M12 7l-5 3M12 7l5 3" />
      <path d="M3 10a4 4 0 0 0 8 0M13 10a4 4 0 0 0 8 0" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h8a2 2 0 0 0 2-1.6L21 8H6.2" />
    </svg>
  );
}

/** A d20-ish play token — the "go and play" step in How-it-works. */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
      <path d="M12 2.5V12l8 5M12 12 4 17" />
    </svg>
  );
}

export function CardsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="12" height="15" rx="1.6" transform="rotate(-8 9 13.5)" />
      <rect x="9" y="3" width="12" height="15" rx="1.6" />
    </svg>
  );
}
