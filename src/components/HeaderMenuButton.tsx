"use client";

import { NavIcon } from "./NavIcon";
import { useMegaMenu } from "./MegaMenuProvider";

// The phone/tablet menu button (RiftCompare's HeaderMenuButton): the header's
// right-most control below lg, opening the full-screen CinematicNavMenu. It is
// the TOP edge of the viewport, which never moves when mobile browser chrome
// collapses — the reason RiftCompare replaced its bottom tab bar with it.
export function HeaderMenuButton({ className = "" }: { className?: string }) {
  const { setOpen, open } = useMegaMenu();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`tap-icon rounded-lg text-slate-200 transition-colors hover:bg-ink-800 hover:text-white ${className}`}
    >
      <NavIcon name="menu" className="h-5 w-5" />
    </button>
  );
}
