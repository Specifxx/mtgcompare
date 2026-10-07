import type { ReactNode } from "react";

// Thin wrapper so CinematicHero can stay a server component while owning a
// stable `#rc-hero` marker — HeaderSearchSlot's IntersectionObserver watches
// this exact id (tests/header-search-resize.test.ts) and
// tests/sidenav.test.ts pins this component's own `<ParallaxRoot id="rc-hero"
// className="…">` call site, so BOTH the component name and the id must
// survive even though the parallax effect itself is gone.
//
// FORMERLY a client component wrapping useParallax(), which wrote --px/--py/
// --sy custom properties that only the (also removed) .parallax-art/
// .parallax-aurora classes read — and nothing rendered those classes anywhere
// in src/ by the time the P0 motion audit went looking for a consumer. A
// dead scroll+pointermove listener pair on the hero, doing real work on every
// scroll frame for zero visible effect. This is now a plain server element.
export function ParallaxRoot({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  );
}
