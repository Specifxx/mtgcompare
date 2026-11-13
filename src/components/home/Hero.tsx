import Link from "@/components/Link";
import type { CSSProperties, ReactNode } from "react";

// The hero of both home pages (owner, 2026-11-13: "get rid of the products on the hero … minimalistic, dynamic, aesthetic and
// smooth without having everything there"; ported from DexCompare the same day). Words, the search and a few ways in, centred, on
// a ground of two slow glows and a dot grid (globals.css .hero-bg: gradients only, no canvas, no image). Never a product card, a
// badge for a feature or a second banner: at most one small pill above the headline. Server components: no script of their own.

/** Each part's place in the entrance (globals.css .rise: 70ms apart). */
export const riseAt = (i: number) => ({ "--i": i }) as CSSProperties;

export function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-in">{children}</div>
    </section>
  );
}

/** The one small line above the headline: the single most timely link (a set on pre-order), else a plain label (the region). */
export function HeroPill({ href, children }: { href?: string; children: ReactNode }) {
  return href ? (
    <Link href={href} prefetch={false} className="hero-pill rise">
      <span className="hero-pill-dot" aria-hidden="true" />
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  ) : (
    <p className="hero-pill rise">{children}</p>
  );
}

// The tiles' shapes, drawn like Icon.tsx's (24×24, 2px round strokes, currentColor). Functions, so no JSX runs when the module loads.
const SHAPES = {
  // A Play Booster Box: the plain box.
  box: () => (
    <>
      <path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </>
  ),
  // A Collector Booster Box: the premium one, a cut gem.
  collector: () => (
    <>
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M2 9h20M11 3 8 9l4 12 4-12-3-6" />
    </>
  ),
  // A Commander deck: two cards, one over the other.
  deck: () => (
    <>
      <rect x="4" y="7" width="11" height="14" rx="1.5" />
      <path d="M9 3.5h9.5A1.5 1.5 0 0 1 20 5v12.5" />
    </>
  ),
  // A Bundle: the lidded storage box it comes in.
  bundle: () => (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M3 5h18v4H3zM10 13h4" />
    </>
  ),
  tag: () => (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  sets: () => (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </>
  ),
  // Pre-orders and the release calendar.
  calendar: () => (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
} satisfies Record<string, () => ReactNode>;
export type WayShape = keyof typeof SHAPES;

export interface Way {
  href: string;
  label: string;
  icon: WayShape;
}

/**
 * The ways in: the few pages most visitors want next, as big quiet tiles (six at most: a row on a desktop, two columns on a phone).
 * Plain links in the server's HTML. `links` are built for one region; the landing page moves them to the visitor's (SoftWaysIn).
 */
export function WaysIn({ links, label }: { links: Way[]; label: string }) {
  return (
    <ul className="ways rise" style={riseAt(4)} aria-label={label}>
      {links.map((l) => (
        <li key={l.label} className="flex">
          <Link href={l.href} prefetch={false} className="way flex-1">
            <span className="way-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" focusable="false">
                {SHAPES[l.icon]()}
              </svg>
            </span>
            <span className="min-w-0">{l.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
