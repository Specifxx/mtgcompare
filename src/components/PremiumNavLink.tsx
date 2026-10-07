"use client";

import Link from "next/link";
import { firePlanClick } from "@/lib/nudge-surface";

// RiftCompare's PremiumNavLink: a plain link to /premium that records the
// premium-interest beacon (surface "nav:navbar", "nav:sidebar", "nav:menu"…)
// before navigating. Used for every "Pricing" link in the chrome. Members never
// see it: each call site hides it for a Plus/Premium account, and `memberHint`
// also hides it at first paint for a returning member (the oc_adfree hint,
// lib/ad-free.ts) so it does not flash in before /api/me answers.
export function PremiumNavLink({
  href = "/premium",
  className,
  children,
  onClick,
  "aria-label": ariaLabel,
  title,
  surface = "nav:link",
  memberHint = true,
}: {
  surface?: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
  memberHint?: boolean;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      title={title}
      data-ad-placement={memberHint ? "pricing-link" : undefined}
      onClick={() => {
        firePlanClick(surface);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
