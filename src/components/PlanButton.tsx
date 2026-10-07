"use client";

import Link from "next/link";
import { TIER_NAMES, planPrice, type Tier } from "@/lib/plans";
import { firePlanClick } from "@/lib/nudge-surface";
import { useMe } from "@/lib/use-me";
import { usePlanDialog } from "./PlanProvider";

// Opens the Plus/Premium dialog from a wall (RiftCompare's PremiumButton).
//   surface  WHERE the button sits ("gate:deck-watch", "nudge:movers" …,
//            lib/nudge-surface.ts), recorded by the premium-interest beacon.
//   tier     the LOWEST tier that unlocks what the wall guards: the dialog
//            opens on it and the default label quotes its price. Default
//            "plus", the cheaper honest answer to "what does this cost me".
// Without a PlanProvider mounted it is a plain link to /premium (with the
// same beacon), so it can never be a dead button.
export default function PlanButton({ surface, tier = "plus", className, children }: { surface: string; tier?: "plus" | "premium"; className?: string; children?: React.ReactNode }) {
  const dialog = usePlanDialog();
  const { me } = useMe();
  const cls = className ?? "btn-primary";
  const label =
    children ??
    (me.tier === "plus" && tier === "premium"
      ? "Upgrade to Premium"
      : dialog && !dialog.checkoutOpen
        ? `See ${TIER_NAMES[tier]}`
        : `Get ${TIER_NAMES[tier]} · ${planPrice(tier, "month")}/mo`);
  if (!dialog) {
    return (
      <Link href="/premium" className={cls} onClick={() => firePlanClick(surface, tier)}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => dialog.open(surface, { tier })}>
      {label}
    </button>
  );
}

/**
 * A plain "Pricing" link to /premium that fires the premium-interest beacon
 * (RiftCompare's PremiumNavLink): the header, the rail foot, the avatar menu.
 * No dialog in between: someone who asks for pricing gets the pricing page.
 */
export function PricingLink({
  surface,
  className,
  children,
  role,
  onClick,
  memberHint = false,
}: {
  surface: string;
  className?: string;
  children: React.ReactNode;
  role?: string;
  onClick?: () => void;
  /** Hide at first paint for a returning member (the oc_adfree hint, lib/ad-free.ts). */
  memberHint?: boolean;
}) {
  return (
    <Link
      href="/premium"
      role={role}
      data-ad-placement={memberHint ? "pricing-link" : undefined}
      className={className}
      onClick={() => {
        firePlanClick(surface);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
