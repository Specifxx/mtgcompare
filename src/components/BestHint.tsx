"use client";

import { useState } from "react";

/**
 * The small "i" beside a plain store's "Best price" chip (lib/best-tag.ts): its words are the button's title (a hover tooltip) and aria-label,
 * and a tap shows them as a muted line under the row, which is how a phone reads them. The note is drawn by the row (`note`), below.
 */
export function BestHint({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      aria-expanded={open}
      onClick={onToggle}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[11px] font-bold italic leading-none text-muted hover:text-ink"
    >
      <span aria-hidden="true">i</span>
    </button>
  );
}

/** Holds the tap state for a row's hint: the button goes in the name line, the note under the row. */
export function useBestHint() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((o) => !o) };
}
