// Google Analytics 4 events (owner, 2026-10-23: GA4 is free; Vercel Web Analytics stays OFF, src/lib/track.ts). A no-op unless
// NEXT_PUBLIC_GA_ID is set at build: then SiteAnalytics loads gtag.js after the page is idle and this sends one event per call.
// No cookie is read by our code, nothing is sent from a server, and the pages stay one CDN copy for everyone.
export const GA_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };

export function gaEvent(name: string, params: Record<string, string | number | boolean | null | undefined> = {}): void {
  if (!GA_ID || typeof window === "undefined") return;
  const w = window as GtagWindow;
  if (typeof w.gtag !== "function") {
    // gtag.js not loaded yet (it loads when the page is idle): queue the call the way its own snippet does.
    w.dataLayer ??= [];
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  w.gtag("event", name, params);
}
