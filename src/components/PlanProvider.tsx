"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Tier } from "@/lib/plans";
import { firePlanClick } from "@/lib/nudge-surface";
import type { OAuthProvider } from "@/lib/oauth";
import { PlanDialog } from "./PlanDialog";

// The site-wide Plus/Premium dialog (RiftCompare's PremiumDialogProvider), so a
// visitor who hits a wall can check out from where they are instead of being
// sent to /premium first. Mounted ONCE in the root layout; any client component
// opens it with usePlanDialog()?.open(surface, { tier }).
//
// `checkoutOpen` is stripeEnabled(), read by the layout from the environment.
// It is NOT a session read (the root layout never reads the session); who the
// visitor is comes from useMe() inside the dialog, which asks /api/me only when
// the mc_auth hint cookie exists.
export interface PlanDialogApi {
  open: (surface: string, opts?: { tier?: Tier }) => void;
  checkoutOpen: boolean;
}

const PlanDialogContext = createContext<PlanDialogApi | null>(null);

/** The dialog's opener, or null when no PlanProvider is mounted (PlanButton then links to /premium). */
export function usePlanDialog(): PlanDialogApi | null {
  return useContext(PlanDialogContext);
}

// `providers` (enabledProviders(), also an environment read) feeds the
// dialog's signed-out AuthForm.
export function PlanProvider({ checkoutOpen, providers = [], children }: { checkoutOpen: boolean; providers?: OAuthProvider[]; children: React.ReactNode }) {
  const [state, setState] = useState<{ tier: Tier; surface: string } | null>(null);
  const open = useCallback((surface: string, opts?: { tier?: Tier }) => {
    const tier: Tier = opts?.tier === "premium" ? "premium" : "plus";
    // Fire-and-forget premium-interest beacon: who opened it, from where.
    firePlanClick(surface, tier);
    setState({ tier, surface });
  }, []);
  const close = useCallback(() => setState(null), []);
  const api = useMemo(() => ({ open, checkoutOpen }), [open, checkoutOpen]);
  return (
    <PlanDialogContext.Provider value={api}>
      {children}
      {state ? <PlanDialog initialTier={state.tier} surface={state.surface} checkoutOpen={checkoutOpen} providers={providers} onClose={close} /> : null}
    </PlanDialogContext.Provider>
  );
}
