"use client";

import type { ReactNode } from "react";
import { usePresence, DUR } from "@/lib/motion";

/**
 * Presentational bottom toast. Callers own WHEN it's shown (a boolean/message
 * they control) — this only owns how it enters/exits.
 *
 * `.above-bottombar` (not a bare `bottom-4`): clears the mobile bottom tab
 * bar, which is `0` on desktop so this is a plain `bottom-4`-equivalent
 * inset everywhere the bar doesn't render.
 */
export function Toast({ open, message, action, className = "" }: { open: boolean; message: ReactNode; action?: ReactNode; className?: string }) {
  const { mounted, entered } = usePresence(open, DUR.fast);
  if (!mounted) return null;
  return (
    <div className={`above-bottombar fixed inset-x-0 z-toast flex justify-center px-4 ${className}`}>
      <div
        role="status"
        aria-live="polite"
        className={`card-surface flex max-w-sm items-center gap-3 px-4 py-3 text-sm text-white shadow-lg transition-[opacity,transform] duration-base ease-out ${
          entered ? "translate-y-0 opacity-100" : "motion-safe:translate-y-2 motion-safe:opacity-0"
        }`}
      >
        <span className="min-w-0 flex-1">{message}</span>
        {action}
      </div>
    </div>
  );
}
