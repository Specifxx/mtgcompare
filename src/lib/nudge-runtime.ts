"use client";

// THE BROWSER HALF OF THE CORNER NUDGES' MANNERS (RiftCompare's
// lib/nudge-runtime.ts). lib/nudge-gate.ts decides WHO may be asked and WHEN in
// the visit; this file decides whether THIS MOMENT is a decent one, and owns the
// timer that waits for it. Shared by PremiumSlideIn and AnnualSwitchNudge.
//   • armNudge         the show timer. Cancelled while a dialog or drawer is
//                      open or a text field has focus, restarted when that
//                      ends, and re-checked when it fires.
//   • useSessionViews  distinct page views this visit (tab), reloads not counted.
//
// "A dialog is open" = body[data-oc-dialog="1"] (PlanDialog sets it) or any
// [aria-modal="true"] element on the page (the phone menu, QuickView …), so a
// new modal is respected without having to know about this file.

import { useEffect, useState } from "react";
import { isTextEntry, quietWaitMs, type QuietInput } from "./nudge-gate";

let watching = false;
let dialogOpen = false;
let lastDialogClosedAt = -Infinity;
let lastScrollAt = -Infinity;
let lastKeyAt = -Infinity;
const dialogListeners = new Set<(open: boolean) => void>();

export function anyDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.dataset.ocDialog === "1") return true;
  // An aria-modal element only counts while it is actually showing: the phone
  // nav menu stays mounted when closed, wrapped in aria-hidden/inert, and must
  // not read as "a dialog is open" (it silenced every corner nudge, the launch
  // popup included).
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).some((el) => !el.closest('[aria-hidden="true"], [inert]'));
}

function ensureWatchers(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  dialogOpen = anyDialogOpen();
  let queued = false;
  const check = () => {
    queued = false;
    const open = anyDialogOpen();
    if (open === dialogOpen) return;
    dialogOpen = open;
    if (!open) lastDialogClosedAt = Date.now();
    dialogListeners.forEach((fn) => fn(open));
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(check);
  }).observe(document.body, { attributes: true, attributeFilter: ["data-oc-dialog", "aria-modal"], childList: true, subtree: true });
  window.addEventListener("scroll", () => (lastScrollAt = Date.now()), { passive: true, capture: true });
  document.addEventListener("keydown", () => (lastKeyAt = Date.now()), { passive: true, capture: true });
}

function readQuietInput(): QuietInput {
  const now = Date.now();
  return {
    dialogOpen: anyDialogOpen(),
    inputFocused: isTextEntry(document.activeElement as HTMLElement | null),
    sinceDialogClosedMs: now - lastDialogClosedAt,
    sinceScrollMs: now - lastScrollAt,
    sinceKeyMs: now - lastKeyAt,
  };
}

/**
 * Start a nudge's show timer; returns its cleanup. `onFire` runs once, after
 * `delayMs` and only at a quiet moment (nudge-gate.ts quietWaitMs).
 */
export function armNudge({ delayMs, onFire }: { delayMs: number; onFire: () => void }): () => void {
  ensureWatchers();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (ms: number) => {
    clear();
    if (!done) timer = setTimeout(attempt, ms);
  };
  const busy = () => anyDialogOpen() || isTextEntry(document.activeElement as HTMLElement | null);
  const attempt = () => {
    timer = undefined;
    if (done) return;
    const wait = quietWaitMs(readQuietInput());
    if (wait > 0) return schedule(wait);
    done = true;
    onFire();
  };

  const onFocusIn = (e: FocusEvent) => {
    if (isTextEntry(e.target as HTMLElement | null)) clear();
  };
  // activeElement is still the old field during focusout; look one tick later.
  const onFocusOut = () =>
    setTimeout(() => {
      if (!done && timer === undefined && !busy()) schedule(delayMs);
    }, 0);
  const onDialog = (open: boolean) => {
    if (open) clear();
    else if (!done && !busy()) schedule(delayMs);
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  dialogListeners.add(onDialog);
  if (!busy()) schedule(delayMs);

  return () => {
    done = true;
    clear();
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    dialogListeners.delete(onDialog);
  };
}

const memory = new Map<string, number>();
const memoryLast = new Map<string, string>();

/**
 * Count `pathname` as a page view under `key` (sessionStorage, so a new tab is
 * a new visit) unless it is the page counted last: a reload or a re-render is
 * not a second page. Returns the running total.
 */
export function countSessionView(key: string, pathname: string): number {
  const lastKey = `${key}_last`;
  try {
    const n = Number(sessionStorage.getItem(key) ?? "0") || 0;
    if (sessionStorage.getItem(lastKey) === pathname) return n;
    sessionStorage.setItem(key, String(n + 1));
    sessionStorage.setItem(lastKey, pathname);
    return n + 1;
  } catch {
    // Storage blocked: count in memory (resets on a full reload: fewer asks).
    if (memoryLast.get(key) !== pathname) {
      memory.set(key, (memory.get(key) ?? 0) + 1);
      memoryLast.set(key, pathname);
    }
    return memory.get(key) ?? 0;
  }
}

export function useSessionViews(key: string, pathname: string | null, enabled: boolean): number {
  // 0 until THIS pathname is counted, so a render that sees a new path never
  // pairs it with the previous page's total.
  const [state, setState] = useState<{ path: string | null; views: number }>({ path: null, views: 0 });
  useEffect(() => {
    if (!enabled || !pathname) return;
    setState({ path: pathname, views: countSessionView(key, pathname) });
  }, [key, pathname, enabled]);
  return state.path === pathname ? state.views : 0;
}

export function readStoredNum(store: Storage | null | undefined, key: string): number {
  try {
    return Number(store?.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}
