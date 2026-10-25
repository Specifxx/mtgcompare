"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";

// Vercel Web Analytics, PAGE VIEWS ONLY (owner, 2026-10-25: "it says zero visitors" — it had been switched off for cost on
// 2026-10-22). Custom events stay off (src/lib/track.ts is a no-op): each one is another billed event. The query string is dropped
// from every page view so what a visitor typed into search is never sent.
function stripQuery(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const u = new URL(event.url);
    if (u.search) return { ...event, url: `${u.origin}${u.pathname}` };
  } catch {
    /* not a URL we can parse: send as-is */
  }
  return event;
}

export function VercelPageViews() {
  return <Analytics beforeSend={stripQuery} />;
}
