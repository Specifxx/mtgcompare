"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePresence, DUR } from "@/lib/motion";

// ── Shared, refcounted body-level side effects ──────────────────────────────
// All three hooks are exported so CinematicNavMenu — the one overlay that
// stays permanently mounted and toggles via classes instead of mount/unmount —
// can opt into the SAME scroll lock, the SAME `ocDialog` flag and the SAME
// Escape stack (useEscapeLayer, below) every Dialog instance uses, rather than
// keeping its own separate copies (which is how it used to work, and why the
// phone nav menu never made the corner nudges yield the way every other
// overlay did).
//
// Refcounted, not a plain boolean: two overlays can legitimately be open at
// once (a PriceAlertModal opened from inside the still-open phone nav menu),
// so the lock/flag must only clear once the LAST one closes, not the first.
let scrollLockCount = 0;
let prevBodyOverflow = "";
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLockCount === 0) {
      prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount++;
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = prevBodyOverflow;
    };
  }, [active]);
}

let modalFlagCount = 0;
/**
 * Sets `document.body.dataset.ocDialog = "1"` while ANY Dialog-based overlay
 * is mounted — the signal the corner nudges (PremiumSlideIn and
 * AnnualSwitchNudge, through lib/nudge-runtime.ts) check before showing
 * themselves, so a nudge never pops up over an open dialog.
 */
export function useModalFlag(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (modalFlagCount === 0) document.body.dataset.ocDialog = "1";
    modalFlagCount++;
    return () => {
      modalFlagCount = Math.max(0, modalFlagCount - 1);
      if (modalFlagCount === 0) delete document.body.dataset.ocDialog;
    };
  }, [active]);
}

// Escape closes the TOPMOST layer only. Every open overlay pushes an id when it
// becomes active and pops it on cleanup; each listener acts only if its id is
// on top. All listeners run synchronously in the same keydown dispatch, while
// the top layer's id is still on the stack (it is popped in effect cleanup, after
// unmount), so exactly one layer closes per key press. Lower layers always
// registered earlier, so they run first and see they are not on top.
//
// 2026-09-23: before this, every mounted Dialog, the nav menu and the ⌘K
// provider each closed on ANY Escape, so one key press on a Report or
// Watch-price dialog opened from QuickView also closed QuickView (and ran its
// history.back()).
const escStack: symbol[] = [];
export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const id = Symbol("escape-layer");
    escStack.push(id);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && escStack[escStack.length - 1] === id) cb.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = escStack.indexOf(id);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [active]);
}

export type DialogSize = "md" | "lg" | "xl" | "2xl" | "3xl";
export type DialogPlacement = "center" | "top" | "sheet" | "right";
export type DialogZ = "overlay" | "modal" | "sheet";

// Literal strings, not `max-w-${size}` — Tailwind's content scanner only picks
// up class names it can see verbatim in source, so an interpolated utility
// name would silently never be generated.
const SIZE_CLASS: Record<DialogSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};
const Z_CLASS: Record<DialogZ, string> = {
  overlay: "z-overlay",
  modal: "z-modal",
  sheet: "z-sheet",
};

/**
 * The overlay shell every dialog/sheet on the site should be built on —
 * introduced to replace seven hand-rolled modals (QuickView, SealedQuickView,
 * PremiumDialog, CommandLauncher, PriceAlertModal, ReportPriceButton,
 * FeedbackWidget) that each reimplemented scroll lock, Escape and (in six of
 * the seven cases) had no focus trap and no focus restore at all.
 *
 * Owns: mount/unmount + enter/exit timing (usePresence), scroll lock, the
 * `ocDialog` flag, Escape-to-close (topmost layer only, via useEscapeLayer), a
 * Tab focus trap, and focus save/restore.
 * Does NOT own header/body/footer chrome, backdrop click semantics beyond
 * "closes", or business logic — those stay with each caller.
 *
 * `placement="center"` reuses the scroll-safe shape PremiumDialog introduced
 * (see its own history): the OVERLAY scrolls, not the card, `h-[100dvh]` +
 * safe-area padding so iOS Safari's browser chrome never eats the close
 * button on a short phone. `placement="top"` is the same shell anchored near
 * the top instead of vertically centered (CommandLauncher's shape — a long
 * result list reads better anchored than centered). `placement="sheet"` is a
 * true bottom sheet below `sm`, a centred dialog from `sm` up.
 *
 * Dialog portals into `document.body` (2026-09-23), so an inline consumer
 * (ReportPriceButton inside QuickView or CardMarketSection) no longer inherits
 * the caller's `text-align` (it rendered centred inside `text-center`
 * wrappers) or gets trapped in a transformed ancestor's containing block and
 * stacking context (QuickView's panel sized the "sheet" to itself). Each
 * portal appends in open order, so a later dialog paints over an earlier one
 * at equal z — the ⌘K launcher used to paint BEHIND an open QuickView at the
 * same z-60 purely because of DOM order. React context and synthetic events
 * still flow through the React tree, so a parent's onClick/onKeyDown still
 * sees events from a portaled child dialog.
 */
export function Dialog({
  open,
  onClose,
  children,
  label,
  labelledBy,
  size = "md",
  placement = "center",
  z = "modal",
  initialFocusRef,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  size?: DialogSize;
  placement?: DialogPlacement;
  z?: DialogZ;
  initialFocusRef?: RefObject<HTMLElement>;
  className?: string;
}) {
  const { mounted, entered } = usePresence(open, DUR.fast);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useScrollLock(mounted);
  useModalFlag(mounted);
  useEscapeLayer(mounted, onClose);

  // The opener, read when `open` flips true: one commit BEFORE the panel
  // mounts, because usePresence sets `mounted` from an effect. A child's native
  // autoFocus (CommandLauncher's search input) fires during the mount commit
  // itself, so by the [mounted] effect below activeElement is already that
  // child, and "restoring" to it on close focused a node being removed. Focus
  // fell to <body>, which mattered once Escape started closing only the top
  // layer (2026-09-23): ⌘K over QuickView, Escape, and Tab walked the page
  // behind the still-open QuickView.
  const openedFrom = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) openedFrom.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Escape-to-close (useEscapeLayer, above) + focus save/restore bracket the
  // whole MOUNTED lifetime, not just `open` — so the exit transition can still
  // play with focus already back on the trigger, and a second dialog opening
  // mid-exit can't steal the restore target.
  useEffect(() => {
    if (!mounted) return;
    const active = document.activeElement as HTMLElement | null;
    previouslyFocused.current = active && panelRef.current?.contains(active) ? openedFrom.current : active;
    return () => {
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Move focus in once the panel exists and has finished entering. Defers to
  // whatever already grabbed focus (a consumer's native `autoFocus` input,
  // e.g. CommandLauncher's search field) rather than stealing it back — and
  // otherwise honours the same `[data-autofocus]` marker CinematicNavMenu
  // already used before Dialog existed.
  useEffect(() => {
    if (!entered) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.contains(document.activeElement)) return;
    const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>("[data-autofocus]");
    if (target) {
      target.focus();
    } else {
      // The panel fallback (tabIndex={-1} below, 2026-09-23) only exists to
      // hold focus inside the dialog, so it must not move anything. Focusing
      // a panel taller than the viewport scrolled the overlay by 33px on
      // PremiumDialog at 390x844, which put its ✕ at y=-16.
      panel.focus({ preventScroll: true });
    }
  }, [entered, initialFocusRef]);

  // Same Tab-loop algorithm as CinematicNavMenu, the site's one existing
  // focus-trapped overlay before this file.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // The panel itself holds focus when no child asked for it (the panel
    // fallback above). It is not in `focusables`, so without this Shift+Tab
    // from it escapes to the page behind the backdrop.
    if (document.activeElement === panelRef.current) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  const ariaProps = labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": label };

  if (placement === "right") {
    // A right-edge drawer: full viewport height, slides in from off-screen
    // rather than fading+scaling like the centered shapes. Introduced for the
    // watchlist (2026-09-22, owner: "the watchlist button should open a side
    // tab not go to a separate page") — a list you check and dismiss reads
    // better as a panel beside the page you were on than as a full navigation.
    // `sm:max-w-*` still applies (SIZE_CLASS), but below `sm` the panel is the
    // full viewport width, same reasoning as the bottom sheet's phone case.
    return createPortal(
      <div className={`fixed inset-0 ${Z_CLASS[z]} h-[100dvh]`} role="dialog" aria-modal="true" {...ariaProps}>
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-base ${entered ? "opacity-100" : "motion-safe:opacity-0"}`}
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={panelRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className={`card-surface absolute inset-y-0 right-0 flex w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-none border-l border-ink-800 pb-[env(safe-area-inset-bottom)] transition-transform ease-out ${
            entered ? "duration-base translate-x-0" : "duration-fast motion-safe:translate-x-full"
          } text-left focus:outline-none ${className}`}
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  if (placement === "sheet") {
    return createPortal(
      <div className={`fixed inset-0 ${Z_CLASS[z]} flex items-end justify-center p-0 sm:items-center sm:p-4`} role="dialog" aria-modal="true" {...ariaProps}>
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-base ${entered ? "opacity-100" : "motion-safe:opacity-0"}`}
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={panelRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className={`card-surface relative max-h-[92vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-b-none transition-[opacity,transform] ease-out sm:rounded-xl ${
            entered
              ? "duration-base translate-y-0 opacity-100 sm:scale-100"
              : "duration-fast motion-safe:translate-y-full motion-safe:opacity-0 sm:motion-safe:translate-y-2 sm:motion-safe:scale-[0.98]"
          } text-left focus:outline-none ${className}`}
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className={`fixed inset-0 ${Z_CLASS[z]} h-[100dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]`}
      role="dialog"
      aria-modal="true"
      {...ariaProps}
    >
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-base ${entered ? "opacity-100" : "motion-safe:opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div className={`relative flex min-h-full justify-center ${placement === "top" ? "items-start pt-[7vh]" : "items-center"}`}>
        <div
          ref={panelRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className={`relative w-full ${SIZE_CLASS[size]} transition-[opacity,transform] ease-out ${
            entered
              ? "duration-base translate-y-0 scale-100 opacity-100"
              : "duration-fast motion-safe:translate-y-2 motion-safe:scale-[0.98] motion-safe:opacity-0"
          } text-left focus:outline-none ${className}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
