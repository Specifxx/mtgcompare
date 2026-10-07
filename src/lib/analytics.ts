"use client";

import { GA_ENABLED } from "./ga";

// Shared custom-event helper — RiftCompare's lib/analytics.ts trackEvent(),
// ported in wave 2 (2026-10-03). The single place a UI handler fires an event,
// so call sites never hand-roll `window.gtag?.(...)`.
//
// OP Compare sends custom events to GA4 ONLY (src/lib/ga.ts, its own property):
// no NEXT_PUBLIC_GA_ID → no gtag on the page → this is a no-op. RiftCompare also
// mirrors most events to Vercel Analytics, which bills custom events against a
// monthly quota; OP Compare's page views still reach Vercel through <Analytics />,
// but no custom event does, so there is no quota for a high-volume event to burn.
//
// Params may be `undefined` (present only at call sites that have the data) —
// stripped before GA sees them rather than sent as a literal `undefined`, which
// would show up as a real (if empty) dimension in GA4's event parameter report.

type Gtag = (...args: unknown[]) => void;

export function cleanEventParams(
  params?: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> | undefined {
  return params
    ? (Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>)
    : undefined;
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean | undefined>): void {
  if (!GA_ENABLED || typeof window === "undefined") return;
  try {
    (window as unknown as { gtag?: Gtag }).gtag?.("event", name, cleanEventParams(params));
  } catch {
    /* analytics must never break the click it is attached to */
  }
}
