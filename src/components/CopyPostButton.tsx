"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy a block of ready-made post text to the clipboard.
 *
 * WHY THE TEXTAREA IS ALWAYS RENDERED, not revealed on demand: the clipboard API
 * is unavailable in more places than people expect — any non-secure context, an
 * in-app webview (a Discord or Instagram browser, which is exactly where a
 * shared link gets opened), and Safari when the write is not driven directly by
 * a user gesture. A button that silently does nothing there is worse than no
 * button, so the text is visible and selectable regardless, and the button is a
 * convenience on top rather than the only way through.
 */
export function CopyPostButton({
  text,
  label = "Copy post",
  copiedHint = "Paste it straight into Discord.",
  className,
}: {
  text: string;
  label?: string;
  // Shown briefly after a successful copy. Defaults to this component's
  // original social-post framing; callers copying something else (an embed
  // snippet, a code block) should pass their own so the hint stays true.
  copiedHint?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Hold the timer so a second click restarts the "Copied" window rather than
  // letting the first click's timeout clear the label out from under it.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Fall back to selecting it so the user can hit Ctrl/Cmd-C themselves —
      // one keystroke away instead of a dead end.
      areaRef.current?.select();
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="btn-primary text-sm">
          {state === "copied" ? "✓ Copied" : label}
        </button>
        {state === "failed" && (
          <span className="text-xs text-slate-400" role="status">
            Selected below — press Ctrl/Cmd&nbsp;+&nbsp;C to copy.
          </span>
        )}
        {state === "copied" && (
          <span className="text-xs text-brand-400" role="status">
            {copiedHint}
          </span>
        )}
      </div>
      <textarea
        ref={areaRef}
        readOnly
        value={text}
        // Sized to the content so short posts don't sit in a mostly-empty box and
        // long ones don't need scrolling to check before posting.
        rows={Math.min(8, text.split("\n").length + 1)}
        aria-label="Post text"
        className="mt-2 w-full resize-y rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-300 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      />
    </div>
  );
}
