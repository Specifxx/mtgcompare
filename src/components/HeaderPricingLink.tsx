"use client";

import { useMe } from "@/lib/use-me";
import { PremiumNavLink } from "./PremiumNavLink";

// The header's two "Pricing" positions (RiftCompare's PremiumNavLink in its
// Navbar). Hidden for a Plus/Premium account: at first paint by the mc_adfree
// hint (PremiumNavLink's memberHint), and for good once /api/me answers.
export function HeaderPricingLink({ surface, className, children }: { surface: string; className?: string; children: React.ReactNode }) {
  const { me } = useMe();
  if (me.tier) return null;
  return (
    <PremiumNavLink surface={surface} className={className}>
      {children}
    </PremiumNavLink>
  );
}
