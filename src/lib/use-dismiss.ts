"use client";

import { useEffect, useRef, type RefObject } from "react";

// One dismissal rule for the header's small popovers (CountrySwitcher,
// UserMenu): an outside mousedown, Escape, or focus leaving the wrapper closes
// it. mousedown, NOT pointerdown: on touch, pointerdown would close the menu at
// the start of any scroll gesture outside it. A focusout whose relatedTarget is
// null is IGNORED: clicking a non-focusable part of the open panel (the "Shop &
// prices for" label), or any button in Safari, which does not focus buttons on
// click, blurs to <body> with relatedTarget null, and closing there would
// close the menu under the user's click. Escape returns focus to the trigger
// (the wrapper's first <button>) only if focus was inside, so it never pulls
// focus away from a dialog or field elsewhere. The listeners exist only while
// open, and `close` is held in a ref so an inline arrow doesn't resubscribe them
// on every render.
//
// Why this exists (2026-09-23): both popovers used to close ONLY on an outside
// mousedown. Measured at 1440, 390 and 844x390: after Enter then Escape the
// market panel's aria-expanded was still true, and after tabbing nine times
// out of it the panel stayed open over the page.
export function useDismiss(ref: RefObject<HTMLElement>, open: boolean, close: () => void) {
  const cb = useRef(close);
  cb.current = close;
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const hadFocus = el.contains(document.activeElement);
      cb.current();
      if (hadFocus) el.querySelector<HTMLElement>("button")?.focus();
    };
    const onOut = (e: FocusEvent) => {
      const to = e.relatedTarget as Node | null;
      if (to && !el.contains(to)) cb.current();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    el.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      el.removeEventListener("focusout", onOut);
    };
  }, [ref, open]);
}
