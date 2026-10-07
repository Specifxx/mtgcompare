"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { usePresence, DUR } from "@/lib/motion";

type TriggerProps = {
  "aria-describedby": string;
  revealed: boolean;
  reveal: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

/**
 * A hover/focus tooltip with a first-tap-reveals-then-follows touch pattern
 * (the behaviour KeywordChip pioneered — see its own comment for why: a tap
 * on a touch device can't "hover" first, so the first tap reveals the
 * definition and a second tap, or a real mouse click, follows the link).
 *
 * Render-prop shape: `children` receives the props to spread onto whatever
 * element is the trigger (a Link, a button, a span) plus `revealed`/`reveal`
 * so the caller decides its own click semantics — Tooltip owns hover/focus/
 * Escape wiring and the bubble; it doesn't assume the trigger navigates.
 */
export function Tooltip({ id, content, children, className = "" }: { id: string; content: ReactNode; children: (trigger: TriggerProps) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { mounted, entered } = usePresence(open, DUR.fast);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <span className={`relative inline-block ${className}`}>
      {children({
        "aria-describedby": id,
        revealed: open,
        reveal: () => setOpen(true),
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
        onKeyDown,
      })}
      {mounted && (
        <span
          id={id}
          role="tooltip"
          className={`absolute bottom-full left-1/2 z-flyout mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-xs font-normal normal-case leading-snug text-slate-300 shadow-xl transition-opacity duration-fast ${
            entered ? "opacity-100" : "motion-safe:opacity-0"
          }`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
