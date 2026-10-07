"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DURATION, EASING } from "./motion-tokens";

export const DUR = DURATION;
export const EASE = EASING;

const QUERY = "(prefers-reduced-motion: reduce)";

/** Synchronous read for use inside effects/handlers (no subscription). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  // addEventListener is the modern API; Safari <14 needs the deprecated
  // addListener fallback, mirrored by the three inline matchMedia reads this
  // file replaces (Reveal.tsx, CountUp.tsx, the old useParallax.ts).
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

function getSnapshot(): boolean {
  return prefersReducedMotion();
}

function getServerSnapshot(): boolean {
  // The server always renders the full-motion markup; CSS's own
  // `@media (prefers-reduced-motion: reduce)` block (globals.css, kept LAST)
  // is the belt that keeps a reduced-motion visitor from ever seeing a flash
  // of animation before this hook's effect subscribes on the client.
  return false;
}

/** Reactive read — re-renders on a live OS-level change (rare, but free to support). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Standard ease-out-cubic, 0..1 -> 0..1. Used by CountUp. */
export function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * Mount/unmount + entrance/exit timing for anything that has a hidden state —
 * dialogs, sheets, nudges, toasts, flyouts. This is the ONE seam every overlay
 * in the codebase migrates onto (see src/components/ui/Dialog.tsx and the three
 * corner nudges), replacing what used to be a copy-pasted
 * `requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))`
 * entrance + a bare `setTimeout(() => setShown(false), N)` exit in each one.
 *
 * - `open` flips true: `mounted` becomes true IMMEDIATELY (so the element is in
 *   the DOM, still in its hidden/`motion-safe:opacity-0`-style state), then
 *   `entered` becomes true after a double rAF (the first rAF lands before the
 *   browser's next paint, so the hidden state must actually commit once before
 *   the class flips, or the transition never fires) — instantly under reduced
 *   motion, so there is no motion to skip in the first place.
 * - `open` flips false: `entered` becomes false at once (starts the visual exit
 *   this frame); `mounted` becomes false after `exitMs` (0 under reduced
 *   motion), unmounting only once the exit transition has had time to finish.
 *
 * Timers are cleared on unmount and on every `open`/`exitMs` change, so rapid
 * open/close toggling can never leave a stale timeout to fire late.
 */
export function usePresence(open: boolean, exitMs: number = DUR.base): { mounted: boolean; entered: boolean } {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(open);
  const rafA = useRef(0);
  const rafB = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const reduced = prefersReducedMotion();

    if (rafA.current) cancelAnimationFrame(rafA.current);
    if (rafB.current) cancelAnimationFrame(rafB.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);

    if (open) {
      setMounted(true);
      if (reduced) {
        setEntered(true);
      } else {
        setEntered(false);
        rafA.current = requestAnimationFrame(() => {
          rafB.current = requestAnimationFrame(() => setEntered(true));
        });
      }
    } else {
      setEntered(false);
      if (reduced || exitMs === 0) {
        setMounted(false);
      } else {
        exitTimer.current = setTimeout(() => setMounted(false), exitMs);
      }
    }

    return () => {
      if (rafA.current) cancelAnimationFrame(rafA.current);
      if (rafB.current) cancelAnimationFrame(rafB.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exitMs]);

  return { mounted, entered };
}
