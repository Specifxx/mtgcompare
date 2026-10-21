import type { ReactNode } from "react";

// The site's few icons, as inline SVG: no icon font, no request, no layout shift (the box is sized before anything loads), and they
// take the text colour (stroke="currentColor"), so light and dark mode need nothing. 24×24 grid, 2px round strokes. Decorative by
// default (aria-hidden): the link or button around one carries the words. Pass `title` only for an icon that stands alone.
// Each shape is a function, so no JSX runs when the module loads (the tests set globalThis.React after their imports).

const PATHS = {
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  menu: () => <path d="M4 6h16M4 12h16M4 18h16" />,
  close: () => <path d="M6 6l12 12M18 6 6 18" />,
  tag: () => (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  calendar: () => (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  store: () => <path d="M3 10 5 4h14l2 6zM4.5 10v10h15V10M9.5 20v-5h5v5" />,
  truck: () => (
    <>
      <path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  share: () => (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 13.3 7.6 4.4M15.8 6.3l-7.6 4.4" />
    </>
  ),
  "arrow-right": () => <path d="M5 12h14M13 6l6 6-6 6" />,
  check: () => <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
} satisfies Record<string, () => ReactNode>;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, size = 20, className = "", title, strokeWidth = 2 }: { name: IconName; size?: number; className?: string; title?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: "false" })}
    >
      {title && <title>{title}</title>}
      {PATHS[name]()}
    </svg>
  );
}
