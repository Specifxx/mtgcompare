"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PlanButton from "./PlanButton";
import { useMe } from "@/lib/use-me";
import { FREE_LIMIT_POPOVER, freeLimitHeadline, freeLimitPopoverTop, type FreeLimitKind } from "@/lib/free-limits";
import { TIER_NAMES, planPrice } from "@/lib/plans";

// THE UPGRADE PROMPT AT THE LIMIT — RiftCompare's FreeLimitPanel, ported in
// wave 2 (2026-10-03; RiftCompare's owner: "Put the upgrade prompt where
// people hit a limit — their 11th watchlist card … not in popups and headers").
//
// Rendered only as the answer to an add the free account could not make — the
// heart, "Add to collection", the paste import — right where that add was
// tried. Never on a timer, never on page load. It states the real count, says
// nothing already tracked is lost, and offers Plus (the lowest tier that lifts
// the limit) through PlanButton, attributed to `limit:watchlist` /
// `limit:portfolio`.
//
// The pitch promises an email at your own price only once a mailer is
// configured (me.emailOn); until then Plus "flags" it.
export function freeLimitPitch(kind: FreeLimitKind, emailOn: boolean, context?: "set"): string {
  const tier = TIER_NAMES.plus;
  const price = `${planPrice("plus", "month")}/mo`;
  if (kind === "portfolio" && context === "set") {
    return `${tier} tracks unlimited cards, so a whole set fits — ${price}. Nobody loses cards they already have: everything already in your binder stays.`;
  }
  return kind === "watchlist"
    ? `${tier} watches unlimited cards and ${emailOn ? "can email you at your own price" : "flags your own target price"} — ${price}. Everything you already watch stays.`
    : `${tier} tracks unlimited cards in your portfolio — ${price}. Everything already in it stays and keeps its value.`;
}

export function FreeLimitPanel({
  kind,
  count,
  onClose,
  className = "",
  context,
}: {
  kind: FreeLimitKind;
  /** Distinct cards the account holds (the route's `count`). */
  count: number;
  onClose?: () => void;
  className?: string;
  /** Where the tap happened, for the wording: a tick on a set page. */
  context?: "set";
}) {
  const { me } = useMe();
  return (
    <div role="status" data-free-limit={kind} className={`rounded-xl border border-ink-600 bg-ink-900 p-3 text-left ${className}`}>
      <p className="text-sm font-semibold text-white">{freeLimitHeadline(kind, count)}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{freeLimitPitch(kind, me.emailOn, context)}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PlanButton tier="plus" surface={`limit:${kind}`} />
        {onClose && (
          <button type="button" onClick={onClose} className="tap-link text-xs text-slate-400 hover:text-white">
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The same panel for a control too small to hold it (a tile's heart): shown
 * beside the control that was just tapped, closed by Escape, an outside tap or
 * a scroll. Portalled, so a tile's overflow can't clip it. `z-modal`, so it
 * paints over the phone buy bar, sheets, menus and any Dialog the heart can
 * sit in (QuickView renders the inline panel instead, `limitInline`).
 *
 * Placed BELOW the anchor when it fits and ABOVE it otherwise, clamped to the
 * viewport (lib/free-limits.ts freeLimitPopoverTop). Measured on a hidden first
 * pass, so it never flashes in the wrong place.
 */
export function FreeLimitPopover({ anchor, kind, count, onClose }: { anchor: HTMLElement | null; kind: FreeLimitKind; count: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; measured: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const { width, gutter } = FREE_LIMIT_POPOVER;
    const left = Math.max(gutter, Math.min(window.innerWidth - width - gutter, r.right - width));
    const h = ref.current?.offsetHeight;
    if (h == null) {
      setPos({ top: r.bottom + 8, left, measured: false });
      return;
    }
    setPos({ top: freeLimitPopoverTop(r, h, window.innerHeight), left, measured: true });
  }, [anchor, pos?.measured]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const scroll = () => onClose();
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("scroll", scroll);
    };
  }, [anchor, onClose]);

  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: FREE_LIMIT_POPOVER.width, visibility: pos.measured ? "visible" : "hidden" }}
      className={`${FREE_LIMIT_POPOVER.zClass} shadow-2xl`}
    >
      <FreeLimitPanel kind={kind} count={count} onClose={onClose} />
    </div>,
    document.body,
  );
}
