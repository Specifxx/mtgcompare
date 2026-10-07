"use client";

import { useEffect, useState } from "react";

// RiftCompare's useConsent: resolves whether measurement may run. With an IAB
// TCF consent platform on the page it waits for the visitor's choice (purpose 1,
// "store and/or access information"); without one, it grants after a short
// grace period (CMP_GRACE_MS), because the visitor is outside any CMP's scope.
//
// OP Compare runs no CMP today, so the no-CMP path is the live one. Unlike
// RiftCompare it does NOT push a gtag consent update on that path: OP Compare's
// GA defaults are region-scoped (lib/ga.ts — analytics denied in the EEA, the
// UK and Switzerland, granted elsewhere) and must stand when no one was asked.
// What the hook gates is Vercel Analytics (ConsentGatedAnalytics), which is
// cookieless. When a CMP is added, its grant also updates GA, as on RiftCompare.
export const CMP_GRACE_MS = 2500;

type TcData = {
  gdprApplies?: boolean;
  eventStatus?: string;
  purpose?: { consents?: Record<string, boolean> };
};
type TcfApi = (command: string, version: number, callback: (tcData: TcData, success: boolean) => void, parameter?: unknown) => void;

export type ConsentState = {
  analytics: boolean;
  cmpPresent: boolean;
};

let pushedConsentUpdate = false;

export function useConsent(): ConsentState {
  const [state, setState] = useState<ConsentState>({ analytics: false, cmpPresent: false });
  useEffect(() => {
    const w = window as unknown as { __tcfapi?: TcfApi; gtag?: (...args: unknown[]) => void };
    let settled = false;
    const grant = (cmpPresent: boolean) => {
      if (settled) return;
      settled = true;
      if (cmpPresent && !pushedConsentUpdate) {
        pushedConsentUpdate = true;
        w.gtag?.("consent", "update", { analytics_storage: "granted" });
      }
      setState({ analytics: true, cmpPresent });
    };
    const attach = () => {
      const api = w.__tcfapi;
      if (!api) return false;
      setState((s) => ({ ...s, cmpPresent: true }));
      api("addEventListener", 2, (tcData, success) => {
        if (!success || !tcData) return;
        if (tcData.gdprApplies === false) return grant(true);
        if (tcData.eventStatus !== "useractioncomplete" && tcData.eventStatus !== "tcloaded") return;
        if (tcData.purpose?.consents?.["1"]) grant(true);
      });
      return true;
    };
    if (attach()) return;
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (settled) return window.clearInterval(poll);
      if (attach()) return window.clearInterval(poll);
      if (Date.now() - started >= CMP_GRACE_MS) {
        window.clearInterval(poll);
        grant(false); // no CMP ⇒ the visitor is outside its scope
      }
    }, 250);
    return () => window.clearInterval(poll);
  }, []);
  return state;
}
