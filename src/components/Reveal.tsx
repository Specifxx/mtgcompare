// Formerly a reveal-on-scroll wrapper that hid its children (opacity 0) with
// client JS until they scrolled into view. Removed 2026-10-20 (owner: "remove
// the fade"): Google indexes mobile-first with a smartphone renderer, and
// content that sits at opacity 0 until an IntersectionObserver fires is
// content Google may treat as hidden. It is now a plain wrapper, visible on
// first paint with no JS; the props are kept so call sites need no change.
// DECISIONS.md, "Nothing on a public page waits for JS to be visible".
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  delayMs?: number;
  once?: boolean;
}) {
  return <div className={className}>{children}</div>;
}
